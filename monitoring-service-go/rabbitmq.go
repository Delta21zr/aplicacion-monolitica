package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	TelemetryExchange   = "monolito.telemetry"
	HealthEventsQueue   = "monolito.health.events"
	RequestEventsQueue  = "monolito.request.events"
	HealthRoutingKey    = "health.#"
	RequestRoutingKey   = "request.#"
)

type RabbitMQStatus struct {
	Status            string `json:"status"` // UP | DOWN
	URL               string `json:"url"`
	Exchange          string `json:"exchange"`
	HealthQueue       string `json:"health_queue"`
	RequestQueue      string `json:"request_queue"`
	MessagesPublished int64  `json:"messages_published"`
	MessagesConsumed  int64  `json:"messages_consumed"`
	LastMessageAt     string `json:"last_message_at"`
	LastError         string `json:"last_error,omitempty"`
}

type RabbitMQBroker struct {
	mu                sync.RWMutex
	url               string
	conn              *amqp.Connection
	pubCh             *amqp.Channel
	connected         bool
	messagesPublished int64
	messagesConsumed  int64
	lastMessageAt     time.Time
	lastError         string
	onHealthEvent     func(HealthEvent)
	onRequestEvent    func(RequestEvent)
}

func NewRabbitMQBroker(onHealth func(HealthEvent), onRequest func(RequestEvent)) *RabbitMQBroker {
	url := os.Getenv("RABBITMQ_URL")
	if url == "" {
		url = "amqp://guest:guest@localhost:5672/"
	}
	return &RabbitMQBroker{
		url:            url,
		onHealthEvent:  onHealth,
		onRequestEvent: onRequest,
	}
}

func (b *RabbitMQBroker) Start() {
	go b.connectLoop()
}

func (b *RabbitMQBroker) connectLoop() {
	for {
		if err := b.connectAndConsume(); err != nil {
			b.mu.Lock()
			b.connected = false
			b.lastError = err.Error()
			b.mu.Unlock()
			log.Printf("[RabbitMQ] Conexión no disponible (%v). Reintentando en 5s...", err)
			time.Sleep(5 * time.Second)
			continue
		}
		// Si connectAndConsume retorna nil es porque se cerró la conexión; reintentar
		time.Sleep(3 * time.Second)
	}
}

func (b *RabbitMQBroker) connectAndConsume() error {
	conn, err := amqp.DialConfig(b.url, amqp.Config{
		Dial: amqp.DefaultDial(3 * time.Second),
	})
	if err != nil {
		return err
	}

	pubCh, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return err
	}

	subCh, err := conn.Channel()
	if err != nil {
		_ = pubCh.Close()
		_ = conn.Close()
		return err
	}

	// Declarar exchange tipo topic
	if err := pubCh.ExchangeDeclare(
		TelemetryExchange,
		"topic",
		true,  // durable
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		_ = subCh.Close()
		_ = pubCh.Close()
		_ = conn.Close()
		return err
	}

	// Declarar colas y bindings
	queues := []struct {
		name string
		key  string
	}{
		{HealthEventsQueue, HealthRoutingKey},
		{RequestEventsQueue, RequestRoutingKey},
	}

	for _, q := range queues {
		if _, err := subCh.QueueDeclare(q.name, true, false, false, false, nil); err != nil {
			_ = subCh.Close()
			_ = pubCh.Close()
			_ = conn.Close()
			return err
		}
		if err := subCh.QueueBind(q.name, q.key, TelemetryExchange, false, nil); err != nil {
			_ = subCh.Close()
			_ = pubCh.Close()
			_ = conn.Close()
			return err
		}
	}

	healthMsgs, err := subCh.Consume(HealthEventsQueue, "monitoring-health-consumer", true, false, false, false, nil)
	if err != nil {
		_ = subCh.Close()
		_ = pubCh.Close()
		_ = conn.Close()
		return err
	}

	reqMsgs, err := subCh.Consume(RequestEventsQueue, "monitoring-request-consumer", true, false, false, false, nil)
	if err != nil {
		_ = subCh.Close()
		_ = pubCh.Close()
		_ = conn.Close()
		return err
	}

	b.mu.Lock()
	b.conn = conn
	b.pubCh = pubCh
	b.connected = true
	b.lastError = ""
	b.mu.Unlock()

	log.Printf("[RabbitMQ] Conectado a %s | Exchange: %s | Colas: %s, %s", b.url, TelemetryExchange, HealthEventsQueue, RequestEventsQueue)

	closeChan := make(chan *amqp.Error, 1)
	conn.NotifyClose(closeChan)

	for {
		select {
		case msg, ok := <-healthMsgs:
			if !ok {
				return nil
			}
			var ev HealthEvent
			if err := json.Unmarshal(msg.Body, &ev); err == nil {
				ev.ViaRabbitMQ = true
				b.mu.Lock()
				b.messagesConsumed++
				b.lastMessageAt = time.Now()
				b.mu.Unlock()
				if b.onHealthEvent != nil {
					b.onHealthEvent(ev)
				}
			}
		case msg, ok := <-reqMsgs:
			if !ok {
				return nil
			}
			var ev RequestEvent
			if err := json.Unmarshal(msg.Body, &ev); err == nil {
				ev.ViaRabbitMQ = true
				b.mu.Lock()
				b.messagesConsumed++
				b.lastMessageAt = time.Now()
				b.mu.Unlock()
				if b.onRequestEvent != nil {
					b.onRequestEvent(ev)
				}
			}
		case amqpErr := <-closeChan:
			b.mu.Lock()
			b.connected = false
			if amqpErr != nil {
				b.lastError = amqpErr.Error()
			}
			b.mu.Unlock()
			return amqpErr
		}
	}
}

func (b *RabbitMQBroker) PublishHealthEvent(ev HealthEvent) bool {
	return b.publish("health."+ev.ServiceID, ev)
}

func (b *RabbitMQBroker) PublishRequestEvent(ev RequestEvent) bool {
	return b.publish("request."+ev.Method, ev)
}

func (b *RabbitMQBroker) publish(routingKey string, payload interface{}) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.connected || b.pubCh == nil {
		return false
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = b.pubCh.PublishWithContext(ctx, TelemetryExchange, routingKey, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Timestamp:    time.Now(),
		Body:         body,
	})
	if err != nil {
		b.lastError = err.Error()
		b.connected = false
		return false
	}

	b.messagesPublished++
	b.lastMessageAt = time.Now()
	return true
}

func (b *RabbitMQBroker) GetStatus() RabbitMQStatus {
	b.mu.RLock()
	defer b.mu.RUnlock()

	status := "DOWN"
	if b.connected {
		status = "UP"
	}
	lastMsg := ""
	if !b.lastMessageAt.IsZero() {
		lastMsg = b.lastMessageAt.Format(time.RFC3339)
	}
	return RabbitMQStatus{
		Status:            status,
		URL:               "amqp://localhost:5672/",
		Exchange:          TelemetryExchange,
		HealthQueue:       HealthEventsQueue,
		RequestQueue:      RequestEventsQueue,
		MessagesPublished: b.messagesPublished,
		MessagesConsumed:  b.messagesConsumed,
		LastMessageAt:     lastMsg,
		LastError:         b.lastError,
	}
}

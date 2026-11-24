package main

import (
	"fmt"
	"math"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

type ServiceTarget struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"` // microservice | infrastructure | frontend
	Port     string `json:"port"`
	ProbeURL string `json:"probe_url,omitempty"`
	TCPAddr  string `json:"tcp_addr,omitempty"`
}

type HealthEvent struct {
	ServiceID   string  `json:"service_id"`
	ServiceName string  `json:"service_name"`
	Category    string  `json:"category"`
	Port        string  `json:"port"`
	Status      string  `json:"status"` // UP | DOWN
	StatusCode  int     `json:"status_code"`
	LatencyMs   float64 `json:"latency_ms"`
	ErrorMsg    string  `json:"error,omitempty"`
	Timestamp   string  `json:"timestamp"`
	ViaRabbitMQ bool    `json:"via_rabbitmq"`
}

type RequestEvent struct {
	ID          string  `json:"id"`
	Service     string  `json:"service"`
	Method      string  `json:"method"` // GET | POST | PUT | DELETE | PATCH
	Path        string  `json:"path"`
	StatusCode  int     `json:"status_code"`
	LatencyMs   float64 `json:"latency_ms"`
	Timestamp   string  `json:"timestamp"`
	ViaRabbitMQ bool    `json:"via_rabbitmq"`
}

type ServiceStatusSnapshot struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Category        string  `json:"category"`
	Port            string  `json:"port"`
	Status          string  `json:"status"` // UP | DOWN
	StatusCode      int     `json:"status_code"`
	LatencyMs       float64 `json:"latency_ms"`
	AvgLatencyMs    float64 `json:"avg_latency_ms"`
	MinLatencyMs    float64 `json:"min_latency_ms"`
	MaxLatencyMs    float64 `json:"max_latency_ms"`
	UptimePct       float64 `json:"uptime_pct"`
	TotalChecks     int64   `json:"total_checks"`
	SuccessChecks   int64   `json:"success_checks"`
	LastCheck       string  `json:"last_check"`
	LastError       string  `json:"last_error,omitempty"`
	ViaRabbitMQ     bool    `json:"via_rabbitmq"`
	latencySum      float64
	recentLatencies []float64
}

type LatencyPoint struct {
	Timestamp    string             `json:"timestamp"`
	Label        string             `json:"label"`
	AvgLatencyMs float64            `json:"avg_latency_ms"`
	P95LatencyMs float64            `json:"p95_latency_ms"`
	MaxLatencyMs float64            `json:"max_latency_ms"`
	UpCount      int                `json:"up_count"`
	DownCount    int                `json:"down_count"`
	PerService   map[string]float64 `json:"per_service"`
}

type RequestTypeStat struct {
	Method       string  `json:"method"`
	Count        int64   `json:"count"`
	ErrorCount   int64   `json:"error_count"`
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	MaxLatencyMs float64 `json:"max_latency_ms"`
	SharePct     float64 `json:"share_pct"`
	latencySum   float64
}

type MonitorStore struct {
	mu              sync.RWMutex
	targets         []ServiceTarget
	services        map[string]*ServiceStatusSnapshot
	latencyTimeline []LatencyPoint
	requestStats    map[string]*RequestTypeStat
	recentRequests  []RequestEvent
	totalRequests   int64
	broker          *RabbitMQBroker
	httpClient      *http.Client
}

func NewMonitorStore() *MonitorStore {
	targets := []ServiceTarget{
		{ID: "user-service", Name: "User & License Service", Category: "microservice", Port: ":3002", ProbeURL: "http://localhost:3002/health"},
		{ID: "catalog-service", Name: "Catalog Service", Category: "microservice", Port: ":8081", ProbeURL: "http://localhost:8081/health"},
		{ID: "inventory-service", Name: "Inventory Service", Category: "microservice", Port: ":8082", ProbeURL: "http://localhost:8082/health"},
		{ID: "cart-service", Name: "Cart Service", Category: "microservice", Port: ":8083", ProbeURL: "http://localhost:8083/health"},
		{ID: "order-service", Name: "Order & Payment Service", Category: "microservice", Port: ":8084", ProbeURL: "http://localhost:8084/health"},
		{ID: "shipping-service", Name: "Shipping Service", Category: "microservice", Port: ":8085", ProbeURL: "http://localhost:8085/health"},
		{ID: "interaction-service", Name: "Interaction Service", Category: "microservice", Port: ":8086", ProbeURL: "http://localhost:8086/health"},
		{ID: "billing-service", Name: "Billing Service", Category: "microservice", Port: ":8087", ProbeURL: "http://localhost:8087/health"},
		{ID: "monitoring-service", Name: "Monitoring Service (Self)", Category: "microservice", Port: ":8088", ProbeURL: "http://localhost:8088/health"},
		{ID: "frontend-vite", Name: "Frontend Web (Vite)", Category: "frontend", Port: ":5173", TCPAddr: "localhost:5173"},
		{ID: "postgres-db", Name: "PostgreSQL Database", Category: "infrastructure", Port: ":5432", TCPAddr: "localhost:5432"},
		{ID: "mongodb-db", Name: "MongoDB Catalog DB", Category: "infrastructure", Port: ":27017", TCPAddr: "localhost:27017"},
		{ID: "redis-cache", Name: "Redis Cart Cache", Category: "infrastructure", Port: ":6379", TCPAddr: "localhost:6379"},
		{ID: "rabbitmq-broker", Name: "RabbitMQ Broker", Category: "infrastructure", Port: ":5672", TCPAddr: "localhost:5672"},
	}

	services := make(map[string]*ServiceStatusSnapshot, len(targets))
	for _, t := range targets {
		services[t.ID] = &ServiceStatusSnapshot{
			ID:       t.ID,
			Name:     t.Name,
			Category: t.Category,
			Port:     t.Port,
			Status:   "DOWN",
		}
	}

	methods := []string{"GET", "POST", "PUT", "DELETE"}
	reqStats := make(map[string]*RequestTypeStat, len(methods))
	for _, m := range methods {
		reqStats[m] = &RequestTypeStat{Method: m}
	}

	s := &MonitorStore{
		targets:      targets,
		services:     services,
		requestStats: reqStats,
		httpClient: &http.Client{
			Timeout: 2500 * time.Millisecond,
		},
	}

	s.broker = NewRabbitMQBroker(s.applyHealthEvent, s.applyRequestEvent)
	return s
}

func (s *MonitorStore) Start() {
	s.broker.Start()

	// Esperar un instante para que el servidor HTTP local y RabbitMQ inicien
	go func() {
		time.Sleep(1200 * time.Millisecond)
		s.RunProbeCycle()

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.RunProbeCycle()
		}
	}()
}

func (s *MonitorStore) RunProbeCycle() {
	var wg sync.WaitGroup
	results := make([]HealthEvent, len(s.targets))

	for i, target := range s.targets {
		wg.Add(1)
		go func(idx int, t ServiceTarget) {
			defer wg.Done()
			ev := s.probeTarget(t)
			results[idx] = ev

			// Publicar evento en RabbitMQ; si RabbitMQ no está listo aún, aplicar directamente en memoria
			if !s.broker.PublishHealthEvent(ev) {
				s.applyHealthEvent(ev)
			}

			// Para microservicios HTTP, también registrar telemetría de request GET /health vía RabbitMQ
			if t.ProbeURL != "" {
				reqEv := RequestEvent{
					ID:         fmt.Sprintf("req-%d-%s", time.Now().UnixNano(), t.ID),
					Service:    t.Name,
					Method:     "GET",
					Path:       "/health",
					StatusCode: ev.StatusCode,
					LatencyMs:  ev.LatencyMs,
					Timestamp:  ev.Timestamp,
				}
				if !s.broker.PublishRequestEvent(reqEv) {
					s.applyRequestEvent(reqEv)
				}
			}
		}(i, target)
	}

	wg.Wait()
	s.recordTimelinePoint(results)
}

func (s *MonitorStore) probeTarget(t ServiceTarget) HealthEvent {
	now := time.Now()
	ev := HealthEvent{
		ServiceID:   t.ID,
		ServiceName: t.Name,
		Category:    t.Category,
		Port:        t.Port,
		Status:      "DOWN",
		Timestamp:   now.Format(time.RFC3339),
	}

	if t.ProbeURL != "" {
		start := time.Now()
		resp, err := s.httpClient.Get(t.ProbeURL)
		elapsed := float64(time.Since(start).Microseconds()) / 1000.0
		ev.LatencyMs = round2(elapsed)

		if err != nil {
			ev.Status = "DOWN"
			ev.StatusCode = 0
			ev.ErrorMsg = err.Error()
			return ev
		}
		defer resp.Body.Close()
		ev.StatusCode = resp.StatusCode
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			ev.Status = "UP"
		} else {
			ev.Status = "DOWN"
			ev.ErrorMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return ev
	}

	if t.TCPAddr != "" {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", t.TCPAddr, 2*time.Second)
		elapsed := float64(time.Since(start).Microseconds()) / 1000.0
		ev.LatencyMs = round2(elapsed)
		if err != nil {
			ev.Status = "DOWN"
			ev.StatusCode = 0
			ev.ErrorMsg = err.Error()
			return ev
		}
		_ = conn.Close()
		ev.Status = "UP"
		ev.StatusCode = 200
	}

	return ev
}

func (s *MonitorStore) applyHealthEvent(ev HealthEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	snap, exists := s.services[ev.ServiceID]
	if !exists {
		snap = &ServiceStatusSnapshot{
			ID:       ev.ServiceID,
			Name:     ev.ServiceName,
			Category: ev.Category,
			Port:     ev.Port,
		}
		s.services[ev.ServiceID] = snap
	}

	snap.Status = ev.Status
	snap.StatusCode = ev.StatusCode
	snap.LatencyMs = ev.LatencyMs
	snap.LastCheck = ev.Timestamp
	snap.LastError = ev.ErrorMsg
	snap.ViaRabbitMQ = ev.ViaRabbitMQ
	snap.TotalChecks++
	if ev.Status == "UP" {
		snap.SuccessChecks++
		snap.latencySum += ev.LatencyMs
		if snap.MinLatencyMs == 0 || ev.LatencyMs < snap.MinLatencyMs {
			snap.MinLatencyMs = ev.LatencyMs
		}
		if ev.LatencyMs > snap.MaxLatencyMs {
			snap.MaxLatencyMs = ev.LatencyMs
		}
		snap.AvgLatencyMs = round2(snap.latencySum / float64(snap.SuccessChecks))
		snap.recentLatencies = append(snap.recentLatencies, ev.LatencyMs)
		if len(snap.recentLatencies) > 40 {
			snap.recentLatencies = snap.recentLatencies[len(snap.recentLatencies)-40:]
		}
	}
	if snap.TotalChecks > 0 {
		snap.UptimePct = round2((float64(snap.SuccessChecks) / float64(snap.TotalChecks)) * 100.0)
	}
}

func (s *MonitorStore) applyRequestEvent(ev RequestEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	method := strings.ToUpper(strings.TrimSpace(ev.Method))
	if method == "" {
		method = "GET"
	}
	ev.Method = method
	if ev.Timestamp == "" {
		ev.Timestamp = time.Now().Format(time.RFC3339)
	}
	if ev.ID == "" {
		ev.ID = fmt.Sprintf("req-%d", time.Now().UnixNano())
	}

	stat, exists := s.requestStats[method]
	if !exists {
		stat = &RequestTypeStat{Method: method}
		s.requestStats[method] = stat
	}

	stat.Count++
	stat.latencySum += ev.LatencyMs
	stat.AvgLatencyMs = round2(stat.latencySum / float64(stat.Count))
	if ev.LatencyMs > stat.MaxLatencyMs {
		stat.MaxLatencyMs = ev.LatencyMs
	}
	if ev.StatusCode == 0 || ev.StatusCode >= 400 {
		stat.ErrorCount++
	}

	s.totalRequests++
	s.recentRequests = append([]RequestEvent{ev}, s.recentRequests...)
	if len(s.recentRequests) > 60 {
		s.recentRequests = s.recentRequests[:60]
	}
}

func (s *MonitorStore) recordTimelinePoint(results []HealthEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	var latencies []float64
	var sum float64
	var maxLat float64
	upCount := 0
	downCount := 0
	perSvc := make(map[string]float64, len(results))

	for _, r := range results {
		perSvc[r.ServiceID] = r.LatencyMs
		if r.Status == "UP" {
			upCount++
			latencies = append(latencies, r.LatencyMs)
			sum += r.LatencyMs
			if r.LatencyMs > maxLat {
				maxLat = r.LatencyMs
			}
		} else {
			downCount++
		}
	}

	avgLat := 0.0
	p95Lat := 0.0
	if len(latencies) > 0 {
		avgLat = round2(sum / float64(len(latencies)))
		sort.Float64s(latencies)
		p95Idx := int(math.Ceil(0.95*float64(len(latencies)))) - 1
		if p95Idx < 0 {
			p95Idx = 0
		}
		if p95Idx >= len(latencies) {
			p95Idx = len(latencies) - 1
		}
		p95Lat = round2(latencies[p95Idx])
	}

	pt := LatencyPoint{
		Timestamp:    now.Format(time.RFC3339),
		Label:        now.Format("15:04:05"),
		AvgLatencyMs: avgLat,
		P95LatencyMs: p95Lat,
		MaxLatencyMs: round2(maxLat),
		UpCount:      upCount,
		DownCount:    downCount,
		PerService:   perSvc,
	}

	s.latencyTimeline = append(s.latencyTimeline, pt)
	if len(s.latencyTimeline) > 45 {
		s.latencyTimeline = s.latencyTimeline[len(s.latencyTimeline)-45:]
	}
}

func (s *MonitorStore) IngestRequestEvent(ev RequestEvent) RequestEvent {
	ev.Method = strings.ToUpper(strings.TrimSpace(ev.Method))
	if ev.Method == "" {
		ev.Method = "GET"
	}
	if ev.Timestamp == "" {
		ev.Timestamp = time.Now().Format(time.RFC3339)
	}
	if ev.ID == "" {
		ev.ID = fmt.Sprintf("req-%d", time.Now().UnixNano())
	}

	published := s.broker.PublishRequestEvent(ev)
	ev.ViaRabbitMQ = published
	if !published {
		s.applyRequestEvent(ev)
	}
	return ev
}

func (s *MonitorStore) GetStatusResponse() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]ServiceStatusSnapshot, 0, len(s.targets))
	upCount := 0
	downCount := 0
	var latSum float64
	var latList []float64

	for _, t := range s.targets {
		if snap, ok := s.services[t.ID]; ok {
			list = append(list, *snap)
			if snap.Status == "UP" {
				upCount++
				latSum += snap.LatencyMs
				latList = append(latList, snap.LatencyMs)
			} else {
				downCount++
			}
		}
	}

	avgLat := 0.0
	p95Lat := 0.0
	if len(latList) > 0 {
		avgLat = round2(latSum / float64(len(latList)))
		sort.Float64s(latList)
		idx := int(math.Ceil(0.95*float64(len(latList)))) - 1
		if idx < 0 {
			idx = 0
		}
		p95Lat = round2(latList[idx])
	}

	overall := "HEALTHY"
	if downCount > 0 && upCount > 0 {
		overall = "DEGRADED"
	} else if upCount == 0 {
		overall = "CRITICAL"
	}

	return map[string]interface{}{
		"overall_status": overall,
		"summary": map[string]interface{}{
			"total_services": len(list),
			"up_count":       upCount,
			"down_count":     downCount,
			"avg_latency_ms": avgLat,
			"p95_latency_ms": p95Lat,
			"total_requests": s.totalRequests,
		},
		"services":   list,
		"rabbitmq":   s.broker.GetStatus(),
		"updated_at": time.Now().Format(time.RFC3339),
	}
}

func (s *MonitorStore) GetMetricsResponse() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	order := []string{"GET", "POST", "PUT", "DELETE", "PATCH"}
	reqTypes := make([]RequestTypeStat, 0, len(s.requestStats))
	seen := make(map[string]bool)

	for _, m := range order {
		if st, ok := s.requestStats[m]; ok {
			cp := *st
			if s.totalRequests > 0 {
				cp.SharePct = round2((float64(cp.Count) / float64(s.totalRequests)) * 100.0)
			}
			reqTypes = append(reqTypes, cp)
			seen[m] = true
		}
	}
	for m, st := range s.requestStats {
		if !seen[m] {
			cp := *st
			if s.totalRequests > 0 {
				cp.SharePct = round2((float64(cp.Count) / float64(s.totalRequests)) * 100.0)
			}
			reqTypes = append(reqTypes, cp)
		}
	}

	timeline := make([]LatencyPoint, len(s.latencyTimeline))
	copy(timeline, s.latencyTimeline)

	recent := make([]RequestEvent, len(s.recentRequests))
	copy(recent, s.recentRequests)

	return map[string]interface{}{
		"latency_timeline": timeline,
		"request_types":    reqTypes,
		"recent_requests":  recent,
		"total_requests":   s.totalRequests,
		"rabbitmq":         s.broker.GetStatus(),
		"updated_at":       time.Now().Format(time.RFC3339),
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

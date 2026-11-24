package main

import (
	"fmt"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	store := NewMonitorStore()
	store.Start()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check propio
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":   "OK",
			"service":  "monitoring-service-go",
			"rabbitmq": store.broker.GetStatus().Status,
		})
	})

	api := r.Group("/api/monitoring")
	{
		// Estado de servicios (UP/DOWN), latencia actual y estado de RabbitMQ
		api.GET("/status", func(c *gin.Context) {
			c.JSON(http.StatusOK, store.GetStatusResponse())
		})

		// Métricas de tiempo/latencia y distribución por tipo de request (GET, POST, PUT, DELETE)
		api.GET("/metrics", func(c *gin.Context) {
			c.JSON(http.StatusOK, store.GetMetricsResponse())
		})

		// Ejecutar sondeo inmediato bajo demanda
		api.POST("/probe", func(c *gin.Context) {
			store.RunProbeCycle()
			c.JSON(http.StatusOK, gin.H{
				"message": "Sondeo de salud completado y publicado en RabbitMQ",
				"status":  store.GetStatusResponse(),
			})
		})

		// Recibir evento de request HTTP y publicarlo en RabbitMQ
		api.POST("/events", func(c *gin.Context) {
			var ev RequestEvent
			if err := c.ShouldBindJSON(&ev); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Payload inválido: " + err.Error()})
				return
			}
			if ev.Service == "" {
				ev.Service = "API Gateway"
			}
			if ev.Path == "" {
				ev.Path = "/api/unknown"
			}
			if ev.StatusCode == 0 {
				ev.StatusCode = 200
			}
			result := store.IngestRequestEvent(ev)
			c.JSON(http.StatusAccepted, gin.H{
				"message": "Evento publicado",
				"event":   result,
			})
		})

		// Generar tráfico de prueba real de distintos tipos (GET, POST, PUT, DELETE) a través de RabbitMQ
		api.POST("/simulate", func(c *gin.Context) {
			samples := []struct {
				Service string
				Method  string
				Path    string
				BaseMs  float64
				Status  int
			}{
				{"Catalog Service", "GET", "/api/catalog/products", 8.5, 200},
				{"User & License Service", "POST", "/api/users/system/tokens/consume", 14.2, 200},
				{"Cart Service", "PUT", "/api/cart/items/qty", 6.4, 200},
				{"Inventory Service", "GET", "/api/inventory/stock", 9.8, 200},
				{"Order & Payment Service", "POST", "/api/orders/checkout", 28.4, 201},
				{"Cart Service", "DELETE", "/api/cart/items/remove", 7.1, 200},
				{"Billing Service", "POST", "/api/billing/invoices", 19.6, 201},
				{"Shipping Service", "PUT", "/api/shipping/status", 12.3, 200},
			}

			published := 0
			for _, smp := range samples {
				jitter := (rand.Float64() * 8.0) - 2.0
				lat := round2(smp.BaseMs + jitter)
				if lat < 1.2 {
					lat = 1.2
				}
				ev := store.IngestRequestEvent(RequestEvent{
					ID:         fmt.Sprintf("sim-%d-%s", time.Now().UnixNano(), smp.Method),
					Service:    smp.Service,
					Method:     smp.Method,
					Path:       smp.Path,
					StatusCode: smp.Status,
					LatencyMs:  lat,
					Timestamp:  time.Now().Format(time.RFC3339),
				})
				if ev.ViaRabbitMQ {
					published++
				}
			}

			// También ejecutar un ciclo de probe para actualizar la gráfica de latencia/tiempo
			store.RunProbeCycle()

			c.JSON(http.StatusOK, gin.H{
				"message":             "Eventos de telemetría enviados vía RabbitMQ",
				"events_sent":         len(samples),
				"published_rabbitmq":  published,
			})
		})
	}

	r.Run(":8088")
}

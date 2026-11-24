package main

import (
	"log"

	"billing-service-go/config"
	"billing-service-go/controllers"
	"billing-service-go/services"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. Inicializar conexión a base de datos (con fallback de memoria resiliente)
	config.ConnectDB()

	// 2. Inicializar servicio de integración Profact (en modo Simulación por defecto)
	services.InitProfactService()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Accept, Origin, ngrok-skip-browser-warning")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api/billing")
	{
		// Endpoints de Emisión y Timbrado
		api.POST("/order/:orderId", controllers.FacturarOrden)
		api.POST("/facturar", controllers.FacturarDirecto)

		// Endpoints de Consulta y Descarga
		api.GET("/invoices", controllers.GetInvoices)
		api.GET("/invoices/:id", controllers.GetInvoiceByID)
		api.GET("/invoices/:id/xml", controllers.DownloadXML)
		api.GET("/invoices/:id/pdf", controllers.GetInvoicePreviewHTML)
		api.GET("/invoices/:id/preview", controllers.GetInvoicePreviewHTML)
		api.GET("/order/:orderId/invoice", controllers.GetInvoiceByOrderID)

		// Cancelación de comprobantes
		api.POST("/cancelar/:uuid", controllers.CancelarFactura)

		// Configuración del PAC Profact (Simulación vs Sandbox vs Producción)
		api.GET("/config", controllers.GetConfig)
		api.POST("/config", controllers.UpdateConfig)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "OK",
			"service": "Billing Service (Profact CFDI 4.0)",
			"mode":    services.GlobalProfactService.Config.Modo,
		})
	})

	log.Println("🚀 [Billing Service] Microservicio de Facturación Profact activo en http://localhost:8087")
	if err := r.Run(":8087"); err != nil {
		log.Fatalf("Error al iniciar Billing Service: %v", err)
	}
}

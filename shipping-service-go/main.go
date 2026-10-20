package main

import (
	"shipping-service-go/config"
	"shipping-service-go/controllers"

	"github.com/gin-gonic/gin"
)

func main() {
	// Conectar a PostgreSQL
	config.ConnectDB()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Accept, Origin")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api/shipping")
	{
		api.POST("/calculate", controllers.CalculateRates)
		api.POST("/shipments", controllers.CreateShipment)
		api.PUT("/shipments/:trackingNumber/status", controllers.UpdateShipmentStatus)
		api.GET("/shipments/track/:trackingNumber", controllers.TrackShipment)
		api.GET("/shipments/order/:orderId", controllers.GetShipmentByOrder)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OK", "service": "Logistics & Shipping Service"})
	})

	// Ejecuta en el puerto 8085
	r.Run(":8085")
}

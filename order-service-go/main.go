package main

import (
	"order-service-go/config"
	"order-service-go/controllers"

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

	api := r.Group("/api/orders")
	{
		api.POST("/checkout", controllers.Checkout)
		api.GET("/user/:userId", controllers.GetOrdersByUser)
		api.GET("/:orderId", controllers.GetOrderByID)
		api.GET("/:orderId/receipt", controllers.GetReceipt)
		api.PUT("/:orderId/status", controllers.UpdateOrderStatus)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OK", "service": "Order & Payments Service"})
	})

	// Ejecuta en el puerto 8084
	r.Run(":8084")
}

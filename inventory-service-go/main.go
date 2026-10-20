package main

import (
	"inventory-service-go/config"
	"inventory-service-go/controllers"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database connection
	config.ConnectDB()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	api := r.Group("/api/inventory")
	{
		api.GET("/", controllers.GetAllStock)
		api.GET("/:productId", controllers.GetStock)
		api.POST("/update", controllers.UpdateStock)
		api.POST("/", controllers.AddProductToInventory)
		api.DELETE("/:productId", controllers.DeleteInventoryItem)
	}

	r.Run(":8082") // Inventory service runs on 8082
}

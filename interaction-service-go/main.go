package main

import (
	"interaction-service-go/config"
	"interaction-service-go/controllers"

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

	api := r.Group("/api/interactions")
	{
		// Reseñas y calificaciones
		api.POST("/reviews", controllers.CreateReview)
		api.GET("/reviews/product/:productId", controllers.GetProductReviews)

		// Listas de deseos (Wishlists)
		api.POST("/wishlists", controllers.CreateWishlist)
		api.GET("/wishlists/user/:userId", controllers.GetWishlistsByUser)
		api.POST("/wishlists/:wishlistId/items", controllers.AddWishlistItem)
		api.DELETE("/wishlists/:wishlistId/items/:productId", controllers.RemoveWishlistItem)
		api.GET("/wishlists/share/:shareToken", controllers.GetSharedWishlist)

		// Notificaciones automáticas / emails transaccionales
		api.POST("/notifications/email", controllers.SendEmailNotification)
		api.GET("/notifications/user/:userId", controllers.GetUserNotifications)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OK", "service": "Interaction, Reviews & Support Service"})
	})

	// Ejecuta en el puerto 8086
	r.Run(":8086")
}

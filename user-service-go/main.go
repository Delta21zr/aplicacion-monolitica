package main

import (
	"user-service-go/config"
	"user-service-go/controllers"
	"user-service-go/middlewares"

	"github.com/gin-gonic/gin"
)

func main() {
	// Conectar a PostgreSQL (misma base de datos que la de Node.js)
	config.ConnectDB()

	// Iniciar router Gin (equivalente a Express)
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

	// Rutas públicas (Auth)
	auth := r.Group("/api/auth")
	{
		auth.POST("/register", controllers.Register)
		auth.POST("/login", controllers.Login)
		auth.POST("/logout", controllers.Logout)
		auth.POST("/recover", controllers.RecoverPassword)
		auth.POST("/reset", controllers.ResetPassword)
	}

	// Rutas protegidas (Users)
	users := r.Group("/api/users")
	users.Use(middlewares.VerifyToken()) // Aplica el middleware a este grupo
	{
		// Perfil
		users.GET("/profile", func(c *gin.Context) {
			userID, _ := c.Get("userID")
			c.JSON(200, gin.H{"message": "Perfil autorizado desde Go!", "userID": userID})
		})
		users.PUT("/profile", controllers.UpdateProfile)

		// Direcciones
		users.POST("/addresses", controllers.AddAddress)
		users.GET("/addresses", controllers.GetAddresses)
		users.PUT("/addresses/:id", controllers.UpdateAddress)
		users.DELETE("/addresses/:id", controllers.DeleteAddress)

		// Métodos de Pago
		users.POST("/payment-methods", controllers.AddPaymentMethod)
		users.GET("/payment-methods", controllers.GetPaymentMethods)
		users.DELETE("/payment-methods/:id", controllers.DeletePaymentMethod)
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OK", "service": "User Service (Go version)"})
	})

	// Ejecutar en el puerto 3002 para no chocar con Node.js que está en el 3001
	r.Run(":3002")
}

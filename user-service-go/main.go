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

	// Rutas de Licenciamiento Comercial del Sistema (SaaS B2B por Tiers y Tokens)
	r.GET("/api/users/system/license", controllers.GetSystemLicenseOverview)
	r.POST("/api/users/system/activate-tier", controllers.ActivateSystemTier)
	r.POST("/api/users/system/tokens/purchase", controllers.PurchaseSystemTokens)
	r.POST("/api/users/system/tokens/addon", controllers.PurchaseSystemAddon)
	r.POST("/api/users/system/tokens/consume", controllers.ConsumeSystemTokens)

	// Rutas públicas de Suscripciones por Tier y Paquetes de Tokens
	r.GET("/api/users/subscriptions/plans", controllers.GetSubscriptionPlans)
	r.GET("/api/users/tokens/packages", controllers.GetTokenPackages)

	// Rutas protegidas (Users)
	users := r.Group("/api/users")
	users.Use(middlewares.VerifyToken()) // Aplica el middleware a este grupo
	{
		// Perfil
		users.GET("/profile", controllers.GetProfile)
		users.PUT("/profile", controllers.UpdateProfile)

		// Gestión de Suscripciones por Tier (mediante Tokens)
		users.GET("/subscription", controllers.GetUserSubscription)
		users.POST("/subscription/subscribe", controllers.Subscribe)
		users.POST("/subscription/cancel", controllers.CancelSubscription)

		// Billetera y Compra de Tokens
		users.GET("/tokens/wallet", controllers.GetTokenWallet)
		users.POST("/tokens/purchase", controllers.PurchaseTokens)

		// Direcciones
		users.POST("/addresses", controllers.AddAddress)
		users.GET("/addresses", controllers.GetAddresses)
		users.PUT("/addresses/:id", controllers.UpdateAddress)
		users.DELETE("/addresses/:id", controllers.DeleteAddress)

		// Métodos de Pago
		users.POST("/payment-methods", controllers.AddPaymentMethod)
		users.GET("/payment-methods", controllers.GetPaymentMethods)
		users.DELETE("/payment-methods/:id", controllers.DeletePaymentMethod)

		// Rutas exclusivas para Administrador (Manejo de Tiers, Tokens y Roles)
		admin := users.Group("/admin")
		admin.Use(middlewares.RequireRole("admin"))
		{
			admin.GET("/users", controllers.AdminGetAllUsers)
			admin.PUT("/users/:id/subscription", controllers.AdminUpdateUserSubscription)
			admin.POST("/users/:id/tokens", controllers.AdminUpdateUserTokens)
			admin.PUT("/users/:id/role", controllers.AdminUpdateUserRole)
			admin.GET("/stats", controllers.AdminGetStats)
		}
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OK", "service": "User Service (Go version)"})
	})

	// Ejecutar en el puerto 3002 para no chocar con Node.js que está en el 3001
	r.Run(":3002")
}

package main

import (
	"cart-service-go/config"
	"cart-service-go/controllers"

	"github.com/gin-gonic/gin"
)

func main() {
	config.ConnectRedis()

	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api/cart")
	{
		api.GET("/:userId", controllers.GetCart)
		api.POST("/:userId", controllers.AddItem)
		api.PUT("/:userId/items/:productId", controllers.UpdateItemQuantity)
		api.DELETE("/:userId/items/:productId", controllers.RemoveItem)
		api.POST("/:userId/coupon", controllers.ApplyCoupon)
		api.DELETE("/:userId/coupon", controllers.RemoveCoupon)
	}

	r.Run(":8083") // Cart Service runs on 8083
}

package controllers

import (
	"net/http"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
)

type PaymentMethodInput struct {
	CardBrand   string `json:"card_brand" binding:"required"`
	LastFour    string `json:"last_four" binding:"required,len=4"`
	StripeToken string `json:"stripe_token" binding:"required"`
	IsDefault   bool   `json:"is_default"`
}

func AddPaymentMethod(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input PaymentMethodInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Si es default, quitamos el default a las demás
	if input.IsDefault {
		config.DB.Exec("UPDATE payment_methods SET is_default = false WHERE user_id = $1", userID)
	}

	var newID string
	err := config.DB.QueryRow(
		`INSERT INTO payment_methods (user_id, card_brand, last_four, stripe_token, is_default) 
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		userID, input.CardBrand, input.LastFour, input.StripeToken, input.IsDefault,
	).Scan(&newID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error saving payment method"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Payment method added", "id": newID})
}

func GetPaymentMethods(c *gin.Context) {
	userID, _ := c.Get("userID")

	rows, err := config.DB.Query("SELECT id, card_brand, last_four, is_default FROM payment_methods WHERE user_id = $1", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error fetching payment methods"})
		return
	}
	defer rows.Close()

	var methods []map[string]interface{}
	for rows.Next() {
		var id, cardBrand, lastFour string
		var isDefault bool
		rows.Scan(&id, &cardBrand, &lastFour, &isDefault)
		methods = append(methods, map[string]interface{}{
			"id":         id,
			"card_brand": cardBrand,
			"last_four":  lastFour,
			"is_default": isDefault,
		})
	}

	c.JSON(http.StatusOK, methods)
}

func DeletePaymentMethod(c *gin.Context) {
	userID, _ := c.Get("userID")
	methodID := c.Param("id")

	res, err := config.DB.Exec("DELETE FROM payment_methods WHERE id = $1 AND user_id = $2", methodID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error deleting payment method"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment method not found or unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Payment method deleted successfully"})
}

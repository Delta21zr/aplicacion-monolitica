package controllers

import (
	"net/http"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
)

type UpdateProfileInput struct {
	FullName string `json:"full_name" binding:"required"`
}

func UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input UpdateProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := config.DB.Exec("UPDATE users SET full_name = $1 WHERE id = $2", input.FullName, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error updating profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}

type AddressInput struct {
	Alias      string `json:"alias"`
	Street     string `json:"street" binding:"required"`
	City       string `json:"city" binding:"required"`
	ZipCode    string `json:"zip_code" binding:"required"`
	Country    string `json:"country" binding:"required"`
	IsShipping bool   `json:"is_shipping"`
	IsBilling  bool   `json:"is_billing"`
}

func AddAddress(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input AddressInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var newID string
	err := config.DB.QueryRow(
		`INSERT INTO addresses (user_id, alias, street, city, zip_code, country, is_shipping, is_billing) 
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		userID, input.Alias, input.Street, input.City, input.ZipCode, input.Country, input.IsShipping, input.IsBilling,
	).Scan(&newID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error saving address"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Address added", "id": newID})
}

func GetAddresses(c *gin.Context) {
	userID, _ := c.Get("userID")

	rows, err := config.DB.Query("SELECT id, alias, street, city, zip_code, country, is_default, is_shipping, is_billing FROM addresses WHERE user_id = $1", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error fetching addresses"})
		return
	}
	defer rows.Close()

	var addresses []map[string]interface{}
	for rows.Next() {
		var id, alias, street, city, zip_code, country string
		var is_default, is_shipping, is_billing bool
		rows.Scan(&id, &alias, &street, &city, &zip_code, &country, &is_default, &is_shipping, &is_billing)
		addresses = append(addresses, map[string]interface{}{
			"id": id, "alias": alias, "street": street, "city": city, "zip_code": zip_code, "country": country, "is_default": is_default,
			"is_shipping": is_shipping, "is_billing": is_billing,
		})
	}

	c.JSON(http.StatusOK, addresses)
}

func UpdateAddress(c *gin.Context) {
	userID, _ := c.Get("userID")
	addressID := c.Param("id")

	var input AddressInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := config.DB.Exec(
		`UPDATE addresses SET alias = $1, street = $2, city = $3, zip_code = $4, country = $5, is_shipping = $6, is_billing = $7
		 WHERE id = $8 AND user_id = $9`,
		input.Alias, input.Street, input.City, input.ZipCode, input.Country, input.IsShipping, input.IsBilling, addressID, userID,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error updating address"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Address not found or unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Address updated successfully"})
}

func DeleteAddress(c *gin.Context) {
	userID, _ := c.Get("userID")
	addressID := c.Param("id")

	res, err := config.DB.Exec("DELETE FROM addresses WHERE id = $1 AND user_id = $2", addressID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error deleting address"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Address not found or unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Address deleted successfully"})
}

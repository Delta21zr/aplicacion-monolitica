package controllers

import (
	"database/sql"
	"net/http"

	"inventory-service-go/config"
	"inventory-service-go/models"

	"github.com/gin-gonic/gin"
)

// GetStock returns the current stock of a product
func GetStock(c *gin.Context) {
	productId := c.Param("productId")

	var stock int
	query := "SELECT stock FROM inventory WHERE product_id = $1"
	err := config.DB.QueryRow(query, productId).Scan(&stock)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found in inventory"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	c.JSON(http.StatusOK, models.InventoryItem{ProductID: productId, Stock: stock})
}

// UpdateStock handles deducting or adding stock (reserves stock during checkout)
func UpdateStock(c *gin.Context) {
	var update models.StockUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not start transaction"})
		return
	}
	defer tx.Rollback()

	// Use SELECT ... FOR UPDATE to prevent race conditions (Row-level lock)
	var currentStock int
	err = tx.QueryRow("SELECT stock FROM inventory WHERE product_id = $1 FOR UPDATE", update.ProductID).Scan(&currentStock)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Product not found in inventory"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	newStock := currentStock + update.Quantity // Quantity can be negative to deduct
	if newStock < 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Insufficient stock"})
		return
	}

	_, err = tx.Exec("UPDATE inventory SET stock = $1 WHERE product_id = $2", newStock, update.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update stock"})
		return
	}

	err = tx.Commit()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not commit transaction"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Stock updated successfully", "newStock": newStock})
}

// AddProductToInventory adds a new product to tracking (admin)
func AddProductToInventory(c *gin.Context) {
	var item models.InventoryItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := config.DB.Exec("INSERT INTO inventory (product_id, stock) VALUES ($1, $2)", item.ProductID, item.Stock)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not insert inventory item"})
		return
	}

	c.JSON(http.StatusCreated, item)
}

// GetAllStock returns all inventory records
func GetAllStock(c *gin.Context) {
	rows, err := config.DB.Query("SELECT product_id, stock FROM inventory")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	var inventory []models.InventoryItem
	for rows.Next() {
		var item models.InventoryItem
		if err := rows.Scan(&item.ProductID, &item.Stock); err == nil {
			inventory = append(inventory, item)
		}
	}

	if inventory == nil {
		inventory = []models.InventoryItem{}
	}

	c.JSON(http.StatusOK, inventory)
}

// DeleteInventoryItem removes a product from inventory tracking
func DeleteInventoryItem(c *gin.Context) {
	productId := c.Param("productId")

	res, err := config.DB.Exec("DELETE FROM inventory WHERE product_id = $1", productId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not delete inventory item"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found in inventory"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Inventory item deleted successfully"})
}

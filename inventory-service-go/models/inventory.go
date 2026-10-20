package models

type InventoryItem struct {
	ProductID string `json:"productId"`
	Stock     int    `json:"stock"`
}

type StockUpdate struct {
	ProductID string `json:"productId" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required"`
}

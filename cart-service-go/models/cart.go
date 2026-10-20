package models

// Request payload from user (does NOT ask for price)
type AddItemRequest struct {
	ProductID string `json:"productId" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required"`
}

type UpdateQuantityRequest struct {
	Quantity int `json:"quantity" binding:"required"`
}

type CartItem struct {
	ProductID string  `json:"productId"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"` // Fetched from Catalog
	Name      string  `json:"name"`  // Fetched from Catalog for better UX
}

type Cart struct {
	UserID   string     `json:"userId"`
	Items    []CartItem `json:"items"`
	Coupon   string     `json:"coupon,omitempty"`
	Subtotal float64    `json:"subtotal"`
	IVA      float64    `json:"iva"`
	Discount float64    `json:"discount"`
	Total    float64    `json:"total"`
}

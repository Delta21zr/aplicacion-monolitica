package models

import "time"

type CheckoutRequest struct {
	UserID          string       `json:"user_id" binding:"required"`
	PaymentMethod   string       `json:"payment_method" binding:"required"` // 'CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL'
	CardDetails     *CardPayload `json:"card_details,omitempty"`
	PayPalOrderID   string       `json:"paypal_order_id,omitempty"`
	ShippingAddress string       `json:"shipping_address" binding:"required"`
	Notes           string       `json:"notes,omitempty"`
}

type CardPayload struct {
	CardNumber string `json:"card_number"`
	CardHolder string `json:"card_holder"`
	ExpMonth   string `json:"exp_month"`
	ExpYear    string `json:"exp_year"`
	CVV        string `json:"cvv"`
}

type OrderItem struct {
	ID        string  `json:"id,omitempty"`
	OrderID   string  `json:"order_id,omitempty"`
	ProductID string  `json:"product_id"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
	Subtotal  float64 `json:"subtotal"`
}

type Order struct {
	ID              string      `json:"id"`
	OrderNumber     string      `json:"order_number"`
	UserID          string      `json:"user_id"`
	Subtotal        float64     `json:"subtotal"`
	Discount        float64     `json:"discount"`
	IVA             float64     `json:"iva"`
	Total           float64     `json:"total"`
	Status          string      `json:"status"` // 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'
	PaymentStatus   string      `json:"payment_status"`
	PaymentMethod   string      `json:"payment_method"`
	ShippingAddress string      `json:"shipping_address"`
	CryptoSignature string      `json:"crypto_signature"`
	CreatedAt       time.Time   `json:"created_at"`
	Items           []OrderItem `json:"items,omitempty"`
	Payment         *Payment    `json:"payment,omitempty"`
	Receipt         *Receipt    `json:"receipt,omitempty"`
}

type Payment struct {
	ID             string    `json:"id"`
	OrderID        string    `json:"order_id"`
	UserID         string    `json:"user_id"`
	PaymentGateway string    `json:"payment_gateway"`
	TransactionRef string    `json:"transaction_ref"`
	Amount         float64   `json:"amount"`
	Status         string    `json:"status"`
	CardLastFour   string    `json:"card_last_four,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type Receipt struct {
	ID            string    `json:"id"`
	OrderID       string    `json:"order_id"`
	ReceiptNumber string    `json:"receipt_number"`
	ContentJSON   string    `json:"content_json"`
	CryptoHash    string    `json:"crypto_hash"`
	IssuedAt      time.Time `json:"issued_at"`
}

// Cart structs to fetch user cart from cart-service
type CartResponse struct {
	UserID   string         `json:"userId"`
	Items    []CartItemData `json:"items"`
	Coupon   string         `json:"coupon,omitempty"`
	Subtotal float64        `json:"subtotal"`
	IVA      float64        `json:"iva"`
	Discount float64        `json:"discount"`
	Total    float64        `json:"total"`
}

type CartItemData struct {
	ProductID string  `json:"productId"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
	Name      string  `json:"name"`
}

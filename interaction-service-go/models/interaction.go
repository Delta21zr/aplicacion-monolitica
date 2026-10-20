package models

import "time"

// Review models
type CreateReviewRequest struct {
	ProductID  string   `json:"product_id"`
	PropertyID string   `json:"property_id"` // Alias para sistema de hoteles/Airbnb
	HotelID    string   `json:"hotel_id"`    // Alias para sistema de hoteles/Airbnb
	ResourceID string   `json:"resource_id"` // Alias para recursos reservables
	UserID     string   `json:"user_id" binding:"required"`
	Rating     int      `json:"rating" binding:"required,min=1,max=5"`
	Title      string   `json:"title"`
	Comment    string   `json:"comment" binding:"required"`
	Photos     []string `json:"photos,omitempty"`
	Images     []string `json:"images,omitempty"`
}

type Review struct {
	ID              string    `json:"id"`
	ProductID       string    `json:"product_id"`
	UserID          string    `json:"user_id"`
	Rating          int       `json:"rating"`
	Title           string    `json:"title"`
	Comment         string    `json:"comment"`
	Photos          []string  `json:"photos"`
	IsVerifiedBuyer bool      `json:"is_verified_buyer"`
	CreatedAt       time.Time `json:"created_at"`
}

type ProductReviewsResponse struct {
	ProductID       string         `json:"product_id"`
	AverageRating   float64        `json:"average_rating"`
	TotalReviews    int            `json:"total_reviews"`
	RatingBreakdown map[int]int    `json:"rating_breakdown"` // e.g. {5: 12, 4: 3, 3: 1, 2: 0, 1: 0}
	Reviews         []Review       `json:"reviews"`
}

// Wishlist models
type CreateWishlistRequest struct {
	UserID   string `json:"user_id" binding:"required"`
	Name     string `json:"name" binding:"required"`
	IsPublic bool   `json:"is_public"`
}

type AddWishlistItemRequest struct {
	ProductID string `json:"product_id" binding:"required"`
	Notes     string `json:"notes,omitempty"`
}

type Wishlist struct {
	ID         string         `json:"id"`
	UserID     string         `json:"user_id"`
	Name       string         `json:"name"`
	IsPublic   bool           `json:"is_public"`
	ShareToken string         `json:"share_token"`
	CreatedAt  time.Time      `json:"created_at"`
	Items      []WishlistItem `json:"items,omitempty"`
}

type WishlistItem struct {
	ID         string    `json:"id"`
	WishlistID string    `json:"wishlist_id"`
	ProductID  string    `json:"product_id"`
	Notes      string    `json:"notes,omitempty"`
	AddedAt    time.Time `json:"added_at"`
}

// Notification models
type SendEmailNotificationRequest struct {
	UserID         string  `json:"user_id" binding:"required"`
	RecipientEmail string  `json:"recipient_email,omitempty"`
	Type           string  `json:"type" binding:"required"` // 'ORDER_CONFIRMATION', 'ORDER_SHIPPED', 'ORDER_DELIVERED', 'RESERVATION_CONFIRMATION', 'RESERVATION_REMINDER', 'RESERVATION_CANCELLED'
	OrderNumber    string  `json:"order_number,omitempty"`
	ReservationID  string  `json:"reservation_id,omitempty"`
	Subject        string  `json:"subject,omitempty"`
	Message        string  `json:"message,omitempty"`
	TrackingNumber string  `json:"tracking_number,omitempty"`
	Carrier        string  `json:"carrier,omitempty"`
	Total          float64 `json:"total,omitempty"`
}

type Notification struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	RecipientEmail string    `json:"recipient_email"`
	Type           string    `json:"type"`
	Subject        string    `json:"subject"`
	BodyContent    string    `json:"body_content"`
	Status         string    `json:"status"`
	SentAt         time.Time `json:"sent_at"`
}

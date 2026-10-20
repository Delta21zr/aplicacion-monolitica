package controllers

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"time"

	"interaction-service-go/config"
	"interaction-service-go/models"

	"github.com/gin-gonic/gin"
)

// Generate unique share token for wishlists (e.g., wsh-20261012-984210)
func generateShareToken() string {
	datePart := time.Now().Format("20060102")
	randomPart := rand.Intn(900000) + 100000
	return fmt.Sprintf("wsh-%s-%d", datePart, randomPart)
}

// Verify if user is a verified buyer by querying order-service
func checkIfVerifiedBuyer(userID, productID string) bool {
	orderURL := fmt.Sprintf("http://localhost:8084/api/orders/user/%s", userID)
	resp, err := http.Get(orderURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		return false
	}
	defer resp.Body.Close()

	var orders []struct {
		Status string `json:"status"`
		Items  []struct {
			ProductID string `json:"product_id"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&orders); err != nil {
		return false
	}

	for _, o := range orders {
		// Valid status: PAID, SHIPPED, DELIVERED, COMPLETED
		if o.Status == "PAID" || o.Status == "SHIPPED" || o.Status == "DELIVERED" || o.Status == "COMPLETED" {
			for _, item := range o.Items {
				if item.ProductID == productID {
					return true
				}
			}
		}
	}

	return false
}

// CreateReview registers a user review and checks verified buyer status
func CreateReview(c *gin.Context) {
	var req models.CreateReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para la reseña", "details": err.Error()})
		return
	}

	isVerified := checkIfVerifiedBuyer(req.UserID, req.ProductID)

	var newID string
	now := time.Now()
	err := config.DB.QueryRow(`
		INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_buyer, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`,
		req.ProductID, req.UserID, req.Rating, req.Title, req.Comment, isVerified, now,
	).Scan(&newID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar la reseña"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":           "Reseña publicada exitosamente",
		"review_id":         newID,
		"is_verified_buyer": isVerified,
		"rating":            req.Rating,
	})
}

// GetProductReviews returns reviews, average rating and breakdown
func GetProductReviews(c *gin.Context) {
	productID := c.Param("productId")

	rows, err := config.DB.Query(`
		SELECT id, product_id, user_id, rating, title, comment, is_verified_buyer, created_at
		FROM reviews
		WHERE product_id = $1
		ORDER BY created_at DESC`,
		productID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error consultando reseñas"})
		return
	}
	defer rows.Close()

	var reviews []models.Review
	totalRating := 0
	breakdown := map[int]int{1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

	for rows.Next() {
		var r models.Review
		if err := rows.Scan(&r.ID, &r.ProductID, &r.UserID, &r.Rating, &r.Title, &r.Comment, &r.IsVerifiedBuyer, &r.CreatedAt); err == nil {
			reviews = append(reviews, r)
			totalRating += r.Rating
			breakdown[r.Rating]++
		}
	}

	if reviews == nil {
		reviews = []models.Review{}
	}

	avgRating := 0.0
	if len(reviews) > 0 {
		avgRating = math.Round((float64(totalRating)/float64(len(reviews)))*10) / 10
	}

	c.JSON(http.StatusOK, models.ProductReviewsResponse{
		ProductID:       productID,
		AverageRating:   avgRating,
		TotalReviews:    len(reviews),
		RatingBreakdown: breakdown,
		Reviews:         reviews,
	})
}

// CreateWishlist creates a new user wishlist
func CreateWishlist(c *gin.Context) {
	var req models.CreateWishlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para crear wishlist"})
		return
	}

	shareToken := generateShareToken()
	now := time.Now()

	var wishlistID string
	err := config.DB.QueryRow(`
		INSERT INTO wishlists (user_id, name, is_public, share_token, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		req.UserID, req.Name, req.IsPublic, shareToken, now,
	).Scan(&wishlistID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al crear lista de deseos"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":     "Lista de deseos creada con éxito",
		"wishlist_id": wishlistID,
		"name":        req.Name,
		"share_token": shareToken,
		"share_url":   fmt.Sprintf("http://localhost:8086/api/interactions/wishlists/share/%s", shareToken),
	})
}

// GetWishlistsByUser returns all wishlists of a user
func GetWishlistsByUser(c *gin.Context) {
	userID := c.Param("userId")

	rows, err := config.DB.Query(`
		SELECT id, user_id, name, is_public, share_token, created_at
		FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar wishlists"})
		return
	}
	defer rows.Close()

	var wishlists []models.Wishlist
	for rows.Next() {
		var w models.Wishlist
		if err := rows.Scan(&w.ID, &w.UserID, &w.Name, &w.IsPublic, &w.ShareToken, &w.CreatedAt); err == nil {
			// Query items count
			itemRows, itemErr := config.DB.Query(`SELECT id, wishlist_id, product_id, notes, added_at FROM wishlist_items WHERE wishlist_id = $1`, w.ID)
			if itemErr == nil {
				for itemRows.Next() {
					var item models.WishlistItem
					if err := itemRows.Scan(&item.ID, &item.WishlistID, &item.ProductID, &item.Notes, &item.AddedAt); err == nil {
						w.Items = append(w.Items, item)
					}
				}
				itemRows.Close()
			}
			if w.Items == nil {
				w.Items = []models.WishlistItem{}
			}
			wishlists = append(wishlists, w)
		}
	}

	if wishlists == nil {
		wishlists = []models.Wishlist{}
	}

	c.JSON(http.StatusOK, wishlists)
}

// AddWishlistItem adds a product to a wishlist
func AddWishlistItem(c *gin.Context) {
	wishlistID := c.Param("wishlistId")

	var req models.AddWishlistItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para agregar item"})
		return
	}

	var itemID string
	err := config.DB.QueryRow(`
		INSERT INTO wishlist_items (wishlist_id, product_id, notes, added_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (wishlist_id, product_id) DO UPDATE SET notes = EXCLUDED.notes
		RETURNING id`,
		wishlistID, req.ProductID, req.Notes, time.Now(),
	).Scan(&itemID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al agregar producto a la lista"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Producto agregado a la lista de deseos", "item_id": itemID})
}

// RemoveWishlistItem deletes a product from a wishlist
func RemoveWishlistItem(c *gin.Context) {
	wishlistID := c.Param("wishlistId")
	productID := c.Param("productId")

	_, err := config.DB.Exec(`DELETE FROM wishlist_items WHERE wishlist_id = $1 AND product_id = $2`, wishlistID, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al remover producto de la lista"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Producto removido de la lista de deseos"})
}

// GetSharedWishlist returns public wishlist for sharing
func GetSharedWishlist(c *gin.Context) {
	shareToken := c.Param("shareToken")

	var w models.Wishlist
	err := config.DB.QueryRow(`
		SELECT id, user_id, name, is_public, share_token, created_at
		FROM wishlists WHERE share_token = $1`,
		shareToken,
	).Scan(&w.ID, &w.UserID, &w.Name, &w.IsPublic, &w.ShareToken, &w.CreatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lista de deseos no encontrada o enlace inválido"})
		return
	}

	if !w.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "Esta lista de deseos es privada"})
		return
	}

	// Fetch items
	rows, err := config.DB.Query(`SELECT id, wishlist_id, product_id, notes, added_at FROM wishlist_items WHERE wishlist_id = $1`, w.ID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item models.WishlistItem
			if err := rows.Scan(&item.ID, &item.WishlistID, &item.ProductID, &item.Notes, &item.AddedAt); err == nil {
				w.Items = append(w.Items, item)
			}
		}
	}

	if w.Items == nil {
		w.Items = []models.WishlistItem{}
	}

	c.JSON(http.StatusOK, w)
}

// SendEmailNotification sends automated transactional notifications
func SendEmailNotification(c *gin.Context) {
	var req models.SendEmailNotificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para notificación", "details": err.Error()})
		return
	}

	subject := "Notificación de Tienda"
	body := ""

	refID := req.OrderNumber
	if refID == "" {
		refID = req.ReservationID
	}

	switch req.Type {
	case "ORDER_CONFIRMATION":
		subject = fmt.Sprintf("¡Confirmación de Compra! Pedido #%s", refID)
		body = fmt.Sprintf("Hola! Tu pedido con número %s por un total de $%.2f ha sido procesado exitosamente. Estamos preparando tus artículos.", refID, req.Total)
	case "ORDER_SHIPPED":
		subject = fmt.Sprintf("¡Tu pedido #%s va en camino!", refID)
		body = fmt.Sprintf("Tu orden %s ha sido despachada con la paquetería %s. Tu número de guía para rastreo es: %s.", refID, req.Carrier, req.TrackingNumber)
	case "ORDER_DELIVERED":
		subject = fmt.Sprintf("Tu paquete #%s ha sido entregado", refID)
		body = fmt.Sprintf("Tu envío con guía %s ha sido entregado en tu dirección. ¡Esperamos que disfrutes tus productos!", req.TrackingNumber)
	case "RESERVATION_CONFIRMATION":
		subject = fmt.Sprintf("¡Reservación Confirmada! Folio #%s", refID)
		body = fmt.Sprintf("Tu reservación #%s ha sido confirmada exitosamente (Monto registrado: $%.2f).", refID, req.Total)
	case "RESERVATION_REMINDER":
		subject = fmt.Sprintf("Recordatorio de tu Reservación #%s", refID)
		body = fmt.Sprintf("Te recordamos que tu reservación #%s está próxima. ¡Te esperamos!", refID)
	case "RESERVATION_CANCELLED":
		subject = fmt.Sprintf("Cancelación de Reservación #%s", refID)
		body = fmt.Sprintf("Tu reservación #%s ha sido cancelada conforme a tu solicitud.", refID)
	default:
		subject = "Notificación del Sistema"
		body = "Tienes una nueva notificación en tu cuenta."
	}

	if req.Subject != "" {
		subject = req.Subject
	}
	if req.Message != "" {
		body = req.Message
	}

	now := time.Now()
	var notifID string
	err := config.DB.QueryRow(`
		INSERT INTO notifications (user_id, recipient_email, type, subject, body_content, status, sent_at)
		VALUES ($1, $2, $3, $4, $5, 'SENT', $6)
		RETURNING id`,
		req.UserID, req.RecipientEmail, req.Type, subject, body, now,
	).Scan(&notifID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al registrar la notificación"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Email transaccional procesado y enviado",
		"notification_id": notifID,
		"type":            req.Type,
		"subject":         subject,
		"status":          "SENT",
		"sent_at":         now,
	})
}

// GetUserNotifications returns user notification history
func GetUserNotifications(c *gin.Context) {
	userID := c.Param("userId")

	rows, err := config.DB.Query(`
		SELECT id, user_id, recipient_email, type, subject, body_content, status, sent_at
		FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar notificaciones"})
		return
	}
	defer rows.Close()

	var notifs []models.Notification
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.RecipientEmail, &n.Type, &n.Subject, &n.BodyContent, &n.Status, &n.SentAt); err == nil {
			notifs = append(notifs, n)
		}
	}

	if notifs == nil {
		notifs = []models.Notification{}
	}

	c.JSON(http.StatusOK, notifs)
}

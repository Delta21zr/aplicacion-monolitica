package controllers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"order-service-go/config"
	"order-service-go/models"

	"github.com/gin-gonic/gin"
)

var CryptoSecretKey = []byte("super-secure-ecommerce-signature-secret-key-2026")

// Generate unique order number (e.g. ORD-20261012-73891)
func generateOrderNumber() string {
	datePart := time.Now().Format("20060102")
	randomPart := rand.Intn(90000) + 10000
	return fmt.Sprintf("ORD-%s-%d", datePart, randomPart)
}

// Generate unique receipt number (e.g. REC-20261012-89412)
func generateReceiptNumber() string {
	datePart := time.Now().Format("20060102")
	randomPart := rand.Intn(90000) + 10000
	return fmt.Sprintf("REC-%s-%d", datePart, randomPart)
}

// Generate cryptographic HMAC-SHA256 signature
func generateCryptoSignature(orderNumber, userID string, total float64, timestamp int64) string {
	message := fmt.Sprintf("%s|%s|%.2f|%d", orderNumber, userID, total, timestamp)
	mac := hmac.New(sha256.New, CryptoSecretKey)
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// Checkout Controller
func Checkout(c *gin.Context) {
	var req models.CheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de compra inválidos", "details": err.Error()})
		return
	}

	// 1. Obtener carrito desde cart-service (localhost:8083)
	var cart models.CartResponse
	isDirectExternalCharge := false

	cartURL := fmt.Sprintf("http://localhost:8083/api/cart/%s", req.UserID)
	resp, err := http.Get(cartURL)
	if err == nil && resp.StatusCode == http.StatusOK {
		json.NewDecoder(resp.Body).Decode(&cart)
		resp.Body.Close()
	}

	// Si el carrito está vacío pero enviaron un monto directo (ej. Reservaciones externas)
	if len(cart.Items) == 0 {
		if req.Amount > 0 {
			isDirectExternalCharge = true
			concept := req.Concept
			if concept == "" {
				concept = req.ShippingAddress
			}
			if concept == "" {
				concept = "Cobro Externo / Reservación"
			}
			sub := req.Amount / 1.16
			iva := req.Amount - sub
			cart = models.CartResponse{
				UserID:   req.UserID,
				Subtotal: sub,
				IVA:      iva,
				Discount: 0,
				Total:    req.Amount,
				Items: []models.CartItemData{
					{
						ProductID: "EXT-RES",
						Name:      concept,
						Quantity:  1,
						Price:     req.Amount,
					},
				},
			}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El carrito está vacío. Agrega productos antes de finalizar la compra o envía 'amount' para cobro directo."})
			return
		}
	}

	// 2. Procesar pago (Tarjeta / PayPal / etc.)
	gateway := strings.ToUpper(req.PaymentMethod)
	var txnRef string
	var cardLastFour string

	if gateway == "PAYPAL" {
		if req.PayPalOrderID == "" {
			req.PayPalOrderID = fmt.Sprintf("PAYID-%d", rand.Intn(900000)+100000)
		}
		txnRef = fmt.Sprintf("TXN-PAYPAL-%s", req.PayPalOrderID)
	} else {
		gateway = "CREDIT_CARD"
		if req.CardDetails != nil && len(req.CardDetails.CardNumber) >= 4 {
			num := req.CardDetails.CardNumber
			cardLastFour = num[len(num)-4:]
		} else {
			cardLastFour = "4242"
		}
		txnRef = fmt.Sprintf("TXN-CARD-%d-%s", time.Now().Unix(), cardLastFour)
	}

	// 3. Descontar stock en inventory-service (localhost:8082) solo si son productos de tienda
	if !isDirectExternalCharge {
		for _, item := range cart.Items {
			invUpdate := map[string]interface{}{
				"productId": item.ProductID,
				"quantity":  -item.Quantity, // Cantidad negativa para descontar
			}
			payloadBytes, _ := json.Marshal(invUpdate)
			invResp, invErr := http.Post("http://localhost:8082/api/inventory/update", "application/json", bytes.NewBuffer(payloadBytes))
			if invErr != nil || invResp.StatusCode != http.StatusOK {
				// Si falla por falta de stock (ej. 409 Conflict)
				c.JSON(http.StatusConflict, gin.H{
					"error":   fmt.Sprintf("Stock insuficiente para el producto '%s' (%s)", item.Name, item.ProductID),
					"product": item.ProductID,
				})
				return
			}
			invResp.Body.Close()
		}
	}

	// 4. Generar identificadores y firma criptográfica
	orderNum := generateOrderNumber()
	now := time.Now()
	cryptoSig := generateCryptoSignature(orderNum, req.UserID, cart.Total, now.Unix())

	// 5. Iniciar transacción en PostgreSQL
	tx, err := config.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error iniciando transacción de base de datos"})
		return
	}
	defer tx.Rollback()

	// Insertar orden
	var orderID string
	err = tx.QueryRow(`
		INSERT INTO orders (order_number, user_id, subtotal, discount, iva, total, status, payment_status, payment_method, shipping_address, crypto_signature, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'PAID', 'COMPLETED', $7, $8, $9, $10)
		RETURNING id`,
		orderNum, req.UserID, cart.Subtotal, cart.Discount, cart.IVA, cart.Total, gateway, req.ShippingAddress, cryptoSig, now,
	).Scan(&orderID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar la orden", "details": err.Error()})
		return
	}

	// Insertar items de la orden
	for _, item := range cart.Items {
		itemSubtotal := item.Price * float64(item.Quantity)
		_, err = tx.Exec(`
			INSERT INTO order_items (order_id, product_id, name, quantity, price, subtotal)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			orderID, item.ProductID, item.Name, item.Quantity, item.Price, itemSubtotal,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al guardar items de la orden"})
			return
		}
	}

	// Insertar registro de pago
	var paymentID string
	err = tx.QueryRow(`
		INSERT INTO payments (order_id, user_id, payment_gateway, transaction_ref, amount, status, card_last_four, created_at)
		VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7)
		RETURNING id`,
		orderID, req.UserID, gateway, txnRef, cart.Total, cardLastFour, now,
	).Scan(&paymentID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al registrar el pago"})
		return
	}

	// Generar y almacenar Recibo Electrónico
	receiptNum := generateReceiptNumber()
	receiptContent := map[string]interface{}{
		"receipt_number":   receiptNum,
		"order_number":     orderNum,
		"user_id":          req.UserID,
		"issued_at":        now.Format(time.RFC3339),
		"subtotal":         cart.Subtotal,
		"discount":         cart.Discount,
		"iva_16":           cart.IVA,
		"total":            cart.Total,
		"payment_gateway":  gateway,
		"transaction_ref":  txnRef,
		"shipping_address": req.ShippingAddress,
		"items_count":      len(cart.Items),
	}
	receiptJSONBytes, _ := json.Marshal(receiptContent)
	receiptHash := fmt.Sprintf("%x", sha256.Sum256(receiptJSONBytes))

	_, err = tx.Exec(`
		INSERT INTO receipts (order_id, receipt_number, content_json, crypto_hash, issued_at)
		VALUES ($1, $2, $3, $4, $5)`,
		orderID, receiptNum, string(receiptJSONBytes), receiptHash, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al emitir comprobante electrónico"})
		return
	}

	if commitErr := tx.Commit(); commitErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al confirmar la transacción"})
		return
	}

	// 6. Limpiar items del carrito en cart-service
	for _, item := range cart.Items {
		delURL := fmt.Sprintf("http://localhost:8083/api/cart/%s/items/%s", req.UserID, item.ProductID)
		reqDel, _ := http.NewRequest(http.MethodDelete, delURL, nil)
		http.DefaultClient.Do(reqDel)
	}

	// 7. Enviar notificación asíncrona a interaction-service si está disponible
	go func() {
		notifPayload := map[string]interface{}{
			"user_id":      req.UserID,
			"type":         "ORDER_CONFIRMATION",
			"order_number": orderNum,
			"total":        cart.Total,
		}
		bodyBytes, _ := json.Marshal(notifPayload)
		http.Post("http://localhost:8086/api/interactions/notifications/email", "application/json", bytes.NewBuffer(bodyBytes))
	}()

	c.JSON(http.StatusCreated, gin.H{
		"message":          "¡Compra completada con éxito!",
		"order_id":         orderID,
		"order_number":     orderNum,
		"receipt_number":   receiptNum,
		"total":            cart.Total,
		"crypto_signature": cryptoSig,
		"transaction_ref":  txnRef,
	})
}

// GetOrdersByUser returns user purchase history
func GetOrdersByUser(c *gin.Context) {
	userID := c.Param("userId")

	rows, err := config.DB.Query(`
		SELECT id, order_number, user_id, subtotal, discount, iva, total, status, payment_status, payment_method, shipping_address, crypto_signature, created_at
		FROM orders
		WHERE user_id = $1
		ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar pedidos"})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		err := rows.Scan(
			&o.ID, &o.OrderNumber, &o.UserID, &o.Subtotal, &o.Discount, &o.IVA, &o.Total,
			&o.Status, &o.PaymentStatus, &o.PaymentMethod, &o.ShippingAddress, &o.CryptoSignature, &o.CreatedAt,
		)
		if err == nil {
			// Query items for this order
			itemRows, itemErr := config.DB.Query(`SELECT id, product_id, name, quantity, price, subtotal FROM order_items WHERE order_id = $1`, o.ID)
			if itemErr == nil {
				for itemRows.Next() {
					var item models.OrderItem
					item.OrderID = o.ID
					if err := itemRows.Scan(&item.ID, &item.ProductID, &item.Name, &item.Quantity, &item.Price, &item.Subtotal); err == nil {
						o.Items = append(o.Items, item)
					}
				}
				itemRows.Close()
			}
			orders = append(orders, o)
		}
	}

	if orders == nil {
		orders = []models.Order{}
	}

	c.JSON(http.StatusOK, orders)
}

// GetOrderByID returns single order details
func GetOrderByID(c *gin.Context) {
	orderID := c.Param("orderId")

	var o models.Order
	err := config.DB.QueryRow(`
		SELECT id, order_number, user_id, subtotal, discount, iva, total, status, payment_status, payment_method, shipping_address, crypto_signature, created_at
		FROM orders
		WHERE id::text = $1 OR order_number = $1`,
		orderID,
	).Scan(
		&o.ID, &o.OrderNumber, &o.UserID, &o.Subtotal, &o.Discount, &o.IVA, &o.Total,
		&o.Status, &o.PaymentStatus, &o.PaymentMethod, &o.ShippingAddress, &o.CryptoSignature, &o.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Orden no encontrada"})
		return
	}

	// Fetch items
	itemRows, err := config.DB.Query(`SELECT id, product_id, name, quantity, price, subtotal FROM order_items WHERE order_id = $1`, o.ID)
	if err == nil {
		for itemRows.Next() {
			var item models.OrderItem
			item.OrderID = o.ID
			if err := itemRows.Scan(&item.ID, &item.ProductID, &item.Name, &item.Quantity, &item.Price, &item.Subtotal); err == nil {
				o.Items = append(o.Items, item)
			}
		}
		itemRows.Close()
	}

	c.JSON(http.StatusOK, o)
}

// GetReceipt returns electronic proof of purchase
func GetReceipt(c *gin.Context) {
	orderID := c.Param("orderId")

	var receipt models.Receipt
	err := config.DB.QueryRow(`
		SELECT r.id, r.order_id, r.receipt_number, r.content_json, r.crypto_hash, r.issued_at
		FROM receipts r
		JOIN orders o ON o.id = r.order_id
		WHERE o.id::text = $1 OR o.order_number = $1`,
		orderID,
	).Scan(&receipt.ID, &receipt.OrderID, &receipt.ReceiptNumber, &receipt.ContentJSON, &receipt.CryptoHash, &receipt.IssuedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comprobante electrónico no encontrado"})
		return
	}

	var parsedContent map[string]interface{}
	json.Unmarshal([]byte(receipt.ContentJSON), &parsedContent)

	c.JSON(http.StatusOK, gin.H{
		"receipt_id":     receipt.ID,
		"receipt_number": receipt.ReceiptNumber,
		"order_id":       receipt.OrderID,
		"crypto_hash":    receipt.CryptoHash,
		"issued_at":      receipt.IssuedAt,
		"details":        parsedContent,
	})
}

// UpdateOrderStatus updates status of the order (e.g. SHIPPED, DELIVERED)
func UpdateOrderStatus(c *gin.Context) {
	orderID := c.Param("orderId")
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado inválido"})
		return
	}

	res, err := config.DB.Exec(`UPDATE orders SET status = $1 WHERE id::text = $2 OR order_number = $2`, req.Status, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar estado"})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Orden no encontrada"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Estado de orden actualizado", "new_status": req.Status})
}

// DirectCharge processes a direct payment (anticipo o total) for external reservations or services
func DirectCharge(c *gin.Context) {
	var req models.DirectChargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de pago inválidos", "details": err.Error()})
		return
	}

	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El monto a cobrar debe ser mayor a 0"})
		return
	}

	gateway := strings.ToUpper(req.PaymentMethod)
	var txnRef, cardLastFour string
	if gateway == "PAYPAL" {
		if req.PayPalOrderID == "" {
			req.PayPalOrderID = fmt.Sprintf("PAYID-%d", rand.Intn(900000)+100000)
		}
		txnRef = fmt.Sprintf("TXN-PAYPAL-%s", req.PayPalOrderID)
	} else {
		gateway = "CREDIT_CARD"
		if req.CardDetails != nil && len(req.CardDetails.CardNumber) >= 4 {
			num := req.CardDetails.CardNumber
			cardLastFour = num[len(num)-4:]
		} else {
			cardLastFour = "4242"
		}
		txnRef = fmt.Sprintf("TXN-CARD-%d-%s", time.Now().Unix(), cardLastFour)
	}

	concept := req.Concept
	if concept == "" {
		if req.ReservationID != "" {
			concept = fmt.Sprintf("Reservación #%s (%s)", req.ReservationID, req.PaymentType)
		} else {
			concept = "Cobro de Reservación"
		}
	}

	orderNum := generateOrderNumber()
	now := time.Now()
	cryptoSig := generateCryptoSignature(orderNum, req.UserID, req.Amount, now.Unix())
	sub := req.Amount / 1.16
	iva := req.Amount - sub

	tx, err := config.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error iniciando transacción"})
		return
	}
	defer tx.Rollback()

	var orderID string
	err = tx.QueryRow(`
		INSERT INTO orders (order_number, user_id, subtotal, discount, iva, total, status, payment_status, payment_method, shipping_address, crypto_signature, created_at)
		VALUES ($1, $2, $3, 0, $4, $5, 'PAID', 'COMPLETED', $6, $7, $8, $9)
		RETURNING id`,
		orderNum, req.UserID, sub, iva, req.Amount, gateway, concept, cryptoSig, now,
	).Scan(&orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al registrar la orden de pago"})
		return
	}

	var paymentID string
	err = tx.QueryRow(`
		INSERT INTO payments (order_id, user_id, payment_gateway, transaction_ref, amount, status, card_last_four, created_at)
		VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7)
		RETURNING id`,
		orderID, req.UserID, gateway, txnRef, req.Amount, cardLastFour, now,
	).Scan(&paymentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al registrar la transacción"})
		return
	}

	receiptNum := generateReceiptNumber()
	receiptContent := map[string]interface{}{
		"receipt_number":  receiptNum,
		"order_number":    orderNum,
		"reservation_id":  req.ReservationID,
		"concept":         concept,
		"payment_type":    req.PaymentType,
		"user_id":         req.UserID,
		"issued_at":       now.Format(time.RFC3339),
		"total":           req.Amount,
		"payment_gateway": gateway,
		"transaction_ref": txnRef,
	}
	receiptJSONBytes, _ := json.Marshal(receiptContent)
	receiptHash := fmt.Sprintf("%x", sha256.Sum256(receiptJSONBytes))

	_, err = tx.Exec(`
		INSERT INTO receipts (order_id, receipt_number, content_json, crypto_hash, issued_at)
		VALUES ($1, $2, $3, $4, $5)`,
		orderID, receiptNum, string(receiptJSONBytes), receiptHash, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al emitir recibo"})
		return
	}

	tx.Commit()

	// Notificar asíncronamente al servicio de Notificaciones (:8086)
	go func() {
		notifPayload := map[string]interface{}{
			"user_id":         req.UserID,
			"recipient_email": req.RecipientEmail,
			"type":            "ORDER_CONFIRMATION",
			"order_number":    orderNum,
			"total":           req.Amount,
		}
		bodyBytes, _ := json.Marshal(notifPayload)
		http.Post("http://localhost:8086/api/interactions/notifications/email", "application/json", bytes.NewBuffer(bodyBytes))
	}()

	c.JSON(http.StatusCreated, gin.H{
		"message":          "Pago procesado y aprobado exitosamente",
		"payment_id":       paymentID,
		"order_id":         orderID,
		"order_number":     orderNum,
		"reservation_id":   req.ReservationID,
		"receipt_number":   receiptNum,
		"transaction_ref":  txnRef,
		"amount":           req.Amount,
		"payment_type":     req.PaymentType,
		"status":           "APPROVED",
		"crypto_signature": cryptoSig,
	})
}

// RefundPayment processes a refund for a transaction or order
func RefundPayment(c *gin.Context) {
	var req models.RefundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de reembolso inválidos"})
		return
	}

	if req.TransactionRef == "" && req.OrderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debes proporcionar 'transaction_ref' o 'order_id' para procesar el reembolso"})
		return
	}

	var paymentID, orderID, txnRef string
	var amount float64
	err := config.DB.QueryRow(`
		SELECT id, order_id, transaction_ref, amount
		FROM payments
		WHERE transaction_ref = $1 OR order_id::text = $2 OR id::text = $2
		LIMIT 1`,
		req.TransactionRef, req.OrderID,
	).Scan(&paymentID, &orderID, &txnRef, &amount)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transacción u orden no encontrada para reembolsar"})
		return
	}

	config.DB.Exec(`UPDATE payments SET status = 'REFUNDED' WHERE id = $1`, paymentID)
	config.DB.Exec(`UPDATE orders SET status = 'CANCELLED', payment_status = 'REFUNDED' WHERE id = $1`, orderID)

	refundToken := fmt.Sprintf("RFD-%d-%d", time.Now().Unix(), rand.Intn(9000)+1000)

	c.JSON(http.StatusOK, gin.H{
		"message":         "Reembolso procesado exitosamente",
		"refund_token":    refundToken,
		"payment_id":      paymentID,
		"order_id":        orderID,
		"transaction_ref": txnRef,
		"refunded_amount": amount,
		"status":          "REFUNDED",
		"reason":          req.Reason,
		"processed_at":    time.Now(),
	})
}

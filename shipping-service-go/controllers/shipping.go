package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"shipping-service-go/config"
	"shipping-service-go/models"

	"github.com/gin-gonic/gin"
)

// Generate unique tracking number (e.g., DHL-TRK-20261012-84192)
func generateTrackingNumber(carrier string) string {
	cleanCarrier := strings.ToUpper(strings.ReplaceAll(carrier, " ", ""))
	datePart := time.Now().Format("20060102")
	randomPart := rand.Intn(900000) + 100000
	return fmt.Sprintf("%s-TRK-%s-%d", cleanCarrier, datePart, randomPart)
}

// Calculate shipping rates based on postal codes, weight, and volume
func CalculateRates(c *gin.Context) {
	var req models.ShippingCalculationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para cotización", "details": err.Error()})
		return
	}

	// 1. Calcular peso volumétrico: (Largo * Ancho * Alto) / 5000 (estándar IATA)
	volumetricWeight := (req.LengthCm * req.WidthCm * req.HeightCm) / 5000.0
	chargeableWeight := math.Max(req.WeightKg, volumetricWeight)
	if chargeableWeight <= 0 {
		chargeableWeight = 1.0 // Mínimo 1 kg facturable
	}

	// 2. Calcular factor de distancia entre C.P. (estimación por diferencia numérica de zona)
	originPrefix, _ := strconv.Atoi(req.OriginZip[:min(2, len(req.OriginZip))])
	destPrefix, _ := strconv.Atoi(req.DestinationZip[:min(2, len(req.DestinationZip))])
	diff := math.Abs(float64(originPrefix - destPrefix))

	baseRate := 80.0 + (diff * 2.5) // Tarifa base por zona geográfica
	weightRate := chargeableWeight * 18.0

	now := time.Now()

	// Opciones de paqueterías
	options := []models.ShippingRateOption{
		{
			Carrier:           "Estafeta",
			ServiceType:       "ESTANDAR",
			ShippingCost:      math.Round((baseRate*0.9+weightRate*0.8)*100) / 100,
			EstimatedDays:     4,
			EstimatedDelivery: now.Add(4 * 24 * time.Hour),
			Description:       "Envío terrestre económico (3 a 5 días hábiles)",
		},
		{
			Carrier:           "FedEx",
			ServiceType:       "EXPRESS",
			ShippingCost:      math.Round((baseRate*1.2+weightRate*1.1)*100) / 100,
			EstimatedDays:     2,
			EstimatedDelivery: now.Add(2 * 24 * time.Hour),
			Description:       "Envío aéreo express con garantía de entrega (1 a 2 días)",
		},
		{
			Carrier:           "DHL Express",
			ServiceType:       "PRIORITARIO",
			ShippingCost:      math.Round((baseRate*1.5+weightRate*1.3)*100) / 100,
			EstimatedDays:     1,
			EstimatedDelivery: now.Add(1 * 24 * time.Hour),
			Description:       "Entrega prioritaria al día siguiente hábil antes de las 12:00 PM",
		},
	}

	// Si el código postal es local (misma zona), habilitar 99Minutos Mismo Día
	if diff <= 5 {
		options = append(options, models.ShippingRateOption{
			Carrier:           "99Minutos",
			ServiceType:       "MISMO_DIA",
			ShippingCost:      math.Round((baseRate*1.1+weightRate*0.9)*100) / 100,
			EstimatedDays:     0,
			EstimatedDelivery: now.Add(8 * time.Hour),
			Description:       "Entrega express metropolitana el mismo día",
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"origin_zip":        req.OriginZip,
		"destination_zip":   req.DestinationZip,
		"chargeable_weight": chargeableWeight,
		"volumetric_weight": volumetricWeight,
		"options":           options,
	})
}

// CreateShipment assigns carrier and generates tracking guide
func CreateShipment(c *gin.Context) {
	var req models.CreateShipmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos para generar envío", "details": err.Error()})
		return
	}

	trackingNumber := generateTrackingNumber(req.Carrier)
	now := time.Now()
	estDelivery := now.Add(3 * 24 * time.Hour)

	var shipmentID string
	err := config.DB.QueryRow(`
		INSERT INTO shipments (order_id, carrier, tracking_number, origin_zip, destination_zip, destination_address, service_type, shipping_cost, status, estimated_delivery, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PACKING', $9, $10)
		RETURNING id`,
		req.OrderID, req.Carrier, trackingNumber, req.OriginZip, req.DestinationZip, req.DestinationAddress, req.ServiceType, req.ShippingCost, estDelivery, now,
	).Scan(&shipmentID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al registrar el envío en base de datos", "details": err.Error()})
		return
	}

	// Crear primer checkpoint
	initialDesc := fmt.Sprintf("Guía electrónica generada por %s. El pedido se encuentra en preparación y empaque.", req.Carrier)
	config.DB.Exec(`
		INSERT INTO shipment_checkpoints (shipment_id, status, location, description, timestamp)
		VALUES ($1, 'PACKING', 'Centro de Distribución Central', $2, $3)`,
		shipmentID, initialDesc, now,
	)

	// Sincronizar estado en order-service de forma asíncrona
	go func() {
		statusPayload := map[string]string{"status": "PROCESSING"}
		body, _ := json.Marshal(statusPayload)
		orderStatusURL := fmt.Sprintf("http://localhost:8084/api/orders/%s/status", req.OrderID)
		reqUpdate, _ := http.NewRequest(http.MethodPut, orderStatusURL, bytes.NewBuffer(body))
		reqUpdate.Header.Set("Content-Type", "application/json")
		http.DefaultClient.Do(reqUpdate)
	}()

	c.JSON(http.StatusCreated, gin.H{
		"message":            "Guía de rastreo generada con éxito",
		"shipment_id":        shipmentID,
		"order_id":           req.OrderID,
		"carrier":            req.Carrier,
		"tracking_number":    trackingNumber,
		"status":             "PACKING",
		"estimated_delivery": estDelivery,
		"label_url":          fmt.Sprintf("http://localhost:8085/api/shipping/labels/%s.pdf", trackingNumber),
	})
}

// UpdateShipmentStatus updates the shipment progress and appends a checkpoint
func UpdateShipmentStatus(c *gin.Context) {
	trackingNumber := c.Param("trackingNumber")

	var req models.UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de actualización inválidos"})
		return
	}

	validStatuses := map[string]bool{
		"PACKING":          true,
		"IN_TRANSIT":       true,
		"OUT_FOR_DELIVERY": true,
		"DELIVERED":        true,
		"RETURNED":         true,
	}

	statusUpper := strings.ToUpper(req.Status)
	if !validStatuses[statusUpper] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado de envío no válido. Use: PACKING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, RETURNED"})
		return
	}

	var shipmentID, orderID string
	err := config.DB.QueryRow(`
		UPDATE shipments SET status = $1 WHERE tracking_number = $2
		RETURNING id, order_id`,
		statusUpper, trackingNumber,
	).Scan(&shipmentID, &orderID)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Envío no encontrado con el número de guía proporcionado"})
		return
	}

	// Registrar nuevo checkpoint en el historial de rastreo
	now := time.Now()
	_, err = config.DB.Exec(`
		INSERT INTO shipment_checkpoints (shipment_id, status, location, description, timestamp)
		VALUES ($1, $2, $3, $4, $5)`,
		shipmentID, statusUpper, req.Location, req.Description, now,
	)

	// Sincronizar estado en order-service
	go func() {
		orderStatus := statusUpper
		if statusUpper == "IN_TRANSIT" || statusUpper == "OUT_FOR_DELIVERY" {
			orderStatus = "SHIPPED"
		}
		statusPayload := map[string]string{"status": orderStatus}
		body, _ := json.Marshal(statusPayload)
		orderStatusURL := fmt.Sprintf("http://localhost:8084/api/orders/%s/status", orderID)
		reqUpdate, _ := http.NewRequest(http.MethodPut, orderStatusURL, bytes.NewBuffer(body))
		reqUpdate.Header.Set("Content-Type", "application/json")
		http.DefaultClient.Do(reqUpdate)
	}()

	c.JSON(http.StatusOK, gin.H{
		"message":         "Estado de envío y checkpoint registrados",
		"tracking_number": trackingNumber,
		"new_status":      statusUpper,
		"location":        req.Location,
		"updated_at":      now,
	})
}

// TrackShipment returns real-time tracking details with full history
func TrackShipment(c *gin.Context) {
	trackingNumber := c.Param("trackingNumber")

	var s models.Shipment
	err := config.DB.QueryRow(`
		SELECT id, order_id, carrier, tracking_number, origin_zip, destination_zip, destination_address, service_type, shipping_cost, status, estimated_delivery, created_at
		FROM shipments WHERE tracking_number = $1`,
		trackingNumber,
	).Scan(
		&s.ID, &s.OrderID, &s.Carrier, &s.TrackingNumber, &s.OriginZip, &s.DestinationZip,
		&s.DestinationAddress, &s.ServiceType, &s.ShippingCost, &s.Status, &s.EstimatedDelivery, &s.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Número de guía no encontrado"})
		return
	}

	// Consultar historial de checkpoints
	rows, err := config.DB.Query(`
		SELECT id, shipment_id, status, location, description, timestamp
		FROM shipment_checkpoints
		WHERE shipment_id = $1
		ORDER BY timestamp DESC`,
		s.ID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cp models.ShipmentCheckpoint
			if err := rows.Scan(&cp.ID, &cp.ShipmentID, &cp.Status, &cp.Location, &cp.Description, &cp.Timestamp); err == nil {
				s.Checkpoints = append(s.Checkpoints, cp)
			}
		}
	}

	if s.Checkpoints == nil {
		s.Checkpoints = []models.ShipmentCheckpoint{}
	}

	c.JSON(http.StatusOK, s)
}

// GetShipmentByOrder returns shipment by order ID
func GetShipmentByOrder(c *gin.Context) {
	orderID := c.Param("orderId")

	var s models.Shipment
	err := config.DB.QueryRow(`
		SELECT id, order_id, carrier, tracking_number, origin_zip, destination_zip, destination_address, service_type, shipping_cost, status, estimated_delivery, created_at
		FROM shipments WHERE order_id = $1`,
		orderID,
	).Scan(
		&s.ID, &s.OrderID, &s.Carrier, &s.TrackingNumber, &s.OriginZip, &s.DestinationZip,
		&s.DestinationAddress, &s.ServiceType, &s.ShippingCost, &s.Status, &s.EstimatedDelivery, &s.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró envío asociado a esta orden"})
		return
	}

	c.JSON(http.StatusOK, s)
}

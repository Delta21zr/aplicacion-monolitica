package models

import "time"

type ShippingCalculationRequest struct {
	OriginZip      string  `json:"origin_zip" binding:"required"`
	DestinationZip string  `json:"destination_zip" binding:"required"`
	WeightKg       float64 `json:"weight_kg" binding:"required"`
	LengthCm       float64 `json:"length_cm"`
	WidthCm        float64 `json:"width_cm"`
	HeightCm       float64 `json:"height_cm"`
	DeclaredValue  float64 `json:"declared_value,omitempty"`
}

type ShippingRateOption struct {
	Carrier           string    `json:"carrier"` // 'DHL', 'FedEx', 'Estafeta', '99Minutos'
	ServiceType       string    `json:"service_type"` // 'ESTANDAR', 'EXPRESS', 'MISMO_DIA'
	ShippingCost      float64   `json:"shipping_cost"`
	EstimatedDays     int       `json:"estimated_days"`
	EstimatedDelivery time.Time `json:"estimated_delivery"`
	Description       string    `json:"description"`
}

type CreateShipmentRequest struct {
	OrderID            string  `json:"order_id" binding:"required"`
	Carrier            string  `json:"carrier" binding:"required"`
	ServiceType        string  `json:"service_type" binding:"required"`
	OriginZip          string  `json:"origin_zip" binding:"required"`
	DestinationZip     string  `json:"destination_zip" binding:"required"`
	DestinationAddress string  `json:"destination_address" binding:"required"`
	ShippingCost       float64 `json:"shipping_cost" binding:"required"`
}

type Shipment struct {
	ID                 string               `json:"id"`
	OrderID            string               `json:"order_id"`
	Carrier            string               `json:"carrier"`
	TrackingNumber     string               `json:"tracking_number"`
	OriginZip          string               `json:"origin_zip"`
	DestinationZip     string               `json:"destination_zip"`
	DestinationAddress string               `json:"destination_address"`
	ServiceType        string               `json:"service_type"`
	ShippingCost       float64              `json:"shipping_cost"`
	Status             string               `json:"status"` // PACKING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, RETURNED
	EstimatedDelivery  time.Time            `json:"estimated_delivery"`
	CreatedAt          time.Time            `json:"created_at"`
	Checkpoints        []ShipmentCheckpoint `json:"checkpoints,omitempty"`
}

type ShipmentCheckpoint struct {
	ID          string    `json:"id"`
	ShipmentID  string    `json:"shipment_id"`
	Status      string    `json:"status"`
	Location    string    `json:"location"`
	Description string    `json:"description"`
	Timestamp   time.Time `json:"timestamp"`
}

type UpdateStatusRequest struct {
	Status      string `json:"status" binding:"required"` // 'PACKING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'
	Location    string `json:"location" binding:"required"`
	Description string `json:"description" binding:"required"`
}

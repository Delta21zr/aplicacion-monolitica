package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"billing-service-go/config"
	"billing-service-go/models"
	"billing-service-go/services"

	"github.com/gin-gonic/gin"
)

var (
	memStoreMu sync.RWMutex
	memInvoices = make(map[string]models.Invoice)
)

// FacturarOrden factura una orden existente consultando a order-service (:8084)
func FacturarOrden(c *gin.Context) {
	orderID := c.Param("orderId")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El parámetro orderId es requerido"})
		return
	}

	var req models.FacturarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos fiscales inválidos", "details": err.Error()})
		return
	}
	req.OrderID = orderID

	// 1. Consultar orden a order-service (:8084)
	orderURL := fmt.Sprintf("http://localhost:8084/api/orders/%s", orderID)
	resp, err := http.Get(orderURL)
	if err != nil || resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo consultar la orden en order-service o la orden no existe"})
		return
	}
	defer resp.Body.Close()

	var orderData struct {
		ID          string `json:"id"`
		OrderNumber string `json:"order_number"`
		Subtotal    float64 `json:"subtotal"`
		IVA         float64 `json:"iva"`
		Total       float64 `json:"total"`
		Items       []struct {
			ProductID string  `json:"product_id"`
			Name      string  `json:"name"`
			Quantity  int     `json:"quantity"`
			Price     float64 `json:"price"`
			Subtotal  float64 `json:"subtotal"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&orderData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error decodificando respuesta de la orden"})
		return
	}

	req.OrderNumber = orderData.OrderNumber

	// Convertir items de la orden a items de factura
	items := make([]models.InvoiceItem, 0, len(orderData.Items))
	for _, it := range orderData.Items {
		items = append(items, models.InvoiceItem{
			ProductID:     it.ProductID,
			Descripcion:   it.Name,
			Cantidad:      it.Quantity,
			ValorUnitario: it.Price,
			Importe:       it.Subtotal,
			ClaveProdServ: "50202200", // Clave genérica estándar SAT
			ClaveUnidad:   "H87",      // Pieza
			Unidad:        "Pieza",
		})
	}
	req.Items = items

	// Procesar timbrado
	invoice, err := procesarTimbrado(req, orderData.Subtotal, orderData.IVA, orderData.Total, items)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, invoice)
}

// FacturarDirecto emite una factura directamente sin vincularla obligatoriamente a una orden previa
func FacturarDirecto(c *gin.Context) {
	var req models.FacturarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de facturación inválidos", "details": err.Error()})
		return
	}

	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debe incluir al menos un producto/concepto en la factura"})
		return
	}

	var subtotal float64
	for _, it := range req.Items {
		subtotal += it.Importe
	}
	iva := subtotal * 0.16
	total := subtotal + iva

	invoice, err := procesarTimbrado(req, subtotal, iva, total, req.Items)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, invoice)
}

func procesarTimbrado(req models.FacturarRequest, subtotal, iva, total float64, items []models.InvoiceItem) (*models.Invoice, error) {
	cfg := services.GlobalProfactService.Config

	// Construir comprobante CFDI 4.0
	comprobante, rawXML, err := services.BuildCFDI40(req, cfg, subtotal, iva, total, items)
	if err != nil {
		return nil, fmt.Errorf("error construyendo comprobante CFDI 4.0: %w", err)
	}

	idComp := req.OrderNumber
	if idComp == "" {
		idComp = fmt.Sprintf("FAC-%d", time.Now().Unix())
	}

	// Timbrar con Profact (Modo Simulación o SOAP Live)
	timbreResp, err := services.GlobalProfactService.TimbraCFDI(comprobante, rawXML, idComp)
	if err != nil {
		return nil, fmt.Errorf("error durante el proceso de timbrado con Profact: %w", err)
	}

	if !timbreResp.Success {
		return nil, fmt.Errorf("rechazado por el PAC Profact (Código %s): %s", timbreResp.ErrorCode, timbreResp.ErrorMessage)
	}

	now := time.Now()
	invoiceID := timbreResp.UUID

	formaPago := req.FormaPago
	if formaPago == "" {
		formaPago = "04"
	}
	metodoPago := req.MetodoPago
	if metodoPago == "" {
		metodoPago = "PUE"
	}

	invoice := &models.Invoice{
		ID:                    invoiceID,
		OrderID:               req.OrderID,
		OrderNumber:           req.OrderNumber,
		UUID:                  timbreResp.UUID,
		RFCEmisor:             cfg.RFCEmisor,
		NombreEmisor:          cfg.NombreEmisor,
		RFCReceptor:           strings.ToUpper(req.RFCReceptor),
		NombreReceptor:        strings.ToUpper(req.NombreReceptor),
		CPReceptor:            req.DomicilioFiscalReceptor,
		RegimenFiscalReceptor: req.RegimenFiscalReceptor,
		UsoCFDI:               req.UsoCFDI,
		Subtotal:              subtotal,
		IVA:                   iva,
		Total:                 total,
		Moneda:                "MXN",
		FormaPago:             formaPago,
		MetodoPago:            metodoPago,
		Status:                "TIMBRADO",
		Modo:                  timbreResp.Modo,
		XMLTimbrado:           timbreResp.XMLTimbrado,
		QRCodeURL:             timbreResp.QRCodeURL,
		SelloSAT:              timbreResp.SelloSAT,
		SelloCFD:              timbreResp.SelloCFD,
		FechaTimbrado:         now,
		CreatedAt:             now,
		Items:                 items,
	}

	// Guardar en Postgres si está conectado, o en memoria de respaldo
	if config.IsPostgresConnected && config.DB != nil {
		query := `
		INSERT INTO invoices (
			order_id, order_number, uuid, rfc_emisor, nombre_emisor, rfc_receptor,
			nombre_receptor, cp_receptor, regimen_fiscal_receptor, uso_cfdi, subtotal,
			iva, total, moneda, forma_pago, metodo_pago, status, modo, xml_timbrado,
			qr_code_url, sello_sat, sello_cfd, fecha_timbrado, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
		) RETURNING id`

		var genID string
		err = config.DB.QueryRow(query,
			invoice.OrderID, invoice.OrderNumber, invoice.UUID, invoice.RFCEmisor, invoice.NombreEmisor,
			invoice.RFCReceptor, invoice.NombreReceptor, invoice.CPReceptor, invoice.RegimenFiscalReceptor,
			invoice.UsoCFDI, invoice.Subtotal, invoice.IVA, invoice.Total, invoice.Moneda, invoice.FormaPago,
			invoice.MetodoPago, invoice.Status, invoice.Modo, invoice.XMLTimbrado, invoice.QRCodeURL,
			invoice.SelloSAT, invoice.SelloCFD, invoice.FechaTimbrado, invoice.CreatedAt,
		).Scan(&genID)
		if err == nil {
			invoice.ID = genID
		}
	}

	memStoreMu.Lock()
	memInvoices[invoice.UUID] = *invoice
	if invoice.OrderID != "" {
		memInvoices["order_"+invoice.OrderID] = *invoice
	}
	memStoreMu.Unlock()

	return invoice, nil
}

// GetInvoices lista todas las facturas
func GetInvoices(c *gin.Context) {
	orderID := c.Query("order_id")

	if config.IsPostgresConnected && config.DB != nil {
		query := "SELECT id, order_id, order_number, uuid, rfc_emisor, rfc_receptor, nombre_receptor, subtotal, iva, total, status, modo, qr_code_url, created_at FROM invoices"
		var rows *sqlRowsWrapper
		var err error

		if orderID != "" {
			query += " WHERE order_id = $1 ORDER BY created_at DESC"
			r, e := config.DB.Query(query, orderID)
			rows = &sqlRowsWrapper{Rows: r}
			err = e
		} else {
			query += " ORDER BY created_at DESC"
			r, e := config.DB.Query(query)
			rows = &sqlRowsWrapper{Rows: r}
			err = e
		}

		if err == nil && rows.Rows != nil {
			defer rows.Rows.Close()
			var list []models.Invoice
			for rows.Rows.Next() {
				var inv models.Invoice
				_ = rows.Rows.Scan(
					&inv.ID, &inv.OrderID, &inv.OrderNumber, &inv.UUID, &inv.RFCEmisor,
					&inv.RFCReceptor, &inv.NombreReceptor, &inv.Subtotal, &inv.IVA,
					&inv.Total, &inv.Status, &inv.Modo, &inv.QRCodeURL, &inv.CreatedAt,
				)
				list = append(list, inv)
			}
			c.JSON(http.StatusOK, list)
			return
		}
	}

	// Fallback memoria
	memStoreMu.RLock()
	defer memStoreMu.RUnlock()
	var list []models.Invoice
	seen := make(map[string]bool)
	for _, inv := range memInvoices {
		if !seen[inv.UUID] {
			seen[inv.UUID] = true
			if orderID == "" || inv.OrderID == orderID {
				list = append(list, inv)
			}
		}
	}
	c.JSON(http.StatusOK, list)
}

type sqlRowsWrapper struct {
	Rows interface {
		Next() bool
		Scan(dest ...interface{}) error
		Close() error
	}
}

// GetInvoiceByOrderID obtiene la factura asociada a una orden
func GetInvoiceByOrderID(c *gin.Context) {
	orderID := c.Param("orderId")

	if config.IsPostgresConnected && config.DB != nil {
		var inv models.Invoice
		query := `SELECT id, order_id, order_number, uuid, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor,
		                 cp_receptor, regimen_fiscal_receptor, uso_cfdi, subtotal, iva, total, moneda, forma_pago,
		                 metodo_pago, status, modo, xml_timbrado, qr_code_url, sello_sat, sello_cfd, created_at
		          FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`
		err := config.DB.QueryRow(query, orderID).Scan(
			&inv.ID, &inv.OrderID, &inv.OrderNumber, &inv.UUID, &inv.RFCEmisor, &inv.NombreEmisor,
			&inv.RFCReceptor, &inv.NombreReceptor, &inv.CPReceptor, &inv.RegimenFiscalReceptor,
			&inv.UsoCFDI, &inv.Subtotal, &inv.IVA, &inv.Total, &inv.Moneda, &inv.FormaPago,
			&inv.MetodoPago, &inv.Status, &inv.Modo, &inv.XMLTimbrado, &inv.QRCodeURL,
			&inv.SelloSAT, &inv.SelloCFD, &inv.CreatedAt,
		)
		if err == nil {
			c.JSON(http.StatusOK, inv)
			return
		}
	}

	memStoreMu.RLock()
	inv, found := memInvoices["order_"+orderID]
	memStoreMu.RUnlock()
	if found {
		c.JSON(http.StatusOK, inv)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró factura para esta orden"})
}

// GetInvoiceByID obtiene el detalle de la factura
func GetInvoiceByID(c *gin.Context) {
	id := c.Param("id")

	memStoreMu.RLock()
	inv, found := memInvoices[id]
	memStoreMu.RUnlock()
	if found {
		c.JSON(http.StatusOK, inv)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "Factura no encontrada"})
}

// DownloadXML descarga el XML CFDI 4.0 timbrado
func DownloadXML(c *gin.Context) {
	id := c.Param("id")

	var xmlContent string
	var uuid string

	memStoreMu.RLock()
	if inv, found := memInvoices[id]; found {
		xmlContent = inv.XMLTimbrado
		uuid = inv.UUID
	}
	memStoreMu.RUnlock()

	if xmlContent == "" && config.IsPostgresConnected && config.DB != nil {
		_ = config.DB.QueryRow("SELECT xml_timbrado, uuid FROM invoices WHERE uuid = $1 OR id::text = $1", id).Scan(&xmlContent, &uuid)
	}

	if xmlContent == "" {
		c.String(http.StatusNotFound, "Archivo XML no encontrado para la factura solicitada")
		return
	}

	filename := fmt.Sprintf("CFDI_%s.xml", uuid)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(xmlContent))
}

// GetInvoicePreviewHTML retorna la representación impresa visual de la factura
func GetInvoicePreviewHTML(c *gin.Context) {
	id := c.Param("id")

	var inv models.Invoice
	var found bool

	memStoreMu.RLock()
	inv, found = memInvoices[id]
	memStoreMu.RUnlock()

	if !found && config.IsPostgresConnected && config.DB != nil {
		err := config.DB.QueryRow(`
			SELECT id, order_number, uuid, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor,
			       cp_receptor, regimen_fiscal_receptor, uso_cfdi, subtotal, iva, total, forma_pago,
			       metodo_pago, status, modo, qr_code_url, sello_sat, sello_cfd, created_at
			FROM invoices WHERE uuid = $1 OR id::text = $1`, id).Scan(
			&inv.ID, &inv.OrderNumber, &inv.UUID, &inv.RFCEmisor, &inv.NombreEmisor,
			&inv.RFCReceptor, &inv.NombreReceptor, &inv.CPReceptor, &inv.RegimenFiscalReceptor,
			&inv.UsoCFDI, &inv.Subtotal, &inv.IVA, &inv.Total, &inv.FormaPago,
			&inv.MetodoPago, &inv.Status, &inv.Modo, &inv.QRCodeURL, &inv.SelloSAT,
			&inv.SelloCFD, &inv.CreatedAt,
		)
		if err == nil {
			found = true
		}
	}

	if !found {
		c.String(http.StatusNotFound, "Factura no encontrada")
		return
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura Electrónica CFDI 4.0 - %s</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; color: #1e293b; background: #f8fafc; }
    .invoice-box { max-width: 800px; margin: auto; padding: 30px; background: #fff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 20px; }
    .badge { background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 9999px; font-weight: bold; font-size: 13px; }
    .badge-sim { background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-weight: bold; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .card { background: #f1f5f9; padding: 15px; border-radius: 6px; font-size: 14px; }
    .card h4 { margin: 0 0 8px 0; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .totals { text-align: right; margin-top: 20px; font-size: 15px; }
    .totals table { margin-left: auto; border-collapse: collapse; }
    .totals td { padding: 5px 12px; }
    .totals .final { font-size: 18px; font-weight: bold; color: #0284c7; border-top: 2px solid #0284c7; }
    .stamp-box { margin-top: 25px; border-top: 1px dashed #94a3b8; padding-top: 15px; font-size: 11px; word-break: break-all; }
    .btn { display: inline-block; background: #0284c7; color: #fff; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="header">
      <div>
        <h2 style="margin: 0; color: #0369a1;">COMPROBANTE FISCAL DIGITAL (CFDI 4.0)</h2>
        <div style="margin-top: 5px; color: #64748b; font-size: 13px;">PAC: Profact (profact.com.mx)</div>
      </div>
      <div style="text-align: right;">
        <span class="%s">%s</span>
        <div style="font-weight: bold; margin-top: 8px; font-size: 15px;">Folio Fiscal (UUID):</div>
        <div style="font-family: monospace; font-size: 12px; color: #0284c7;">%s</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h4>EMISOR</h4>
        <div><strong>%s</strong></div>
        <div>RFC: <strong>%s</strong></div>
        <div>Régimen Fiscal: 601 - General de Ley Personas Morales</div>
        <div>Lugar Expedición: 01000</div>
      </div>
      <div class="card">
        <h4>RECEPTOR</h4>
        <div><strong>%s</strong></div>
        <div>RFC: <strong>%s</strong></div>
        <div>Código Postal: %s</div>
        <div>Régimen Fiscal: %s</div>
        <div>Uso CFDI: %s</div>
      </div>
    </div>

    <div class="totals">
      <table>
        <tr><td>Subtotal:</td><td><strong>$%.2f MXN</strong></td></tr>
        <tr><td>IVA Trasladado (16%%):</td><td><strong>$%.2f MXN</strong></td></tr>
        <tr class="final"><td>Total:</td><td><strong>$%.2f MXN</strong></td></tr>
      </table>
    </div>

    <div class="stamp-box">
      <div><strong>Sello Digital del Emisor (CFD):</strong></div>
      <div style="color: #64748b; font-family: monospace;">%s</div>
      <div style="margin-top: 8px;"><strong>Sello Digital del SAT:</strong></div>
      <div style="color: #64748b; font-family: monospace;">%s</div>
      <div style="margin-top: 8px;"><strong>Enlace de Verificación Oficial SAT:</strong></div>
      <div style="margin-top: 4px;"><a href="%s" target="_blank" style="color: #0284c7; font-size: 11px;">%s</a></div>
    </div>

    <div style="text-align: center; margin-top: 25px;">
      <a href="/api/billing/invoices/%s/xml" class="btn">📥 Descargar XML Timbrado Oficial</a>
      <button onclick="window.print()" class="btn" style="background: #475569; margin-left: 10px;">🖨️ Imprimir Factura</button>
    </div>
  </div>
</body>
</html>`,
		inv.UUID,
		func() string {
			if inv.Modo == "SIMULACION" {
				return "badge-sim"
			}
			return "badge"
		}(),
		func() string {
			if inv.Modo == "SIMULACION" {
				return "MODO SIMULACIÓN (PAC PROFACT)"
			}
			return "TIMBRADO ANTE SAT"
		}(),
		inv.UUID,
		inv.NombreEmisor,
		inv.RFCEmisor,
		inv.NombreReceptor,
		inv.RFCReceptor,
		inv.CPReceptor,
		inv.RegimenFiscalReceptor,
		inv.UsoCFDI,
		inv.Subtotal,
		inv.IVA,
		inv.Total,
		inv.SelloCFD,
		inv.SelloSAT,
		inv.QRCodeURL,
		inv.QRCodeURL,
		inv.UUID,
	)

	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

// CancelarFactura ejecuta el método CancelaCFDI
func CancelarFactura(c *gin.Context) {
	uuid := c.Param("uuid")
	rfcEmisor := services.GlobalProfactService.Config.RFCEmisor

	success, msg, err := services.GlobalProfactService.CancelaCFDI(uuid, rfcEmisor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if config.IsPostgresConnected && config.DB != nil {
		_, _ = config.DB.Exec("UPDATE invoices SET status = 'CANCELADO' WHERE uuid = $1", uuid)
	}

	memStoreMu.Lock()
	if inv, ok := memInvoices[uuid]; ok {
		inv.Status = "CANCELADO"
		memInvoices[uuid] = inv
	}
	memStoreMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"success": success,
		"uuid":    uuid,
		"message": msg,
		"status":  "CANCELADO",
	})
}

// GetConfig retorna la configuración actual de Profact
func GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, services.GlobalProfactService.Config)
}

// UpdateConfig permite alternar entre SIMULACION, SANDBOX y PRODUCCION
func UpdateConfig(c *gin.Context) {
	var body models.ProfactConfig
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Configuración inválida"})
		return
	}

	services.GlobalProfactService.Config = body
	c.JSON(http.StatusOK, gin.H{
		"message": "Configuración de Profact actualizada exitosamente",
		"config":  services.GlobalProfactService.Config,
	})
}

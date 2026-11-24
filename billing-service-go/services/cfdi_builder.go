package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"strings"
	"time"

	"billing-service-go/models"
)

// Genera un comprobante CFDI 4.0 sin timbrar
func BuildCFDI40(req models.FacturarRequest, cfg models.ProfactConfig, subtotal, iva, total float64, items []models.InvoiceItem) (*models.CFDIComprobante, []byte, error) {
	now := time.Now().Format("2006-01-02T15:04:05")

	formaPago := req.FormaPago
	if formaPago == "" {
		formaPago = "04" // Tarjeta de crédito por defecto
	}

	metodoPago := req.MetodoPago
	if metodoPago == "" {
		metodoPago = "PUE" // Pago en una sola exhibición
	}

	serie := "F"
	folio := fmt.Sprintf("%d", time.Now().Unix()%100000)

	// Construir Conceptos
	cfdiConceptos := make([]models.CFDIConcepto, 0, len(items))
	for _, it := range items {
		claveProd := it.ClaveProdServ
		if claveProd == "" {
			claveProd = "01010101" // Clave genérica estándar SAT
		}
		claveUnidad := it.ClaveUnidad
		if claveUnidad == "" {
			claveUnidad = "H87" // Pieza
		}
		unidad := it.Unidad
		if unidad == "" {
			unidad = "Pieza"
		}

		itemBase := it.Importe
		itemIVA := itemBase * 0.16

		c := models.CFDIConcepto{
			ClaveProdServ: claveProd,
			Cantidad:      fmt.Sprintf("%d", it.Cantidad),
			ClaveUnidad:   claveUnidad,
			Unidad:        unidad,
			Descripcion:   strings.ToUpper(it.Descripcion),
			ValorUnitario: fmt.Sprintf("%.2f", it.ValorUnitario),
			Importe:       fmt.Sprintf("%.2f", it.Importe),
			ObjetoImp:     "02", // 02: Sí objeto de impuesto
			ImpuestosConcept: models.CFDIImpuestosConcepto{
				Traslados: models.CFDIConceptoTraslados{
					Traslados: []models.CFDIConceptoTraslado{
						{
							Base:       fmt.Sprintf("%.2f", itemBase),
							Impuesto:   "002", // IVA
							TipoFactor: "Tasa",
							TasaOCuota: "0.160000",
							Importe:    fmt.Sprintf("%.2f", itemIVA),
						},
					},
				},
			},
		}
		cfdiConceptos = append(cfdiConceptos, c)
	}

	// Impuesto Traslado Global
	cfdiImpuestos := models.CFDIImpuestos{
		TotalImpuestosTrasladados: fmt.Sprintf("%.2f", iva),
		Traslados: models.CFDITotalTraslado{
			Traslado: []models.CFDIConceptoTraslado{
				{
					Base:       fmt.Sprintf("%.2f", subtotal),
					Impuesto:   "002",
					TipoFactor: "Tasa",
					TasaOCuota: "0.160000",
					Importe:    fmt.Sprintf("%.2f", iva),
				},
			},
		},
	}

	// Sello simulado criptográfico basado en SHA256 para el XML preliminar
	cadenaPrevia := fmt.Sprintf("||4.0|%s|%s|%s|%s|%.2f|MXN|%.2f|I|01|PUE|%s|%s|%s|%s|%s|%s|%s|%s|%s||",
		serie, folio, now, formaPago, subtotal, total, cfg.LugarExpedicion,
		cfg.RFCEmisor, cfg.NombreEmisor, cfg.RegimenFiscalEmisor,
		req.RFCReceptor, req.NombreReceptor, req.DomicilioFiscalReceptor, req.RegimenFiscalReceptor, req.UsoCFDI,
	)
	selloHash := sha256.Sum256([]byte(cadenaPrevia))
	selloBase64Simulado := hex.EncodeToString(selloHash[:]) + "=="

	comprobante := &models.CFDIComprobante{
		XmlnsCfdi:         "http://www.sat.gob.mx/cfd/4",
		XmlnsXsi:          "http://www.w3.org/2001/XMLSchema-instance",
		SchemaLocation:    "http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd",
		Version:           "4.0",
		Serie:             serie,
		Folio:             folio,
		Fecha:             now,
		Sello:             selloBase64Simulado,
		FormaPago:         formaPago,
		NoCertificado:     "30001000000400002434", // Certificado de pruebas SAT estándar
		Certificado:       "MIIFizCCA3OgAwIBAgIUMzAwMDEwMDAwMDA0MDAwMDI0MzQwDQYJKoZIhvcNAQELBQAwggErMQ8wDQYDVQQDDAZBQyBVQVQxHzAdBgNVBAoMFkRFU0FSUk9MTE8gREUgU09GVFdBUkU=",
		SubTotal:          fmt.Sprintf("%.2f", subtotal),
		Moneda:            "MXN",
		Total:             fmt.Sprintf("%.2f", total),
		TipoDeComprobante: "I",
		Exportacion:       "01",
		MetodoPago:        metodoPago,
		LugarExpedicion:   cfg.LugarExpedicion,
		Emisor: models.CFDIEmisor{
			Rfc:           cfg.RFCEmisor,
			Nombre:        strings.ToUpper(cfg.NombreEmisor),
			RegimenFiscal: cfg.RegimenFiscalEmisor,
		},
		Receptor: models.CFDIReceptor{
			Rfc:                     strings.ToUpper(req.RFCReceptor),
			Nombre:                  strings.ToUpper(req.NombreReceptor),
			DomicilioFiscalReceptor: req.DomicilioFiscalReceptor,
			RegimenFiscalReceptor:   req.RegimenFiscalReceptor,
			UsoCFDI:                 req.UsoCFDI,
		},
		Conceptos: models.CFDIConceptos{
			Conceptos: cfdiConceptos,
		},
		Impuestos: cfdiImpuestos,
	}

	xmlHeader := []byte("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	xmlData, err := xml.MarshalIndent(comprobante, "", "  ")
	if err != nil {
		return nil, nil, fmt.Errorf("error generando XML CFDI 4.0: %w", err)
	}

	fullXML := append(xmlHeader, xmlData...)
	return comprobante, fullXML, nil
}

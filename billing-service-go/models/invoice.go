package models

import (
	"encoding/xml"
	"time"
)

// Solicitud de Facturación desde el frontend o clientes
type FacturarRequest struct {
	OrderID                 string        `json:"order_id,omitempty"`
	OrderNumber             string        `json:"order_number,omitempty"`
	RFCReceptor             string        `json:"rfc_receptor" binding:"required"`
	NombreReceptor          string        `json:"nombre_receptor" binding:"required"`
	DomicilioFiscalReceptor string        `json:"cp_receptor" binding:"required"`          // Código postal del receptor
	RegimenFiscalReceptor   string        `json:"regimen_fiscal_receptor" binding:"required"` // ej. '616', '612', '605', '601'
	UsoCFDI                 string        `json:"uso_cfdi" binding:"required"`                // ej. 'G03', 'S01', 'G01'
	FormaPago               string        `json:"forma_pago,omitempty"`                       // ej. '04', '28', '03', '01'
	MetodoPago              string        `json:"metodo_pago,omitempty"`                      // ej. 'PUE', 'PPD'
	Items                   []InvoiceItem `json:"items,omitempty"`
}

type InvoiceItem struct {
	ProductID     string  `json:"product_id"`
	ClaveProdServ string  `json:"clave_prod_serv,omitempty"` // Catálogo SAT ej. '01010101'
	ClaveUnidad   string  `json:"clave_unidad,omitempty"`    // Catálogo SAT ej. 'H87' (Pieza)
	Unidad        string  `json:"unidad,omitempty"`
	Descripcion   string  `json:"descripcion"`
	Cantidad      int     `json:"cantidad"`
	ValorUnitario float64 `json:"valor_unitario"`
	Importe       float64 `json:"importe"`
	IVA           float64 `json:"iva"`
}

// Representación en Base de Datos de la Factura
type Invoice struct {
	ID                    string        `json:"id"`
	OrderID               string        `json:"order_id"`
	OrderNumber           string        `json:"order_number"`
	UUID                  string        `json:"uuid"` // Folio Fiscal SAT
	RFCEmisor             string        `json:"rfc_emisor"`
	NombreEmisor          string        `json:"nombre_emisor"`
	RFCReceptor           string        `json:"rfc_receptor"`
	NombreReceptor        string        `json:"nombre_receptor"`
	CPReceptor            string        `json:"cp_receptor"`
	RegimenFiscalReceptor string        `json:"regimen_fiscal_receptor"`
	UsoCFDI               string        `json:"uso_cfdi"`
	Subtotal              float64       `json:"subtotal"`
	IVA                   float64       `json:"iva"`
	Total                 float64       `json:"total"`
	Moneda                string        `json:"moneda"`
	FormaPago             string        `json:"forma_pago"`
	MetodoPago            string        `json:"metodo_pago"`
	Status                string        `json:"status"` // 'TIMBRADO', 'CANCELADO'
	Modo                  string        `json:"modo"`   // 'SIMULACION' o 'PROFACT_PAC'
	XMLTimbrado           string        `json:"xml_timbrado,omitempty"`
	QRCodeURL             string        `json:"qr_code_url"`
	SelloSAT              string        `json:"sello_sat,omitempty"`
	SelloCFD              string        `json:"sello_cfd,omitempty"`
	FechaTimbrado         time.Time     `json:"fecha_timbrado"`
	CreatedAt             time.Time     `json:"created_at"`
	Items                 []InvoiceItem `json:"items,omitempty"`
}

// Configuración actual de Profact
type ProfactConfig struct {
	Modo                string `json:"modo"` // 'SIMULACION', 'SANDBOX', 'PRODUCCION'
	UsuarioIntegrador   string `json:"usuario_integrador"`
	URL                 string `json:"url"`
	RFCEmisor           string `json:"rfc_emisor"`
	NombreEmisor        string `json:"nombre_emisor"`
	RegimenFiscalEmisor string `json:"regimen_fiscal_emisor"`
	LugarExpedicion     string `json:"lugar_expedicion"`
}

// ====================================================================
// MODELOS XML DEL SAT ANEXO 20 - CFDI 4.0
// ====================================================================

type CFDIComprobante struct {
	XMLName           xml.Name        `xml:"cfdi:Comprobante"`
	XmlnsCfdi         string          `xml:"xmlns:cfdi,attr"`
	XmlnsXsi          string          `xml:"xmlns:xsi,attr"`
	SchemaLocation    string          `xml:"xsi:schemaLocation,attr"`
	Version           string          `xml:"Version,attr"`
	Serie             string          `xml:"Serie,attr,omitempty"`
	Folio             string          `xml:"Folio,attr,omitempty"`
	Fecha             string          `xml:"Fecha,attr"`
	Sello             string          `xml:"Sello,attr"`
	FormaPago         string          `xml:"FormaPago,attr"`
	NoCertificado     string          `xml:"NoCertificado,attr"`
	Certificado       string          `xml:"Certificado,attr"`
	SubTotal          string          `xml:"SubTotal,attr"`
	Moneda            string          `xml:"Moneda,attr"`
	Total             string          `xml:"Total,attr"`
	TipoDeComprobante string          `xml:"TipoDeComprobante,attr"`
	Exportacion       string          `xml:"Exportacion,attr"`
	MetodoPago        string          `xml:"MetodoPago,attr"`
	LugarExpedicion   string          `xml:"LugarExpedicion,attr"`
	Emisor            CFDIEmisor      `xml:"cfdi:Emisor"`
	Receptor          CFDIReceptor    `xml:"cfdi:Receptor"`
	Conceptos         CFDIConceptos   `xml:"cfdi:Conceptos"`
	Impuestos         CFDIImpuestos   `xml:"cfdi:Impuestos"`
	Complemento       CFDIComplemento `xml:"cfdi:Complemento,omitempty"`
}

type CFDIEmisor struct {
	Rfc           string `xml:"Rfc,attr"`
	Nombre        string `xml:"Nombre,attr"`
	RegimenFiscal string `xml:"RegimenFiscal,attr"`
}

type CFDIReceptor struct {
	Rfc                     string `xml:"Rfc,attr"`
	Nombre                  string `xml:"Nombre,attr"`
	DomicilioFiscalReceptor string `xml:"DomicilioFiscalReceptor,attr"`
	RegimenFiscalReceptor   string `xml:"RegimenFiscalReceptor,attr"`
	UsoCFDI                 string `xml:"UsoCFDI,attr"`
}

type CFDIConceptos struct {
	Conceptos []CFDIConcepto `xml:"cfdi:Concepto"`
}

type CFDIConcepto struct {
	ClaveProdServ    string                 `xml:"ClaveProdServ,attr"`
	Cantidad         string                 `xml:"Cantidad,attr"`
	ClaveUnidad      string                 `xml:"ClaveUnidad,attr"`
	Unidad           string                 `xml:"Unidad,attr,omitempty"`
	Descripcion      string                 `xml:"Descripcion,attr"`
	ValorUnitario    string                 `xml:"ValorUnitario,attr"`
	Importe          string                 `xml:"Importe,attr"`
	ObjetoImp        string                 `xml:"ObjetoImp,attr"`
	ImpuestosConcept CFDIImpuestosConcepto  `xml:"cfdi:Impuestos,omitempty"`
}

type CFDIImpuestosConcepto struct {
	Traslados CFDIConceptoTraslados `xml:"cfdi:Traslados"`
}

type CFDIConceptoTraslados struct {
	Traslados []CFDIConceptoTraslado `xml:"cfdi:Traslado"`
}

type CFDIConceptoTraslado struct {
	Base       string `xml:"Base,attr"`
	Impuesto   string `xml:"Impuesto,attr"`
	TipoFactor string `xml:"TipoFactor,attr"`
	TasaOCuota string `xml:"TasaOCuota,attr"`
	Importe    string `xml:"Importe,attr"`
}

type CFDIImpuestos struct {
	TotalImpuestosTrasladados string            `xml:"TotalImpuestosTrasladados,attr"`
	Traslados                 CFDITotalTraslado `xml:"cfdi:Traslados"`
}

type CFDITotalTraslado struct {
	Traslado []CFDIConceptoTraslado `xml:"cfdi:Traslado"`
}

type CFDIComplemento struct {
	TimbreFiscalDigital *TimbreFiscalDigital `xml:"tfd:TimbreFiscalDigital,omitempty"`
}

type TimbreFiscalDigital struct {
	XMLName          xml.Name `xml:"tfd:TimbreFiscalDigital"`
	XmlnsTfd         string   `xml:"xmlns:tfd,attr"`
	SchemaLocation   string   `xml:"xsi:schemaLocation,attr"`
	Version          string   `xml:"Version,attr"`
	UUID             string   `xml:"UUID,attr"`
	FechaTimbrado    string   `xml:"FechaTimbrado,attr"`
	RfcProvCertif    string   `xml:"RfcProvCertif,attr"`
	SelloCFD         string   `xml:"SelloCFD,attr"`
	NoCertificadoSAT string   `xml:"NoCertificadoSAT,attr"`
	SelloSAT         string   `xml:"SelloSAT,attr"`
}

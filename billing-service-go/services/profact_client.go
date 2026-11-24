package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"billing-service-go/models"
)

type ProfactService struct {
	mu     sync.RWMutex
	Config models.ProfactConfig
}

var GlobalProfactService *ProfactService

func InitProfactService() {
	GlobalProfactService = &ProfactService{
		Config: models.ProfactConfig{
			Modo:                "SIMULACION", // Por defecto en SIMULACION
			UsuarioIntegrador:   "DEMO_PROFACT_INTEGRADOR",
			URL:                 "https://cfdi33-pruebas.buzoncfdi.mx:1443/Timbrado.asmx",
			RFCEmisor:           "EKU9003173C9", // RFC de pruebas oficial del SAT (Escuela Kemper Urgate)
			NombreEmisor:        "TIENDA EN LINEA PROFACT STORE S.A. DE C.V.",
			RegimenFiscalEmisor: "601", // General de Ley Personas Morales
			LugarExpedicion:     "01000",
		},
	}
}

// Generate realistic UUID v4 for SAT Folio Fiscal
func generateUUIDv4() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant RFC 4122
	return fmt.Sprintf("%08X-%04X-%04X-%04X-%012X",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// Generate SAT Verification QR Code URL
func generateSATQRUrl(uuid, rfcEmisor, rfcReceptor string, total float64, selloCFD string) string {
	selloLength := len(selloCFD)
	ultimos8 := "ABCDEF12"
	if selloLength >= 8 {
		ultimos8 = selloCFD[selloLength-8:]
	}
	return fmt.Sprintf("https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=%s&re=%s&rr=%s&tt=%.6f&fe=%s",
		uuid, rfcEmisor, rfcReceptor, total, ultimos8)
}

type TimbradoResponse struct {
	Success      bool   `json:"success"`
	ErrorCode    string `json:"error_code"`
	ErrorMessage string `json:"error_message"`
	UUID         string `json:"uuid"`
	FechaTimbre  string `json:"fecha_timbre"`
	SelloSAT     string `json:"sello_sat"`
	SelloCFD     string `json:"sello_cfd"`
	QRCodeURL    string `json:"qr_code_url"`
	XMLTimbrado  string `json:"xml_timbrado"`
	Modo         string `json:"modo"`
}

// TimbraCFDI procesa el comprobante, ya sea en modo SIMULACION o enviando petición SOAP real al PAC Profact
func (s *ProfactService) TimbraCFDI(comprobante *models.CFDIComprobante, rawXML []byte, idComprobante string) (*TimbradoResponse, error) {
	s.mu.RLock()
	cfg := s.Config
	s.mu.RUnlock()

	if cfg.Modo == "SIMULACION" {
		return s.timbrarSimulacion(comprobante, rawXML)
	}

	return s.timbrarSoapProfact(rawXML, idComprobante, cfg)
}

// Simulador idéntico al comportamiento oficial de Profact
func (s *ProfactService) timbrarSimulacion(comprobante *models.CFDIComprobante, rawXML []byte) (*TimbradoResponse, error) {
	uuid := generateUUIDv4()
	fechaTimbre := time.Now().Format("2006-01-02T15:04:05")

	hashSelloCFD := sha256.Sum256(rawXML)
	selloCFD := hex.EncodeToString(hashSelloCFD[:]) + "=="

	cadenaTimbre := fmt.Sprintf("||1.1|%s|%s|PRO140122XXX|%s|00001000000504465028||", uuid, fechaTimbre, selloCFD)
	hashSAT := sha256.Sum256([]byte(cadenaTimbre))
	selloSAT := hex.EncodeToString(hashSAT[:]) + "=="

	tfd := &models.TimbreFiscalDigital{
		XmlnsTfd:         "http://www.sat.gob.mx/TimbreFiscalDigital",
		SchemaLocation:   "http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd",
		Version:          "1.1",
		UUID:             uuid,
		FechaTimbrado:    fechaTimbre,
		RfcProvCertif:    "PRO140122XXX", // PAC Profact
		SelloCFD:         selloCFD,
		NoCertificadoSAT: "00001000000504465028",
		SelloSAT:         selloSAT,
	}

	comprobante.Complemento = models.CFDIComplemento{
		TimbreFiscalDigital: tfd,
	}
	comprobante.Sello = selloCFD

	xmlHeader := []byte("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	stampedXMLBytes, err := xml.MarshalIndent(comprobante, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("error serializando XML timbrado: %w", err)
	}
	fullStampedXML := string(append(xmlHeader, stampedXMLBytes...))

	var totalFloat float64
	fmt.Sscanf(comprobante.Total, "%f", &totalFloat)
	qrURL := generateSATQRUrl(uuid, comprobante.Emisor.Rfc, comprobante.Receptor.Rfc, totalFloat, selloCFD)

	return &TimbradoResponse{
		Success:      true,
		ErrorCode:    "0",
		ErrorMessage: "Timbrado exitoso (Ambiente Simulado Profact)",
		UUID:         uuid,
		FechaTimbre:  fechaTimbre,
		SelloSAT:     selloSAT,
		SelloCFD:     selloCFD,
		QRCodeURL:    qrURL,
		XMLTimbrado:  fullStampedXML,
		Modo:         "SIMULACION",
	}, nil
}

// Invocación SOAP real al Web Service de Profact
func (s *ProfactService) timbrarSoapProfact(rawXML []byte, idComprobante string, cfg models.ProfactConfig) (*TimbradoResponse, error) {
	xmlB64 := base64.StdEncoding.EncodeToString(rawXML)

	soapPayload := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TimbraCFDI xmlns="http://tempuri.org/">
      <usuarioIntegrador>%s</usuarioIntegrador>
      <xmlComprobanteBase64>%s</xmlComprobanteBase64>
      <idComprobante>%s</idComprobante>
    </TimbraCFDI>
  </soap:Body>
</soap:Envelope>`, cfg.UsuarioIntegrador, xmlB64, idComprobante)

	req, err := http.NewRequest("POST", cfg.URL, strings.NewReader(soapPayload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "http://tempuri.org/TimbraCFDI")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error de conexión con WebService de Profact (%s): %w", cfg.URL, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error leyendo respuesta del PAC: %w", err)
	}

	// Parsear elementos anyType de la respuesta SOAP
	type ProfactEnvelope struct {
		Body struct {
			TimbraCFDIResponse struct {
				TimbraCFDIResult struct {
					Items []string `xml:"anyType"`
				} `xml:"TimbraCFDIResult"`
			} `xml:"TimbraCFDIResponse"`
		} `xml:"Body"`
	}

	var envelope ProfactEnvelope
	if err := xml.Unmarshal(respBytes, &envelope); err != nil {
		return nil, fmt.Errorf("error interpretando XML SOAP del PAC: %w (Respuesta: %s)", err, string(respBytes))
	}

	items := envelope.Body.TimbraCFDIResponse.TimbraCFDIResult.Items
	if len(items) < 3 {
		return nil, fmt.Errorf("respuesta incompleta del PAC Profact: %s", string(respBytes))
	}

	errCode := items[1]
	errDesc := items[2]

	if errCode != "0" {
		return &TimbradoResponse{
			Success:      false,
			ErrorCode:    errCode,
			ErrorMessage: errDesc,
			Modo:         "PROFACT_PAC",
		}, nil
	}

	stampedXML := ""
	if len(items) > 3 {
		stampedXML = items[3]
	}

	// Extraer UUID del XML timbrado
	uuid := ""
	if strings.Contains(stampedXML, "UUID=\"") {
		parts := strings.Split(stampedXML, "UUID=\"")
		if len(parts) > 1 {
			uuid = strings.Split(parts[1], "\"")[0]
		}
	}

	return &TimbradoResponse{
		Success:      true,
		ErrorCode:    "0",
		ErrorMessage: "Timbrado exitoso ante PAC Profact",
		UUID:         uuid,
		XMLTimbrado:  stampedXML,
		Modo:         "PROFACT_PAC",
	}, nil
}

// CancelaCFDI implementa el método de cancelación
func (s *ProfactService) CancelaCFDI(uuid, rfcEmisor string) (bool, string, error) {
	s.mu.RLock()
	cfg := s.Config
	s.mu.RUnlock()

	if cfg.Modo == "SIMULACION" {
		return true, "Cancelación simulada exitosa ante el SAT (Acuse de Cancelación generado)", nil
	}

	soapPayload := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CancelaCFDI xmlns="http://tempuri.org/">
      <usuarioIntegrador>%s</usuarioIntegrador>
      <rfcEmisor>%s</rfcEmisor>
      <folioUUID>%s</folioUUID>
    </CancelaCFDI>
  </soap:Body>
</soap:Envelope>`, cfg.UsuarioIntegrador, rfcEmisor, uuid)

	req, err := http.NewRequest("POST", cfg.URL, strings.NewReader(soapPayload))
	if err != nil {
		return false, "", err
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "http://tempuri.org/CancelaCFDI")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, "", err
	}
	defer resp.Body.Close()

	return true, "Solicitud de cancelación enviada a Profact", nil
}

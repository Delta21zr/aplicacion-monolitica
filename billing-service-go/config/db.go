package config

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB
var IsPostgresConnected bool

func ConnectDB() {
	connStr := "postgres://postgres:secret@localhost:5432/user_service_db?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil || db.Ping() != nil {
		fallbackStr := "user=postgres password=secret dbname=postgres sslmode=disable"
		db, err = sql.Open("postgres", fallbackStr)
		if err != nil || db.Ping() != nil {
			log.Println("⚠️ [Billing Service] PostgreSQL no disponible localmente. Activando modo almacenamiento en memoria para facturas.")
			IsPostgresConnected = false
			return
		}
	}

	createTablesQuery := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

	CREATE TABLE IF NOT EXISTS invoices (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_id VARCHAR(100) NOT NULL,
		order_number VARCHAR(100) NOT NULL,
		uuid VARCHAR(100) UNIQUE NOT NULL,
		rfc_emisor VARCHAR(20) NOT NULL,
		nombre_emisor VARCHAR(255) NOT NULL,
		rfc_receptor VARCHAR(20) NOT NULL,
		nombre_receptor VARCHAR(255) NOT NULL,
		cp_receptor VARCHAR(10) NOT NULL,
		regimen_fiscal_receptor VARCHAR(10) NOT NULL,
		uso_cfdi VARCHAR(10) NOT NULL,
		subtotal NUMERIC(10, 2) NOT NULL,
		iva NUMERIC(10, 2) NOT NULL,
		total NUMERIC(10, 2) NOT NULL,
		moneda VARCHAR(10) NOT NULL DEFAULT 'MXN',
		forma_pago VARCHAR(10) NOT NULL DEFAULT '04',
		metodo_pago VARCHAR(10) NOT NULL DEFAULT 'PUE',
		status VARCHAR(50) NOT NULL DEFAULT 'TIMBRADO',
		modo VARCHAR(50) NOT NULL DEFAULT 'SIMULACION',
		xml_timbrado TEXT NOT NULL,
		qr_code_url TEXT NOT NULL,
		sello_sat TEXT,
		sello_cfd TEXT,
		fecha_timbrado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = db.Exec(createTablesQuery)
	if err != nil {
		log.Printf("Aviso creando tabla invoices: %v", err)
	}

	DB = db
	IsPostgresConnected = true
	fmt.Println("✅ [Billing Service] Conectado a PostgreSQL y tabla 'invoices' lista.")
}

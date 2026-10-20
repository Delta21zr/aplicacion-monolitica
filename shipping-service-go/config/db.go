package config

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func ConnectDB() {
	connStr := "postgres://postgres:secret@localhost:5432/user_service_db?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil || db.Ping() != nil {
		fallbackStr := "user=postgres password=secret dbname=postgres sslmode=disable"
		db, err = sql.Open("postgres", fallbackStr)
		if err != nil {
			log.Fatal("Could not open postgres connection:", err)
		}
		if pingErr := db.Ping(); pingErr != nil {
			log.Fatal("Could not connect to postgres:", pingErr)
		}
	}

	fmt.Println("Shipping Service connected to PostgreSQL!")

	createTablesQuery := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

	CREATE TABLE IF NOT EXISTS shipments (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_id VARCHAR(100) NOT NULL,
		carrier VARCHAR(50) NOT NULL,
		tracking_number VARCHAR(100) UNIQUE NOT NULL,
		origin_zip VARCHAR(20) NOT NULL,
		destination_zip VARCHAR(20) NOT NULL,
		destination_address TEXT NOT NULL,
		service_type VARCHAR(50) NOT NULL,
		shipping_cost NUMERIC(10, 2) NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'PACKING', -- PACKING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, RETURNED
		estimated_delivery TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS shipment_checkpoints (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
		status VARCHAR(50) NOT NULL,
		location VARCHAR(100) NOT NULL,
		description TEXT NOT NULL,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = db.Exec(createTablesQuery)
	if err != nil {
		log.Printf("Notice on creating tables (may exist): %v", err)
	}

	DB = db
}

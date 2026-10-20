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
		// Fallback to default postgres database if user_service_db is not available
		fallbackStr := "user=postgres password=secret dbname=postgres sslmode=disable"
		db, err = sql.Open("postgres", fallbackStr)
		if err != nil {
			log.Fatal("Could not open postgres connection:", err)
		}
		if pingErr := db.Ping(); pingErr != nil {
			log.Fatal("Could not connect to postgres:", pingErr)
		}
	}

	fmt.Println("Order Service connected to PostgreSQL!")

	createTablesQuery := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

	CREATE TABLE IF NOT EXISTS orders (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_number VARCHAR(50) UNIQUE NOT NULL,
		user_id VARCHAR(100) NOT NULL,
		subtotal NUMERIC(10, 2) NOT NULL,
		discount NUMERIC(10, 2) DEFAULT 0,
		iva NUMERIC(10, 2) NOT NULL,
		total NUMERIC(10, 2) NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'PAID',
		payment_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
		payment_method VARCHAR(50) NOT NULL,
		shipping_address TEXT,
		crypto_signature VARCHAR(128) NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS order_items (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
		product_id VARCHAR(100) NOT NULL,
		name VARCHAR(255) NOT NULL,
		quantity INT NOT NULL,
		price NUMERIC(10, 2) NOT NULL,
		subtotal NUMERIC(10, 2) NOT NULL
	);

	CREATE TABLE IF NOT EXISTS payments (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
		user_id VARCHAR(100) NOT NULL,
		payment_gateway VARCHAR(50) NOT NULL,
		transaction_ref VARCHAR(100) NOT NULL,
		amount NUMERIC(10, 2) NOT NULL,
		status VARCHAR(50) NOT NULL,
		card_last_four VARCHAR(10),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS receipts (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
		receipt_number VARCHAR(100) UNIQUE NOT NULL,
		content_json TEXT NOT NULL,
		crypto_hash VARCHAR(128) NOT NULL,
		issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = db.Exec(createTablesQuery)
	if err != nil {
		log.Printf("Warning creating tables (or tables already exist): %v", err)
	}

	DB = db
}

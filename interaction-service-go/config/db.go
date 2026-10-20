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

	fmt.Println("Interaction Service connected to PostgreSQL!")

	createTablesQuery := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

	CREATE TABLE IF NOT EXISTS reviews (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		product_id VARCHAR(100) NOT NULL,
		user_id VARCHAR(100) NOT NULL,
		rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
		title VARCHAR(200) NOT NULL,
		comment TEXT NOT NULL,
		photos_json TEXT DEFAULT '[]',
		is_verified_buyer BOOLEAN DEFAULT false,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	ALTER TABLE reviews ADD COLUMN IF NOT EXISTS photos_json TEXT DEFAULT '[]';

	CREATE TABLE IF NOT EXISTS wishlists (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id VARCHAR(100) NOT NULL,
		name VARCHAR(150) NOT NULL,
		is_public BOOLEAN DEFAULT true,
		share_token VARCHAR(100) UNIQUE NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS wishlist_items (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		wishlist_id UUID REFERENCES wishlists(id) ON DELETE CASCADE,
		product_id VARCHAR(100) NOT NULL,
		notes TEXT,
		added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE (wishlist_id, product_id)
	);

	CREATE TABLE IF NOT EXISTS notifications (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id VARCHAR(100) NOT NULL,
		recipient_email VARCHAR(200),
		type VARCHAR(50) NOT NULL, -- ORDER_CONFIRMATION, ORDER_SHIPPED, ORDER_DELIVERED
		subject VARCHAR(255) NOT NULL,
		body_content TEXT NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'SENT',
		sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = db.Exec(createTablesQuery)
	if err != nil {
		log.Printf("Notice on creating tables (may exist): %v", err)
	}

	DB = db
}

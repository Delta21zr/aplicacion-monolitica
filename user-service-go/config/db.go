package config

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func ConnectDB() {
	// Reutilizamos las credenciales del contenedor Docker que ya está corriendo
	connStr := "postgres://postgres:secret@localhost:5432/user_service_db?sslmode=disable"
	
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Error conectando a la base de datos: ", err)
	}

	err = DB.Ping()
	if err != nil {
		log.Fatal("Base de datos inalcanzable: ", err)
	}

	fmt.Println("Conectado a PostgreSQL desde Go!")

	// Crear tablas si no existen
	createTables := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

	CREATE TABLE IF NOT EXISTS addresses (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL,
		alias VARCHAR(50), -- e.g., 'Casa', 'Oficina'
		street VARCHAR(255) NOT NULL,
		city VARCHAR(100) NOT NULL,
		zip_code VARCHAR(20) NOT NULL,
		country VARCHAR(100) NOT NULL,
		is_default BOOLEAN DEFAULT false,
		is_shipping BOOLEAN DEFAULT false,
		is_billing BOOLEAN DEFAULT false,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	-- En caso de que la tabla ya exista de antes, agregamos las columnas
	ALTER TABLE addresses ADD COLUMN IF NOT EXISTS is_shipping BOOLEAN DEFAULT false;
	ALTER TABLE addresses ADD COLUMN IF NOT EXISTS is_billing BOOLEAN DEFAULT false;

	CREATE TABLE IF NOT EXISTS payment_methods (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL,
		card_brand VARCHAR(50),
		last_four VARCHAR(4),
		stripe_token VARCHAR(255),
		is_default BOOLEAN DEFAULT false
	);

	CREATE TABLE IF NOT EXISTS password_resets (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		email VARCHAR(255) NOT NULL,
		token VARCHAR(255) NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		used BOOLEAN DEFAULT false
	);

	CREATE TABLE IF NOT EXISTS blacklisted_tokens (
		token VARCHAR(500) PRIMARY KEY,
		blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err = DB.Exec(createTables)
	if err != nil {
		log.Fatal("Error creando tablas: ", err)
	}
}

package config

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func ConnectDB() {
	// Adjust connection string for your environment
	connStr := "user=postgres password=secret dbname=postgres sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("Could not connect to postgres:", err)
	}

	fmt.Println("Connected to PostgreSQL (Inventory DB)!")

	// Create table if not exists
	createTableQuery := `
	CREATE TABLE IF NOT EXISTS inventory (
		product_id VARCHAR(50) PRIMARY KEY,
		stock INT NOT NULL DEFAULT 0
	);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatal("Failed to create table:", err)
	}

	DB = db
}

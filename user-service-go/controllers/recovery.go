package controllers

import (
	"database/sql"
	"net/http"
	"time"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type RecoverInput struct {
	Email string `json:"email" binding:"required,email"`
}

func RecoverPassword(c *gin.Context) {
	var input RecoverInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var userID string
	err := config.DB.QueryRow("SELECT id FROM users WHERE email = $1", input.Email).Scan(&userID)
	if err != nil {
		// Prevent email enumeration
		c.JSON(http.StatusOK, gin.H{"message": "Si el correo existe, se enviará un enlace de recuperación."})
		return
	}

	// Mock token generation (In real life use a secure random token)
	resetToken := "mock-reset-token-12345"
	expires := time.Now().Add(1 * time.Hour)

	_, err = config.DB.Exec(
		"INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)",
		input.Email, resetToken, expires,
	)

	// Mock email sending
	c.JSON(http.StatusOK, gin.H{
		"message": "Si el correo existe, se enviará un enlace de recuperación.",
		"debug_token": resetToken, // For testing purposes only
	})
}

type ResetInput struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"new_password" binding:"required,min=6"`
}

func ResetPassword(c *gin.Context) {
	var input ResetInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var email string
	var expiresAt time.Time
	err := config.DB.QueryRow(
		"SELECT email, expires_at FROM password_resets WHERE token = $1 AND used = false",
		input.Token,
	).Scan(&email, &expiresAt)

	if err == sql.ErrNoRows || time.Now().After(expiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token inválido o expirado"})
		return
	}

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	
	// Transaction
	tx, _ := config.DB.Begin()
	tx.Exec("UPDATE users SET password_hash = $1 WHERE email = $2", string(hashedPassword), email)
	tx.Exec("UPDATE password_resets SET used = true WHERE token = $1", input.Token)
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Contraseña actualizada exitosamente"})
}

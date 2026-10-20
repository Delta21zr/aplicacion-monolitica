package controllers

import (
	"database/sql"
	"net/http"
	"time"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Structs para validar el Body de las peticiones (Equivalente a req.body en Node)
type RegisterInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	FullName string `json:"full_name" binding:"required"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

var JWTSecret = []byte("super-secret-key-change-in-prod")

func GenerateToken(id, email, role string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":    id,
		"email": email,
		"role":  role,
		"exp":   time.Now().Add(time.Hour * 24).Unix(),
	})
	return token.SignedString(JWTSecret)
}

func Register(c *gin.Context) {
	var input RegisterInput
	
	// Validar que el JSON enviado cumpla con la estructura
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Datos inválidos", "error": err.Error()})
		return
	}

	// Verificar existencia en PostgreSQL
	var existingID string
	err := config.DB.QueryRow("SELECT id FROM users WHERE email = $1", input.Email).Scan(&existingID)
	if err != sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"message": "El correo ya está registrado."})
		return
	}

	// Encriptar contraseña (bcrypt)
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Error al encriptar contraseña"})
		return
	}

	// Insertar usuario
	var newID, newRole string
	err = config.DB.QueryRow(
		`INSERT INTO users (email, password_hash, full_name, provider) 
		 VALUES ($1, $2, $3, 'local') RETURNING id, role`,
		input.Email, string(hashedPassword), input.FullName,
	).Scan(&newID, &newRole)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Error al guardar en BD"})
		return
	}

	token, _ := GenerateToken(newID, input.Email, newRole)

	c.JSON(http.StatusCreated, gin.H{
		"user":  gin.H{"id": newID, "email": input.Email, "full_name": input.FullName, "role": newRole},
		"token": token,
	})
}

func Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Datos inválidos"})
		return
	}

	// Struct interno para almacenar resultados de la BD
	var user struct {
		ID           string
		Email        string
		PasswordHash string
		FullName     string
		Role         string
		Provider     string
	}

	err := config.DB.QueryRow(
		"SELECT id, email, password_hash, full_name, role, provider FROM users WHERE email = $1",
		input.Email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FullName, &user.Role, &user.Provider)

	if err == sql.ErrNoRows || user.Provider != "local" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Credenciales inválidas."})
		return
	}

	// Comparar contraseñas
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Credenciales inválidas."})
		return
	}

	token, _ := GenerateToken(user.ID, user.Email, user.Role)

	c.JSON(http.StatusOK, gin.H{
		"user":  gin.H{"id": user.ID, "email": user.Email, "full_name": user.FullName, "role": user.Role},
		"token": token,
	})
}

func Logout(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" || len(authHeader) <= 7 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Token no proporcionado"})
		return
	}

	tokenString := authHeader[7:] // remove "Bearer "
	
	// Add token to blacklist in database
	_, err := config.DB.Exec("INSERT INTO blacklisted_tokens (token) VALUES ($1)", tokenString)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Error al cerrar sesiA3n"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "SesiA3n cerrada exitosamente"})
}

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

func GenerateToken(id, email, role, subscriptionPlan string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":                id,
		"email":             email,
		"role":              role,
		"subscription_plan": subscriptionPlan,
		"exp":               time.Now().Add(time.Hour * 24).Unix(),
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

	// Verificar cuota máxima de usuarios permitidos por la Licencia del Sistema (Tier activo)
	maxUsers, _, currentUsers, _, tierName := CheckSystemQuota()
	if maxUsers != -1 && currentUsers >= maxUsers {
		c.JSON(http.StatusBadRequest, gin.H{
			"message": "Límite de usuarios de la licencia del sistema alcanzado (" + tierName + "). Contacta al administrador para ampliar la capacidad con Tokens o subir de Tier.",
		})
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

	// Insertar usuario con rol 'cliente', sin tier activo ('none', tier 0) y 150 tokens de bienvenida
	var newID, newRole, newPlan string
	var newTier, tokenBalance int
	err = config.DB.QueryRow(
		`INSERT INTO users (email, password_hash, full_name, role, provider, subscription_plan, subscription_tier, token_balance) 
		 VALUES ($1, $2, $3, 'cliente', 'local', 'none', 0, 150) 
		 RETURNING id, role, COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0), COALESCE(token_balance, 150)`,
		input.Email, string(hashedPassword), input.FullName,
	).Scan(&newID, &newRole, &newPlan, &newTier, &tokenBalance)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Error al guardar en BD"})
		return
	}

	// Registrar bono de bienvenida en historial de tokens
	_, _ = config.DB.Exec(`
		INSERT INTO token_transactions (user_id, type, amount, balance_after, description, price_paid_mxn)
		VALUES ($1, 'welcome_bonus', $2, $2, 'Bono de bienvenida al crear tu cuenta (+150 Tokens)', 0.00)
	`, newID, tokenBalance)

	token, _ := GenerateToken(newID, input.Email, newRole, newPlan)

	c.JSON(http.StatusCreated, gin.H{
		"user": gin.H{
			"id":                  newID,
			"email":               input.Email,
			"full_name":           input.FullName,
			"role":                newRole,
			"subscription_plan":   newPlan,
			"subscription_tier":   newTier,
			"token_balance":       tokenBalance,
			"subscription_status": "active",
		},
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
		ID                 string
		Email              string
		PasswordHash       string
		FullName           string
		Role               string
		Provider           string
		SubscriptionPlan   string
		SubscriptionTier   int
		TokenBalance       int
		SubscriptionStatus string
	}

	err := config.DB.QueryRow(
		`SELECT id, email, password_hash, full_name, role, provider, 
		        COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0), COALESCE(token_balance, 150), COALESCE(subscription_status, 'active') 
		 FROM users WHERE email = $1`,
		input.Email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FullName, &user.Role, &user.Provider, &user.SubscriptionPlan, &user.SubscriptionTier, &user.TokenBalance, &user.SubscriptionStatus)

	if err == sql.ErrNoRows || user.Provider != "local" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Credenciales inválidas."})
		return
	}

	// Comparar contraseñas
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Credenciales inválidas."})
		return
	}

	token, _ := GenerateToken(user.ID, user.Email, user.Role, user.SubscriptionPlan)

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":                  user.ID,
			"email":               user.Email,
			"full_name":           user.FullName,
			"role":                user.Role,
			"subscription_plan":   user.SubscriptionPlan,
			"subscription_tier":   user.SubscriptionTier,
			"token_balance":       user.TokenBalance,
			"subscription_status": user.SubscriptionStatus,
		},
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

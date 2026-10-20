package middlewares

import (
	"net/http"
	"strings"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var JWTSecret = []byte("super-secret-key-change-in-prod")

// Middleware para verificar JWT en Go (Equivalente a authMiddleware.js)
func VerifyToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Acceso denegado. Token no proporcionado."})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Verify if token is blacklisted
		var exists string
		err := config.DB.QueryRow("SELECT token FROM blacklisted_tokens WHERE token = $1", tokenString).Scan(&exists)
		if err == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Token expirado o sesiA3n cerrada."})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return JWTSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Token inválido o expirado."})
			c.Abort()
			return
		}

		// Extraer datos e inyectarlos en el contexto
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("userID", claims["id"])
			c.Set("userRole", claims["role"])
		}

		c.Next()
	}
}

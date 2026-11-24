package controllers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
)

type AdminUserRow struct {
	ID                    string    `json:"id"`
	Email                 string    `json:"email"`
	FullName              string    `json:"full_name"`
	Role                  string    `json:"role"`
	Provider              string    `json:"provider"`
	SubscriptionPlan      string    `json:"subscription_plan"`
	SubscriptionTier      int       `json:"subscription_tier"`
	TokenBalance          int       `json:"token_balance"`
	SubscriptionStatus    string    `json:"subscription_status"`
	SubscriptionExpiresAt *string   `json:"subscription_expires_at"`
	CreatedAt             time.Time `json:"created_at"`
}

type UpdateSubscriptionRequest struct {
	PlanID string `json:"plan_id" binding:"required"`
}

type UpdateTokensRequest struct {
	Amount int    `json:"amount" binding:"required"`
	Reason string `json:"reason"`
}

type UpdateRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

// AdminGetAllUsers obtiene la lista de todos los usuarios registrados con su Tier, saldo de Tokens y rol
func AdminGetAllUsers(c *gin.Context) {
	rows, err := config.DB.Query(`
		SELECT id, email, full_name, role, provider, 
		       COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0),
		       COALESCE(token_balance, 150), COALESCE(subscription_status, 'active'),
		       subscription_expires_at, created_at
		FROM users
		ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar usuarios en BD", "details": err.Error()})
		return
	}
	defer rows.Close()

	var users []AdminUserRow
	for rows.Next() {
		var u AdminUserRow
		var exp sql.NullTime
		if err := rows.Scan(
			&u.ID, &u.Email, &u.FullName, &u.Role, &u.Provider,
			&u.SubscriptionPlan, &u.SubscriptionTier, &u.TokenBalance,
			&u.SubscriptionStatus, &exp, &u.CreatedAt,
		); err == nil {
			if exp.Valid {
				formatted := exp.Time.Format(time.RFC3339)
				u.SubscriptionExpiresAt = &formatted
			}
			users = append(users, u)
		}
	}

	c.JSON(http.StatusOK, users)
}

// AdminUpdateUserSubscription permite a un administrador asignar o cambiar directamente el Tier de un usuario
func AdminUpdateUserSubscription(c *gin.Context) {
	targetUserID := c.Param("id")

	var req UpdateSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos", "details": err.Error()})
		return
	}

	if req.PlanID == "none" || req.PlanID == "free" {
		res, err := config.DB.Exec(`
			UPDATE users 
			SET subscription_plan = 'none', subscription_tier = 0, subscription_status = 'inactive', 
			    subscription_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, targetUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al remover Tier del usuario"})
			return
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":           "Usuario cambiado a estado Base (Sin Tier activo) por Administrador",
			"user_id":           targetUserID,
			"subscription_plan": "none",
			"subscription_tier": 0,
		})
		return
	}

	// Validar que el Tier exista
	var planName string
	var tierLevel int
	err := config.DB.QueryRow("SELECT name, COALESCE(tier_level, 1) FROM subscription_plans WHERE id = $1", req.PlanID).Scan(&planName, &tierLevel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El Tier especificado no existe (usa: none, tier_1, tier_2, tier_3)"})
		return
	}

	exp := time.Now().AddDate(0, 1, 0)

	res, err := config.DB.Exec(`
		UPDATE users 
		SET subscription_plan = $1, subscription_tier = $2, subscription_status = 'active', 
		    subscription_expires_at = $3, updated_at = CURRENT_TIMESTAMP
		WHERE id = $4
	`, req.PlanID, tierLevel, exp, targetUserID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar el Tier del usuario"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}

	// Registrar en historial de suscripciones
	_, _ = config.DB.Exec(`
		INSERT INTO user_subscriptions (user_id, plan_id, status, amount_paid, tokens_spent, started_at, expires_at)
		VALUES ($1, $2, 'active (admin-assigned)', 0.00, 0, CURRENT_TIMESTAMP, $3)
	`, targetUserID, req.PlanID, exp)

	c.JSON(http.StatusOK, gin.H{
		"message":           fmt.Sprintf("Tier del usuario actualizado a %s por Administrador", planName),
		"user_id":           targetUserID,
		"subscription_plan": req.PlanID,
		"subscription_tier": tierLevel,
		"plan_name":         planName,
	})
}

// AdminUpdateUserTokens permite al administrador otorgar o descontar Tokens a un usuario
func AdminUpdateUserTokens(c *gin.Context) {
	targetUserID := c.Param("id")

	var req UpdateTokensRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: especifica la cantidad de tokens (amount)"})
		return
	}

	var newBalance int
	err := config.DB.QueryRow(`
		UPDATE users
		SET token_balance = GREATEST(0, COALESCE(token_balance, 0) + $1), updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
		RETURNING token_balance
	`, req.Amount, targetUserID).Scan(&newBalance)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado o error al ajustar tokens"})
		return
	}

	reason := req.Reason
	if reason == "" {
		if req.Amount >= 0 {
			reason = fmt.Sprintf("Recarga manual por Administrador (+%d Tokens)", req.Amount)
		} else {
			reason = fmt.Sprintf("Ajuste manual por Administrador (%d Tokens)", req.Amount)
		}
	}

	_, _ = config.DB.Exec(`
		INSERT INTO token_transactions (user_id, type, amount, balance_after, description, price_paid_mxn)
		VALUES ($1, 'admin_grant', $2, $3, $4, 0.00)
	`, targetUserID, req.Amount, newBalance, reason)

	c.JSON(http.StatusOK, gin.H{
		"message":       fmt.Sprintf("Saldo de tokens actualizado correctamente. Nuevo saldo: %d Tokens", newBalance),
		"user_id":       targetUserID,
		"tokens_delta":  req.Amount,
		"token_balance": newBalance,
	})
}

// AdminUpdateUserRole permite a un administrador promover o degradar roles ('cliente' o 'admin')
func AdminUpdateUserRole(c *gin.Context) {
	targetUserID := c.Param("id")

	var req UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos", "details": err.Error()})
		return
	}

	if req.Role != "cliente" && req.Role != "admin" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rol inválido. Los roles permitidos son 'cliente' o 'admin'"})
		return
	}

	// Verificar cuota de Administradores permitidos según el Tier de Licencia del Sistema
	if req.Role == "admin" {
		var currentRole string
		_ = config.DB.QueryRow("SELECT role FROM users WHERE id = $1", targetUserID).Scan(&currentRole)
		if currentRole != "admin" {
			_, maxAdmins, _, currentAdmins, tierName := CheckSystemQuota()
			if maxAdmins != -1 && currentAdmins >= maxAdmins {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": fmt.Sprintf("Límite de Administradores alcanzado en la licencia actual (%s: %d/%d Admins activos). Para agregar más administradores, sube el sistema a Tier 2 / Tier 3 o adquiere '+1 Administrador' con 80 Tokens.", tierName, currentAdmins, maxAdmins),
				})
				return
			}
		}
	}

	res, err := config.DB.Exec(`
		UPDATE users 
		SET role = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, req.Role, targetUserID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar rol del usuario"})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Rol de usuario actualizado exitosamente",
		"user_id": targetUserID,
		"role":    req.Role,
	})
}

// AdminGetStats entrega métricas consolidadas sobre usuarios, Tiers y economía de Tokens
func AdminGetStats(c *gin.Context) {
	var totalUsers, noneCount, tier1Count, tier2Count, tier3Count, adminCount int
	var totalTokensCirculation, totalTokensSpent int
	var tokenSalesRevenue float64

	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE COALESCE(subscription_plan, 'none') IN ('none', 'free', '')").Scan(&noneCount)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE subscription_plan = 'tier_1'").Scan(&tier1Count)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE subscription_plan = 'tier_2'").Scan(&tier2Count)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE subscription_plan = 'tier_3'").Scan(&tier3Count)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&adminCount)

	_ = config.DB.QueryRow("SELECT COALESCE(SUM(token_balance), 0) FROM users").Scan(&totalTokensCirculation)
	_ = config.DB.QueryRow("SELECT COALESCE(SUM(ABS(amount)), 0) FROM token_transactions WHERE type = 'subscription_tier'").Scan(&totalTokensSpent)
	_ = config.DB.QueryRow("SELECT COALESCE(SUM(price_paid_mxn), 0) FROM token_transactions WHERE type = 'purchase'").Scan(&tokenSalesRevenue)

	// Tokens mensuales recurrentes por Tiers activos
	monthlyTokenVolume := (tier1Count * 100) + (tier2Count * 250) + (tier3Count * 500)

	c.JSON(http.StatusOK, gin.H{
		"total_users":  totalUsers,
		"admin_users":  adminCount,
		"client_users": totalUsers - adminCount,
		"tiers_distribution": gin.H{
			"none":   noneCount,
			"tier_1": tier1Count,
			"tier_2": tier2Count,
			"tier_3": tier3Count,
		},
		"total_tokens_circulation": totalTokensCirculation,
		"total_tokens_spent":       totalTokensSpent,
		"monthly_token_volume":     monthlyTokenVolume,
		"token_sales_revenue_mxn":  tokenSalesRevenue,
		"currency":                 "MXN",
	})
}

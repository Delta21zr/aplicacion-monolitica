package controllers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
)

type SubscriptionPlan struct {
	ID                      string   `json:"id"`
	TierLevel               int      `json:"tier_level"`
	Name                    string   `json:"name"`
	TokenCost               int      `json:"token_cost"`
	Price                   float64  `json:"price"`
	BillingPeriod           string   `json:"billing_period"`
	DiscountPercent         int      `json:"discount_percent"`
	ShippingDiscountPercent int      `json:"shipping_discount_percent"`
	FreeShipping            bool     `json:"free_shipping"`
	PrioritySupport         bool     `json:"priority_support"`
	Description             string   `json:"description"`
	BadgeColor              string   `json:"badge_color"`
	Icon                    string   `json:"icon"`
	Features                []string `json:"features"`
}

type SubscribeInput struct {
	PlanID string `json:"plan_id" binding:"required"`
}

type TokenPackage struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Tokens      int     `json:"tokens"`
	BonusTokens int     `json:"bonus_tokens"`
	TotalTokens int     `json:"total_tokens"`
	PriceMXN    float64 `json:"price_mxn"`
	Badge       string  `json:"badge"`
	Icon        string  `json:"icon"`
	Description string  `json:"description"`
}

type PurchaseTokensInput struct {
	PackageID     string `json:"package_id"`
	CustomTokens  int    `json:"custom_tokens"`
	PaymentMethod string `json:"payment_method"`
}

type TokenTransaction struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Amount       int       `json:"amount"`
	BalanceAfter int       `json:"balance_after"`
	Description  string    `json:"description"`
	PricePaidMXN float64   `json:"price_paid_mxn"`
	CreatedAt    time.Time `json:"created_at"`
}

// PlanFeatures define los beneficios detallados de cada Tier
var PlanFeatures = map[string][]string{
	"tier_1": {
		"Activación inmediata por 100 Tokens / mes",
		"5% de descuento automático en todos los productos del catálogo",
		"50% de descuento en tarifas de envío estándar",
		"Acceso anticipado a preventas de Tier 1",
		"Insignia oficial 🥉 Tier 1 · Bronce en perfil y barra de navegación",
	},
	"tier_2": {
		"Activación inmediata por 250 Tokens / mes",
		"12% de descuento automático en todo el carrito de compras",
		"Envíos estándar 100% GRATIS en todos tus pedidos",
		"Soporte prioritario y atención preferencial",
		"Acceso exclusivo a ofertas relámpago de Tier 2",
		"Insignia oficial 🥈 Tier 2 · Plata en perfil y barra de navegación",
	},
	"tier_3": {
		"Activación inmediata por 500 Tokens / mes",
		"20% de descuento automático en todo el catálogo",
		"Envíos Express prioritarios 100% GRATIS garantizados",
		"Facturación electrónica CFDI 4.0 automática e inmediata",
		"Soporte y asesoría VIP 24/7 sin tiempo de espera",
		"Garantía extendida y devoluciones preferenciales sin costo",
		"Insignia exclusiva 🥇 Tier 3 · Oro en perfil y barra de navegación",
	},
}

// GetSubscriptionPlans retorna los 3 Tiers de suscripción basados en Tokens
func GetSubscriptionPlans(c *gin.Context) {
	rows, err := config.DB.Query(`
		SELECT id, COALESCE(tier_level, 1), name, COALESCE(token_cost, 100), price, billing_period, 
		       discount_percent, COALESCE(shipping_discount_percent, 0), free_shipping, priority_support, 
		       COALESCE(description, ''), COALESCE(badge_color, '#6b7280'), COALESCE(icon, '📦')
		FROM subscription_plans
		ORDER BY tier_level ASC, token_cost ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar los Tiers de suscripción"})
		return
	}
	defer rows.Close()

	var plans []SubscriptionPlan
	for rows.Next() {
		var p SubscriptionPlan
		if err := rows.Scan(
			&p.ID, &p.TierLevel, &p.Name, &p.TokenCost, &p.Price, &p.BillingPeriod,
			&p.DiscountPercent, &p.ShippingDiscountPercent, &p.FreeShipping, &p.PrioritySupport,
			&p.Description, &p.BadgeColor, &p.Icon,
		); err == nil {
			if feats, ok := PlanFeatures[p.ID]; ok {
				p.Features = feats
			} else {
				p.Features = []string{}
			}
			plans = append(plans, p)
		}
	}

	c.JSON(http.StatusOK, plans)
}

// GetUserSubscription obtiene el Tier actual y el saldo de Tokens del usuario
func GetUserSubscription(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
		return
	}

	var userPlan, status string
	var userTier, tokenBalance int
	var expiresAt sql.NullTime
	err := config.DB.QueryRow(`
		SELECT COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0), 
		       COALESCE(token_balance, 150), COALESCE(subscription_status, 'active'), subscription_expires_at 
		FROM users WHERE id = $1
	`, userID).Scan(&userPlan, &userTier, &tokenBalance, &status, &expiresAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}

	var plan *SubscriptionPlan
	if userPlan != "none" && userPlan != "" {
		var p SubscriptionPlan
		err = config.DB.QueryRow(`
			SELECT id, COALESCE(tier_level, 1), name, COALESCE(token_cost, 100), price, billing_period, 
			       discount_percent, COALESCE(shipping_discount_percent, 0), free_shipping, priority_support, 
			       COALESCE(description, ''), COALESCE(badge_color, '#6b7280'), COALESCE(icon, '📦')
			FROM subscription_plans WHERE id = $1
		`, userPlan).Scan(
			&p.ID, &p.TierLevel, &p.Name, &p.TokenCost, &p.Price, &p.BillingPeriod,
			&p.DiscountPercent, &p.ShippingDiscountPercent, &p.FreeShipping, &p.PrioritySupport,
			&p.Description, &p.BadgeColor, &p.Icon,
		)
		if err == nil {
			p.Features = PlanFeatures[p.ID]
			plan = &p
		}
	}

	var expString *string
	if expiresAt.Valid {
		formatted := expiresAt.Time.Format(time.RFC3339)
		expString = &formatted
	}

	c.JSON(http.StatusOK, gin.H{
		"plan_id":       userPlan,
		"tier_level":    userTier,
		"token_balance": tokenBalance,
		"status":        status,
		"expires_at":    expString,
		"plan":          plan,
	})
}

// Subscribe activa o cambia el Tier de suscripción del usuario descontando Tokens de su billetera
func Subscribe(c *gin.Context) {
	userID, _ := c.Get("userID")
	userEmail, _ := c.Get("userEmail")
	userRole, _ := c.Get("userRole")

	var input SubscribeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos", "details": err.Error()})
		return
	}

	// 1. Consultar detalles del Tier solicitado
	var planName string
	var tierLevel, tokenCost int
	var planPrice float64
	err := config.DB.QueryRow(`
		SELECT name, COALESCE(tier_level, 1), COALESCE(token_cost, 100), price 
		FROM subscription_plans WHERE id = $1
	`, input.PlanID).Scan(&planName, &tierLevel, &tokenCost, &planPrice)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El Tier seleccionado no existe (opciones válidas: tier_1, tier_2, tier_3)"})
		return
	}

	// 2. Iniciar transacción para verificar y descontar tokens de forma atómica
	tx, err := config.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al iniciar transacción"})
		return
	}
	defer tx.Rollback()

	var currentTokens int
	var fullName string
	err = tx.QueryRow(`
		SELECT COALESCE(token_balance, 0), full_name 
		FROM users WHERE id = $1 FOR UPDATE
	`, userID).Scan(&currentTokens, &fullName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}

	if currentTokens < tokenCost {
		missing := tokenCost - currentTokens
		c.JSON(http.StatusBadRequest, gin.H{
			"error":           fmt.Sprintf("Tokens insuficientes para activar %s. Necesitas %d Tokens y tienes %d Tokens (te faltan %d Tokens). ¡Recarga tokens en la tienda!", planName, tokenCost, currentTokens, missing),
			"required_tokens": tokenCost,
			"current_balance": currentTokens,
			"missing_tokens":  missing,
		})
		return
	}

	newBalance := currentTokens - tokenCost
	exp := time.Now().AddDate(0, 1, 0)

	// 3. Actualizar Tier y saldo de tokens del usuario
	_, err = tx.Exec(`
		UPDATE users 
		SET subscription_plan = $1, subscription_tier = $2, token_balance = $3, 
		    subscription_status = 'active', subscription_expires_at = $4, updated_at = CURRENT_TIMESTAMP
		WHERE id = $5
	`, input.PlanID, tierLevel, newBalance, exp, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al actualizar el Tier del usuario"})
		return
	}

	// 4. Registrar en historial de suscripciones
	_, _ = tx.Exec(`
		INSERT INTO user_subscriptions (user_id, plan_id, status, amount_paid, tokens_spent, started_at, expires_at)
		VALUES ($1, $2, 'active', 0.00, $3, CURRENT_TIMESTAMP, $4)
	`, userID, input.PlanID, tokenCost, exp)

	// 5. Registrar movimiento en historial de tokens
	desc := fmt.Sprintf("Suscripción activada: %s (-%d Tokens)", planName, tokenCost)
	_, _ = tx.Exec(`
		INSERT INTO token_transactions (user_id, type, amount, balance_after, description, price_paid_mxn)
		VALUES ($1, 'subscription_tier', $2, $3, $4, 0.00)
	`, userID, -tokenCost, newBalance, desc)

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error confirmando suscripción por tokens"})
		return
	}

	emailStr, _ := userEmail.(string)
	roleStr, _ := userRole.(string)
	newToken, _ := GenerateToken(userID.(string), emailStr, roleStr, input.PlanID)

	c.JSON(http.StatusOK, gin.H{
		"message":           fmt.Sprintf("¡%s activado con éxito! Se descontaron %d Tokens de tu billetera.", planName, tokenCost),
		"subscription_plan": input.PlanID,
		"subscription_tier": tierLevel,
		"plan_name":         planName,
		"tokens_spent":      tokenCost,
		"token_balance":     newBalance,
		"token":             newToken,
		"user": gin.H{
			"id":                  userID,
			"email":               emailStr,
			"full_name":           fullName,
			"role":                roleStr,
			"subscription_plan":   input.PlanID,
			"subscription_tier":   tierLevel,
			"token_balance":       newBalance,
			"subscription_status": "active",
		},
	})
}

// CancelSubscription cancela el Tier activo y regresa al usuario a estado base sin Tier ('none', tier 0)
func CancelSubscription(c *gin.Context) {
	userID, _ := c.Get("userID")
	userEmail, _ := c.Get("userEmail")
	userRole, _ := c.Get("userRole")

	var tokenBalance int
	var fullName string
	err := config.DB.QueryRow(`
		UPDATE users 
		SET subscription_plan = 'none', subscription_tier = 0, subscription_status = 'cancelled', 
		    subscription_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
		RETURNING COALESCE(token_balance, 0), full_name
	`, userID).Scan(&tokenBalance, &fullName)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al cancelar suscripción"})
		return
	}

	emailStr, _ := userEmail.(string)
	roleStr, _ := userRole.(string)
	newToken, _ := GenerateToken(userID.(string), emailStr, roleStr, "none")

	c.JSON(http.StatusOK, gin.H{
		"message":           "Suscripción por Tier cancelada. Tus tokens disponibles se mantienen intactos en tu billetera.",
		"subscription_plan": "none",
		"subscription_tier": 0,
		"token_balance":     tokenBalance,
		"token":             newToken,
		"user": gin.H{
			"id":                  userID,
			"email":               emailStr,
			"full_name":           fullName,
			"role":                roleStr,
			"subscription_plan":   "none",
			"subscription_tier":   0,
			"token_balance":       tokenBalance,
			"subscription_status": "cancelled",
		},
	})
}

// GetTokenPackages devuelve los paquetes disponibles para comprar Tokens
func GetTokenPackages(c *gin.Context) {
	rows, err := config.DB.Query(`
		SELECT id, name, tokens, bonus_tokens, price_mxn, COALESCE(badge, ''), COALESCE(icon, '🪙'), COALESCE(description, '')
		FROM token_packages
		ORDER BY tokens ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar paquetes de tokens"})
		return
	}
	defer rows.Close()

	var packages []TokenPackage
	for rows.Next() {
		var pkg TokenPackage
		if err := rows.Scan(&pkg.ID, &pkg.Name, &pkg.Tokens, &pkg.BonusTokens, &pkg.PriceMXN, &pkg.Badge, &pkg.Icon, &pkg.Description); err == nil {
			pkg.TotalTokens = pkg.Tokens + pkg.BonusTokens
			packages = append(packages, pkg)
		}
	}

	c.JSON(http.StatusOK, packages)
}

// GetTokenWallet obtiene el saldo actual de tokens del usuario y su historial de transacciones
func GetTokenWallet(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
		return
	}

	var tokenBalance, tierLevel int
	var subPlan string
	err := config.DB.QueryRow(`
		SELECT COALESCE(token_balance, 0), COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0)
		FROM users WHERE id = $1
	`, userID).Scan(&tokenBalance, &subPlan, &tierLevel)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado"})
		return
	}

	rows, err := config.DB.Query(`
		SELECT id, type, amount, balance_after, COALESCE(description, ''), COALESCE(price_paid_mxn, 0), created_at
		FROM token_transactions
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 30
	`, userID)

	var transactions []TokenTransaction
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t TokenTransaction
			if err := rows.Scan(&t.ID, &t.Type, &t.Amount, &t.BalanceAfter, &t.Description, &t.PricePaidMXN, &t.CreatedAt); err == nil {
				transactions = append(transactions, t)
			}
		}
	}

	if transactions == nil {
		transactions = []TokenTransaction{}
	}

	c.JSON(http.StatusOK, gin.H{
		"token_balance":     tokenBalance,
		"subscription_plan": subPlan,
		"subscription_tier": tierLevel,
		"transactions":      transactions,
	})
}

// PurchaseTokens permite al usuario comprar un paquete de tokens o una cantidad personalizada
func PurchaseTokens(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
		return
	}

	var input PurchaseTokensInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos de compra inválidos"})
		return
	}

	var baseTokens, bonusTokens int
	var priceMXN float64
	var packName string

	if input.PackageID != "" {
		err := config.DB.QueryRow(`
			SELECT name, tokens, bonus_tokens, price_mxn
			FROM token_packages WHERE id = $1
		`, input.PackageID).Scan(&packName, &baseTokens, &bonusTokens, &priceMXN)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El paquete de tokens seleccionado no existe"})
			return
		}
	} else if input.CustomTokens >= 10 {
		baseTokens = input.CustomTokens
		bonusTokens = 0
		if input.CustomTokens >= 500 {
			bonusTokens = int(float64(input.CustomTokens) * 0.15) // 15% bonus en compras grandes
		} else if input.CustomTokens >= 200 {
			bonusTokens = int(float64(input.CustomTokens) * 0.10) // 10% bonus
		}
		priceMXN = float64(input.CustomTokens) * 1.00 // $1.00 MXN por token
		packName = fmt.Sprintf("Recarga Personalizada (%d Tokens)", input.CustomTokens)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona un paquete de tokens o ingresa una cantidad personalizada (mínimo 10 Tokens)"})
		return
	}

	totalToAdd := baseTokens + bonusTokens
	paymentLabel := input.PaymentMethod
	if paymentLabel == "" {
		paymentLabel = "Tarjeta de Crédito/Débito"
	}

	var newBalance, subTier int
	var fullName, email, role, subPlan, subStatus string
	err := config.DB.QueryRow(`
		UPDATE users
		SET token_balance = COALESCE(token_balance, 0) + $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
		RETURNING token_balance, full_name, email, role, COALESCE(subscription_plan, 'none'), COALESCE(subscription_tier, 0), COALESCE(subscription_status, 'active')
	`, totalToAdd, userID).Scan(&newBalance, &fullName, &email, &role, &subPlan, &subTier, &subStatus)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al acreditar los tokens en tu cuenta"})
		return
	}

	desc := fmt.Sprintf("Compra de %s (+%d Tokens", packName, baseTokens)
	if bonusTokens > 0 {
		desc += fmt.Sprintf(" +%d Bonus", bonusTokens)
	}
	desc += fmt.Sprintf(") vía %s — $%.2f MXN", paymentLabel, priceMXN)

	_, _ = config.DB.Exec(`
		INSERT INTO token_transactions (user_id, type, amount, balance_after, description, price_paid_mxn)
		VALUES ($1, 'purchase', $2, $3, $4, $5)
	`, userID, totalToAdd, newBalance, desc, priceMXN)

	c.JSON(http.StatusOK, gin.H{
		"message":        fmt.Sprintf("¡Compra exitosa! Se acreditaron +%d Tokens a tu billetera.", totalToAdd),
		"package_name":   packName,
		"tokens_added":   totalToAdd,
		"base_tokens":    baseTokens,
		"bonus_tokens":   bonusTokens,
		"price_paid_mxn": priceMXN,
		"token_balance":  newBalance,
		"user": gin.H{
			"id":                  userID,
			"email":               email,
			"full_name":           fullName,
			"role":                role,
			"subscription_plan":   subPlan,
			"subscription_tier":   subTier,
			"token_balance":       newBalance,
			"subscription_status": subStatus,
		},
	})
}

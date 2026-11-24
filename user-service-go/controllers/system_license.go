package controllers

import (
	"fmt"
	"net/http"
	"time"

	"user-service-go/config"
	"github.com/gin-gonic/gin"
)

type SystemTier struct {
	ID                   string   `json:"id"`
	TierLevel            int      `json:"tier_level"`
	Name                 string   `json:"name"`
	Tagline              string   `json:"tagline"`
	TokenCost            int      `json:"token_cost"`
	PriceMXN             float64  `json:"price_mxn"`
	MaxUsers             int      `json:"max_users"`
	MaxAdmins            int      `json:"max_admins"`
	MaxProducts          int      `json:"max_products"`
	IncludesShipping     bool     `json:"includes_shipping"`
	IncludesInteractions bool     `json:"includes_interactions"`
	IncludesCFDI         bool     `json:"includes_cfdi"`
	IncludesSOABridge    bool     `json:"includes_soa_bridge"`
	SupportLevel         string   `json:"support_level"`
	BadgeColor           string   `json:"badge_color"`
	Icon                 string   `json:"icon"`
	Description          string   `json:"description"`
	Microservices        []string `json:"microservices"`
	Features             []string `json:"features"`
}

type SystemTokenLog struct {
	ID           string    `json:"id"`
	Category     string    `json:"category"`
	Amount       int       `json:"amount"`
	BalanceAfter int       `json:"balance_after"`
	Description  string    `json:"description"`
	PricePaidMXN float64   `json:"price_paid_mxn"`
	CreatedAt    time.Time `json:"created_at"`
}

var SystemTierFeatures = map[string][]string{
	"tier_1": {
		"Paquete de Usuarios: Hasta 100 usuarios/clientes registrados",
		"Paquete de Administradores: 1 cuenta de Administrador incluida",
		"Capacidad de Catálogo: Hasta 50 Productos / SKUs",
		"5 Microservicios Core activos (Auth, Catálogo, Inventario, Carrito, Órdenes)",
		"Firma criptográfica HMAC-SHA256 en recibos de compra",
		"Soporte técnico estándar por correo (48h)",
	},
	"tier_2": {
		"Paquete de Usuarios: Hasta 1,000 usuarios/clientes registrados",
		"Paquete de Administradores: Hasta 5 cuentas de Administrador simultáneas",
		"Capacidad de Catálogo: Hasta 500 Productos / SKUs",
		"7 Microservicios activos (+ Logística DHL/FedEx :8085 e Interacciones/Emails :8086)",
		"Sistema de Reseñas Verificadas, Wishlists compartibles y Notificaciones",
		"Soporte técnico prioritario (Chat & Email 12h)",
	},
	"tier_3": {
		"Paquete de Usuarios: Usuarios y clientes ILIMITADOS",
		"Paquete de Administradores: Administradores y operadores ILIMITADOS",
		"Capacidad de Catálogo: Productos y SKUs ILIMITADOS",
		"Todos los Microservicios + Facturación CFDI 4.0 Profact (:8087)",
		"API Gateway Unificado + Puente Adaptador SOA GraphQL con Partners (:8080)",
		"SLA Empresarial 99.9% e Ingeniero de Soporte Dedicado 24/7",
	},
}

var SystemTierMicroservices = map[string][]string{
	"tier_1": {
		"User & Auth Service (:3002)",
		"Catalog Service MongoDB (:8081)",
		"Inventory ACID Service (:8082)",
		"Cart Redis Service (:8083)",
		"Order & Crypto Receipt Service (:8084)",
	},
	"tier_2": {
		"User & Auth Service (:3002)",
		"Catalog Service MongoDB (:8081)",
		"Inventory ACID Service (:8082)",
		"Cart Redis Service (:8083)",
		"Order & Crypto Receipt Service (:8084)",
		"Shipping & Tracking Service (:8085)",
		"Interactions, Reviews & Email Service (:8086)",
	},
	"tier_3": {
		"User & Auth Service (:3002)",
		"Catalog Service MongoDB (:8081)",
		"Inventory ACID Service (:8082)",
		"Cart Redis Service (:8083)",
		"Order & Crypto Receipt Service (:8084)",
		"Shipping & Tracking Service (:8085)",
		"Interactions, Reviews & Email Service (:8086)",
		"Billing CFDI 4.0 Profact Service (:8087)",
		"API Gateway & SOA GraphQL Bridge (:8080)",
	},
}

// CheckSystemQuota devuelve los límites efectivos del sistema según el Tier activo + Add-ons comprados con Tokens
func CheckSystemQuota() (effectiveMaxUsers int, effectiveMaxAdmins int, currentUsers int, currentAdmins int, activeTierName string) {
	var tierID string
	var extraUsers, extraAdmins, maxU, maxA int

	err := config.DB.QueryRow(`
		SELECT l.active_tier_id, l.extra_users_capacity, l.extra_admins_capacity,
		       t.name, t.max_users, t.max_admins
		FROM system_license l
		JOIN system_tiers t ON l.active_tier_id = t.id
		WHERE l.id = 'default'
	`).Scan(&tierID, &extraUsers, &extraAdmins, &activeTierName, &maxU, &maxA)

	if err != nil {
		return -1, -1, 0, 0, "Tier 1 · Starter"
	}

	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&currentUsers)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&currentAdmins)

	if maxU == -1 {
		effectiveMaxUsers = -1
	} else {
		effectiveMaxUsers = maxU + extraUsers
	}

	if maxA == -1 {
		effectiveMaxAdmins = -1
	} else {
		effectiveMaxAdmins = maxA + extraAdmins
	}

	return
}

// GetSystemLicenseOverview obtiene toda la información comercial de la licencia del sistema, Tiers, paquetes de tokens y uso
func GetSystemLicenseOverview(c *gin.Context) {
	// 1. Obtener todos los Tiers del sistema
	rows, err := config.DB.Query(`
		SELECT id, tier_level, name, COALESCE(tagline, ''), token_cost, price_mxn,
		       max_users, max_admins, max_products,
		       includes_shipping, includes_interactions, includes_cfdi, includes_soa_bridge,
		       COALESCE(support_level, ''), COALESCE(badge_color, '#2563eb'), COALESCE(icon, '📦'), COALESCE(description, '')
		FROM system_tiers
		ORDER BY tier_level ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al consultar los Tiers de licencia del sistema"})
		return
	}
	defer rows.Close()

	var tiers []SystemTier
	tierMap := make(map[string]SystemTier)
	for rows.Next() {
		var t SystemTier
		if err := rows.Scan(
			&t.ID, &t.TierLevel, &t.Name, &t.Tagline, &t.TokenCost, &t.PriceMXN,
			&t.MaxUsers, &t.MaxAdmins, &t.MaxProducts,
			&t.IncludesShipping, &t.IncludesInteractions, &t.IncludesCFDI, &t.IncludesSOABridge,
			&t.SupportLevel, &t.BadgeColor, &t.Icon, &t.Description,
		); err == nil {
			t.Features = SystemTierFeatures[t.ID]
			t.Microservices = SystemTierMicroservices[t.ID]
			tiers = append(tiers, t)
			tierMap[t.ID] = t
		}
	}

	// 2. Obtener estado actual de la licencia del sistema
	var companyName, activeTierID, status string
	var tierLevel, tokenBalance, totalPurchased, totalConsumed, extraUsers, extraAdmins, extraProducts int
	var startedAt, expiresAt time.Time

	err = config.DB.QueryRow(`
		SELECT company_name, active_tier_id, tier_level, system_token_balance,
		       total_tokens_purchased, total_tokens_consumed,
		       extra_users_capacity, extra_admins_capacity, extra_products_capacity,
		       status, started_at, expires_at
		FROM system_license WHERE id = 'default'
	`).Scan(
		&companyName, &activeTierID, &tierLevel, &tokenBalance,
		&totalPurchased, &totalConsumed,
		&extraUsers, &extraAdmins, &extraProducts,
		&status, &startedAt, &expiresAt,
	)

	currentTier := tierMap[activeTierID]

	// 3. Calcular cuotas reales de Usuarios y Administradores en la BD
	var currentUsers, currentAdmins int
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&currentUsers)
	_ = config.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&currentAdmins)

	effectiveMaxUsers := -1
	if currentTier.MaxUsers != -1 {
		effectiveMaxUsers = currentTier.MaxUsers + extraUsers
	}
	effectiveMaxAdmins := -1
	if currentTier.MaxAdmins != -1 {
		effectiveMaxAdmins = currentTier.MaxAdmins + extraAdmins
	}
	effectiveMaxProducts := -1
	if currentTier.MaxProducts != -1 {
		effectiveMaxProducts = currentTier.MaxProducts + extraProducts
	}

	// 4. Obtener paquetes de compra de Tokens del Sistema
	pkgRows, err := config.DB.Query(`
		SELECT id, name, tokens, bonus_tokens, price_mxn, COALESCE(badge, ''), COALESCE(icon, '🪙'), COALESCE(description, '')
		FROM system_token_packages
		ORDER BY tokens ASC
	`)
	var tokenPackages []TokenPackage
	if err == nil {
		defer pkgRows.Close()
		for pkgRows.Next() {
			var p TokenPackage
			if err := pkgRows.Scan(&p.ID, &p.Name, &p.Tokens, &p.BonusTokens, &p.PriceMXN, &p.Badge, &p.Icon, &p.Description); err == nil {
				p.TotalTokens = p.Tokens + p.BonusTokens
				tokenPackages = append(tokenPackages, p)
			}
		}
	}

	// 5. Obtener bitácora de consumo y compra de Tokens del Sistema
	logRows, err := config.DB.Query(`
		SELECT id, category, amount, balance_after, description, COALESCE(price_paid_mxn, 0), created_at
		FROM system_token_logs
		ORDER BY created_at DESC
		LIMIT 30
	`)
	var logs []SystemTokenLog
	if err == nil {
		defer logRows.Close()
		for logRows.Next() {
			var l SystemTokenLog
			if err := logRows.Scan(&l.ID, &l.Category, &l.Amount, &l.BalanceAfter, &l.Description, &l.PricePaidMXN, &l.CreatedAt); err == nil {
				logs = append(logs, l)
			}
		}
	}
	if logs == nil {
		logs = []SystemTokenLog{}
	}

	c.JSON(http.StatusOK, gin.H{
		"license": gin.H{
			"company_name":            companyName,
			"active_tier_id":          activeTierID,
			"tier_level":              tierLevel,
			"system_token_balance":    tokenBalance,
			"total_tokens_purchased":  totalPurchased,
			"total_tokens_consumed":   totalConsumed,
			"extra_users_capacity":    extraUsers,
			"extra_admins_capacity":   extraAdmins,
			"extra_products_capacity": extraProducts,
			"status":                  status,
			"started_at":              startedAt,
			"expires_at":              expiresAt,
			"current_tier":            currentTier,
		},
		"quotas": gin.H{
			"current_users":          currentUsers,
			"base_max_users":         currentTier.MaxUsers,
			"extra_users_capacity":   extraUsers,
			"effective_max_users":    effectiveMaxUsers,
			"current_admins":         currentAdmins,
			"base_max_admins":        currentTier.MaxAdmins,
			"extra_admins_capacity":  extraAdmins,
			"effective_max_admins":   effectiveMaxAdmins,
			"base_max_products":      currentTier.MaxProducts,
			"extra_products_capacity": extraProducts,
			"effective_max_products": effectiveMaxProducts,
		},
		"tiers":          tiers,
		"token_packages": tokenPackages,
		"addons": []gin.H{
			{
				"id":          "extra_admin",
				"name":        "+1 Cuenta de Administrador",
				"token_cost":  80,
				"icon":        "🛡️",
				"description": "Amplía permanentemente el límite de Administradores del sistema en +1 plaza sin cambiar de Tier.",
			},
			{
				"id":          "extra_users",
				"name":        "+250 Usuarios Registrados",
				"token_cost":  60,
				"icon":        "👥",
				"description": "Amplía la capacidad de clientes/usuarios registrados en la plataforma en +250 cuentas.",
			},
			{
				"id":          "extra_products",
				"name":        "+100 Productos en Catálogo",
				"token_cost":  40,
				"icon":        "📦",
				"description": "Amplía el límite de SKUs y productos activos permitidos en MongoDB Catalog Service.",
			},
		},
		"operation_rates": []gin.H{
			{"operation": "order_checkout", "name": "Procesamiento de Orden + Recibo HMAC (:8084)", "token_cost": 2, "icon": "🛒"},
			{"operation": "cfdi_invoice", "name": "Timbrado Factura Electrónica CFDI 4.0 Profact (:8087)", "token_cost": 5, "icon": "🧾"},
			{"operation": "shipping_label", "name": "Generación de Guía Logística DHL/FedEx (:8085)", "token_cost": 2, "icon": "🚚"},
			{"operation": "soa_sync", "name": "Transacción Puente Adaptador SOA GraphQL (:8080)", "token_cost": 1, "icon": "🔗"},
		},
		"logs": logs,
	})
}

// ActivateSystemTier cambia o renueva el Tier de la licencia del sistema descontando Tokens del pool del sistema
func ActivateSystemTier(c *gin.Context) {
	var input struct {
		TierID      string `json:"tier_id" binding:"required"`
		CompanyName string `json:"company_name"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Debes especificar el tier_id (tier_1, tier_2 o tier_3)"})
		return
	}

	var tierName string
	var tierLevel, tokenCost int
	err := config.DB.QueryRow(`
		SELECT name, tier_level, token_cost FROM system_tiers WHERE id = $1
	`, input.TierID).Scan(&tierName, &tierLevel, &tokenCost)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El Tier de sistema seleccionado no es válido"})
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error iniciando transacción"})
		return
	}
	defer tx.Rollback()

	var currentBalance int
	var currentCompany string
	err = tx.QueryRow(`
		SELECT system_token_balance, company_name FROM system_license WHERE id = 'default' FOR UPDATE
	`).Scan(&currentBalance, &currentCompany)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se encontró el registro de licencia del sistema"})
		return
	}

	if currentBalance < tokenCost {
		missing := tokenCost - currentBalance
		c.JSON(http.StatusBadRequest, gin.H{
			"error":           fmt.Sprintf("Tokens del sistema insuficientes para activar %s. Requiere %d Tokens y el sistema cuenta con %d Tokens (faltan %d Tokens). Adquiere un paquete de tokens primero.", tierName, tokenCost, currentBalance, missing),
			"required_tokens": tokenCost,
			"current_balance": currentBalance,
			"missing_tokens":  missing,
		})
		return
	}

	newBalance := currentBalance - tokenCost
	if input.CompanyName != "" {
		currentCompany = input.CompanyName
	}

	_, err = tx.Exec(`
		UPDATE system_license
		SET company_name = $1, active_tier_id = $2, tier_level = $3,
		    system_token_balance = $4, total_tokens_consumed = total_tokens_consumed + $5,
		    status = 'active', started_at = CURRENT_TIMESTAMP,
		    expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days', updated_at = CURRENT_TIMESTAMP
		WHERE id = 'default'
	`, currentCompany, input.TierID, tierLevel, newBalance, tokenCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error actualizando licencia del sistema"})
		return
	}

	desc := fmt.Sprintf("Activación de Licencia del Sistema: %s (-%d Tokens) para %s", tierName, tokenCost, currentCompany)
	_, _ = tx.Exec(`
		INSERT INTO system_token_logs (category, amount, balance_after, description, price_paid_mxn)
		VALUES ('tier_license', $1, $2, $3, 0.00)
	`, -tokenCost, newBalance, desc)

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al confirmar activación del Tier"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":              fmt.Sprintf("¡Licencia del sistema actualizada a %s! Se descontaron %d Tokens del pool operativo.", tierName, tokenCost),
		"active_tier_id":       input.TierID,
		"tier_level":           tierLevel,
		"tier_name":            tierName,
		"tokens_spent":         tokenCost,
		"system_token_balance": newBalance,
	})
}

// PurchaseSystemTokens permite comprar paquetes de Tokens o recargas personalizadas para el sistema
func PurchaseSystemTokens(c *gin.Context) {
	var input struct {
		PackageID     string `json:"package_id"`
		CustomTokens  int    `json:"custom_tokens"`
		PaymentMethod string `json:"payment_method"`
	}
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
			FROM system_token_packages WHERE id = $1
		`, input.PackageID).Scan(&packName, &baseTokens, &bonusTokens, &priceMXN)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El paquete de tokens del sistema no existe"})
			return
		}
	} else if input.CustomTokens >= 50 {
		baseTokens = input.CustomTokens
		if input.CustomTokens >= 1000 {
			bonusTokens = int(float64(input.CustomTokens) * 0.25)
		} else if input.CustomTokens >= 400 {
			bonusTokens = int(float64(input.CustomTokens) * 0.15)
		}
		priceMXN = float64(input.CustomTokens) * 4.50
		packName = fmt.Sprintf("Recarga Corporativa Personalizada (%d Tokens)", input.CustomTokens)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona un paquete o ingresa al menos 50 Tokens personalizados"})
		return
	}

	totalToAdd := baseTokens + bonusTokens
	payMethod := input.PaymentMethod
	if payMethod == "" {
		payMethod = "Tarjeta Corporativa Visa •••• 4242"
	}

	var newBalance int
	err := config.DB.QueryRow(`
		UPDATE system_license
		SET system_token_balance = system_token_balance + $1,
		    total_tokens_purchased = total_tokens_purchased + $1,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = 'default'
		RETURNING system_token_balance
	`, totalToAdd).Scan(&newBalance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al acreditar tokens al sistema"})
		return
	}

	desc := fmt.Sprintf("Compra de %s (+%d Tokens", packName, baseTokens)
	if bonusTokens > 0 {
		desc += fmt.Sprintf(" +%d Bonus", bonusTokens)
	}
	desc += fmt.Sprintf(") vía %s — $%.2f MXN", payMethod, priceMXN)

	_, _ = config.DB.Exec(`
		INSERT INTO system_token_logs (category, amount, balance_after, description, price_paid_mxn)
		VALUES ('token_purchase', $1, $2, $3, $4)
	`, totalToAdd, newBalance, desc, priceMXN)

	c.JSON(http.StatusOK, gin.H{
		"message":              fmt.Sprintf("¡Compra acreditada! Se sumaron +%d Tokens al Pool del Sistema.", totalToAdd),
		"tokens_added":         totalToAdd,
		"base_tokens":          baseTokens,
		"bonus_tokens":         bonusTokens,
		"price_paid_mxn":       priceMXN,
		"system_token_balance": newBalance,
	})
}

// PurchaseSystemAddon permite canjear Tokens del sistema para ampliar el límite de Administradores, Usuarios o Productos
func PurchaseSystemAddon(c *gin.Context) {
	var input struct {
		AddonID string `json:"addon_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Especifica el addon_id (extra_admin, extra_users o extra_products)"})
		return
	}

	var tokenCost int
	var updateQuery, addonLabel string

	switch input.AddonID {
	case "extra_admin":
		tokenCost = 80
		addonLabel = "Ampliación de Licencia: +1 Cuenta de Administrador adicional"
		updateQuery = "UPDATE system_license SET system_token_balance = system_token_balance - $1, total_tokens_consumed = total_tokens_consumed + $1, extra_admins_capacity = extra_admins_capacity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 'default' RETURNING system_token_balance"
	case "extra_users":
		tokenCost = 60
		addonLabel = "Ampliación de Licencia: +250 Usuarios registrados adicionales"
		updateQuery = "UPDATE system_license SET system_token_balance = system_token_balance - $1, total_tokens_consumed = total_tokens_consumed + $1, extra_users_capacity = extra_users_capacity + 250, updated_at = CURRENT_TIMESTAMP WHERE id = 'default' RETURNING system_token_balance"
	case "extra_products":
		tokenCost = 40
		addonLabel = "Ampliación de Licencia: +100 Productos en catálogo adicionales"
		updateQuery = "UPDATE system_license SET system_token_balance = system_token_balance - $1, total_tokens_consumed = total_tokens_consumed + $1, extra_products_capacity = extra_products_capacity + 100, updated_at = CURRENT_TIMESTAMP WHERE id = 'default' RETURNING system_token_balance"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Add-on no válido"})
		return
	}

	var currentBalance int
	_ = config.DB.QueryRow("SELECT system_token_balance FROM system_license WHERE id = 'default'").Scan(&currentBalance)
	if currentBalance < tokenCost {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Tokens insuficientes. Este paquete adicional cuesta %d Tokens y el sistema tiene %d Tokens.", tokenCost, currentBalance),
		})
		return
	}

	var newBalance int
	err := config.DB.QueryRow(updateQuery, tokenCost).Scan(&newBalance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error al aplicar la ampliación de capacidad"})
		return
	}

	_, _ = config.DB.Exec(`
		INSERT INTO system_token_logs (category, amount, balance_after, description, price_paid_mxn)
		VALUES ('capacity_addon', $1, $2, $3, 0.00)
	`, -tokenCost, newBalance, fmt.Sprintf("%s (-%d Tokens)", addonLabel, tokenCost))

	c.JSON(http.StatusOK, gin.H{
		"message":              fmt.Sprintf("¡Capacidad ampliada con éxito! %s (-%d Tokens).", addonLabel, tokenCost),
		"system_token_balance": newBalance,
	})
}

// ConsumeSystemTokens registra el consumo operativo de Tokens del sistema por uso de microservicios
func ConsumeSystemTokens(c *gin.Context) {
	var input struct {
		Operation string `json:"operation" binding:"required"`
		Details   string `json:"details"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Especifica la operación del sistema"})
		return
	}

	var cost int
	var opName string
	switch input.Operation {
	case "order_checkout":
		cost = 2
		opName = "Procesamiento de Orden & Firma HMAC (:8084)"
	case "cfdi_invoice":
		cost = 5
		opName = "Timbrado Fiscal CFDI 4.0 Profact (:8087)"
	case "shipping_label":
		cost = 2
		opName = "Generación de Guía Logística (:8085)"
	case "soa_sync":
		cost = 1
		opName = "Sincronización Puente SOA GraphQL (:8080)"
	default:
		cost = 1
		opName = "Operación de Microservicio"
	}

	var currentBalance int
	_ = config.DB.QueryRow("SELECT system_token_balance FROM system_license WHERE id = 'default'").Scan(&currentBalance)
	if currentBalance < cost {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Pool de Tokens del sistema agotado (requiere %d Tokens, saldo: %d). Recarga tokens para continuar operando.", cost, currentBalance),
		})
		return
	}

	var newBalance int
	err := config.DB.QueryRow(`
		UPDATE system_license
		SET system_token_balance = system_token_balance - $1,
		    total_tokens_consumed = total_tokens_consumed + $1,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = 'default'
		RETURNING system_token_balance
	`, cost).Scan(&newBalance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error descontando tokens operativos"})
		return
	}

	desc := fmt.Sprintf("Consumo Microservicio: %s (-%d Tokens)", opName, cost)
	if input.Details != "" {
		desc += " · " + input.Details
	}

	_, _ = config.DB.Exec(`
		INSERT INTO system_token_logs (category, amount, balance_after, description, price_paid_mxn)
		VALUES ('microservice_op', $1, $2, $3, 0.00)
	`, -cost, newBalance, desc)

	c.JSON(http.StatusOK, gin.H{
		"message":              fmt.Sprintf("Operación ejecutada: %s (-%d Tokens). Saldo del sistema: %d Tokens.", opName, cost, newBalance),
		"tokens_consumed":      cost,
		"system_token_balance": newBalance,
	})
}

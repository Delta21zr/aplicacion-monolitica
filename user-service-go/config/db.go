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

	-- Soporte para Suscripciones por Tier y Billetera de Tokens
	ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'none';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier INT DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance INT DEFAULT 150;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;

	CREATE TABLE IF NOT EXISTS subscription_plans (
		id VARCHAR(50) PRIMARY KEY,
		tier_level INT NOT NULL DEFAULT 1,
		name VARCHAR(100) NOT NULL,
		token_cost INT NOT NULL DEFAULT 100,
		price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		billing_period VARCHAR(50) NOT NULL DEFAULT 'monthly',
		discount_percent INT NOT NULL DEFAULT 0,
		shipping_discount_percent INT NOT NULL DEFAULT 0,
		free_shipping BOOLEAN NOT NULL DEFAULT false,
		priority_support BOOLEAN NOT NULL DEFAULT false,
		description TEXT,
		badge_color VARCHAR(50) DEFAULT '#6b7280',
		icon VARCHAR(10) DEFAULT '📦',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS tier_level INT NOT NULL DEFAULT 1;
	ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS token_cost INT NOT NULL DEFAULT 100;
	ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS shipping_discount_percent INT NOT NULL DEFAULT 0;

	-- Insertar los 3 Tiers de Suscripción basados en Tokens
	INSERT INTO subscription_plans (id, tier_level, name, token_cost, price, billing_period, discount_percent, shipping_discount_percent, free_shipping, priority_support, description, badge_color, icon)
	VALUES 
		('tier_1', 1, 'Tier 1 · Bronce (Starter)', 100, 99.00, 'monthly', 5, 50, false, false, 'Nivel inicial por tokens: 5% de descuento automático en tienda y 50% de descuento en envíos estándar.', '#d97706', '🥉'),
		('tier_2', 2, 'Tier 2 · Plata (Pro)', 250, 229.00, 'monthly', 12, 100, true, true, 'Nivel Pro por tokens: 12% de descuento automático en todo el carrito, envíos estándar GRATIS y soporte prioritario.', '#2563eb', '🥈'),
		('tier_3', 3, 'Tier 3 · Oro (Elite VIP)', 500, 429.00, 'monthly', 20, 100, true, true, 'Nivel máximo por tokens: 20% de descuento total, envíos express GRATIS garantizados, facturación CFDI 4.0 automática y soporte VIP 24/7.', '#8b5cf6', '🥇')
	ON CONFLICT (id) DO UPDATE SET 
		tier_level = EXCLUDED.tier_level,
		name = EXCLUDED.name,
		token_cost = EXCLUDED.token_cost,
		price = EXCLUDED.price,
		discount_percent = EXCLUDED.discount_percent,
		shipping_discount_percent = EXCLUDED.shipping_discount_percent,
		free_shipping = EXCLUDED.free_shipping,
		priority_support = EXCLUDED.priority_support,
		description = EXCLUDED.description,
		badge_color = EXCLUDED.badge_color,
		icon = EXCLUDED.icon;

	CREATE TABLE IF NOT EXISTS user_subscriptions (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
		status VARCHAR(50) NOT NULL DEFAULT 'active',
		payment_method_id UUID,
		amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		tokens_spent INT NOT NULL DEFAULT 0,
		started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS tokens_spent INT NOT NULL DEFAULT 0;

	-- Migrar referencias anteriores ('basic', 'premium', 'vip') a los nuevos Tiers
	UPDATE user_subscriptions SET plan_id = 'tier_1' WHERE plan_id = 'basic';
	UPDATE user_subscriptions SET plan_id = 'tier_2' WHERE plan_id = 'premium';
	UPDATE user_subscriptions SET plan_id = 'tier_3' WHERE plan_id = 'vip';

	UPDATE users SET subscription_plan = 'none', subscription_tier = 0 WHERE subscription_plan = 'basic' OR subscription_plan IS NULL;
	UPDATE users SET subscription_plan = 'tier_1', subscription_tier = 1 WHERE subscription_plan = 'tier_1';
	UPDATE users SET subscription_plan = 'tier_2', subscription_tier = 2 WHERE subscription_plan IN ('premium', 'tier_2');
	UPDATE users SET subscription_plan = 'tier_3', subscription_tier = 3 WHERE subscription_plan IN ('vip', 'tier_3');
	UPDATE users SET token_balance = 150 WHERE token_balance IS NULL;

	DELETE FROM subscription_plans WHERE id IN ('basic', 'premium', 'vip');

	-- Paquetes disponibles para comprar Tokens
	CREATE TABLE IF NOT EXISTS token_packages (
		id VARCHAR(50) PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		tokens INT NOT NULL,
		bonus_tokens INT NOT NULL DEFAULT 0,
		price_mxn NUMERIC(10, 2) NOT NULL,
		badge VARCHAR(50),
		icon VARCHAR(10) DEFAULT '🪙',
		description TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	INSERT INTO token_packages (id, name, tokens, bonus_tokens, price_mxn, badge, icon, description)
	VALUES
		('pack_100', 'Bolsa Starter', 100, 0, 99.00, 'IDEAL TIER 1', '🪙', '100 Tokens listos para activar tu suscripción Tier 1 · Bronce.'),
		('pack_300', 'Cofre Pro', 250, 50, 229.00, 'MÁS POPULAR (+50 BONUS)', '💰', '250 Tokens + 50 Tokens de regalo (300 en total). Ideal para activar Tier 2 · Plata.'),
		('pack_600', 'Bóveda Elite', 500, 100, 429.00, 'MEJOR VALOR (+100 BONUS)', '💎', '500 Tokens + 100 Tokens de regalo (600 en total). Ideal para activar Tier 3 · Oro.'),
		('pack_1500', 'Tesoro Real VIP', 1200, 300, 999.00, 'MÁXIMO AHORRO (+300 BONUS)', '👑', '1,200 Tokens + 300 Tokens gratis (1,500 en total) para múltiples meses de suscripción.')
	ON CONFLICT (id) DO UPDATE SET
		name = EXCLUDED.name,
		tokens = EXCLUDED.tokens,
		bonus_tokens = EXCLUDED.bonus_tokens,
		price_mxn = EXCLUDED.price_mxn,
		badge = EXCLUDED.badge,
		icon = EXCLUDED.icon,
		description = EXCLUDED.description;

	-- Historial de transacciones de Tokens (compras, suscripciones por tier, bonos)
	CREATE TABLE IF NOT EXISTS token_transactions (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		type VARCHAR(50) NOT NULL,
		amount INT NOT NULL,
		balance_after INT NOT NULL,
		description TEXT,
		price_paid_mxn NUMERIC(10, 2) DEFAULT 0.00,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	-- ============================================================================
	-- LICENCIAMIENTO COMERCIAL DEL SISTEMA (SaaS B2B POR TIERS Y TOKENS)
	-- Para vender/licenciar la plataforma Monolito (cuotas de usuarios, admins,
	-- microservicios habilitados y consumo operativo mediante Tokens).
	-- ============================================================================

	CREATE TABLE IF NOT EXISTS system_tiers (
		id VARCHAR(50) PRIMARY KEY,
		tier_level INT NOT NULL,
		name VARCHAR(100) NOT NULL,
		tagline VARCHAR(255),
		token_cost INT NOT NULL,
		price_mxn NUMERIC(10, 2) NOT NULL,
		max_users INT NOT NULL,
		max_admins INT NOT NULL,
		max_products INT NOT NULL,
		includes_shipping BOOLEAN DEFAULT false,
		includes_interactions BOOLEAN DEFAULT false,
		includes_cfdi BOOLEAN DEFAULT false,
		includes_soa_bridge BOOLEAN DEFAULT false,
		support_level VARCHAR(100),
		badge_color VARCHAR(50),
		icon VARCHAR(10),
		description TEXT
	);

	INSERT INTO system_tiers (
		id, tier_level, name, tagline, token_cost, price_mxn,
		max_users, max_admins, max_products,
		includes_shipping, includes_interactions, includes_cfdi, includes_soa_bridge,
		support_level, badge_color, icon, description
	)
	VALUES
		(
			'tier_1', 1, 'Tier 1 · Starter (PyME)', 'Licencia inicial para lanzar tu tienda online',
			200, 990.00, 100, 1, 50,
			false, false, false, false,
			'Soporte estándar (Email 48h)', '#d97706', '🥉',
			'Ideal para negocios que inician: incluye los microservicios Core (Usuarios, Catálogo, Inventario, Carrito y Órdenes), hasta 100 usuarios registrados y 1 cuenta de Administrador.'
		),
		(
			'tier_2', 2, 'Tier 2 · Business Pro', 'Escala con logística multi-paquetería y fidelización',
			500, 2290.00, 1000, 5, 500,
			true, true, false, false,
			'Soporte prioritario (Chat & Email 12h)', '#2563eb', '🥈',
			'Para comercios en expansión: amplía la plataforma hasta 1,000 usuarios y 5 Administradores. Desbloquea los microservicios de Logística (:8085) e Interacciones/Notificaciones (:8086).'
		),
		(
			'tier_3', 3, 'Tier 3 · Enterprise SOA', 'Arquitectura corporativa completa, CFDI 4.0 y Puente SOA',
			1000, 4490.00, -1, -1, -1,
			true, true, true, true,
			'SLA 99.9% + Ingeniero Dedicado 24/7', '#8b5cf6', '🥇',
			'Licencia corporativa sin límites: Usuarios, Administradores y Productos ilimitados. Incluye Facturación Electrónica CFDI 4.0 con Profact (:8087) y Puente Adaptador SOA GraphQL (:8080).'
		)
	ON CONFLICT (id) DO UPDATE SET
		tier_level = EXCLUDED.tier_level,
		name = EXCLUDED.name,
		tagline = EXCLUDED.tagline,
		token_cost = EXCLUDED.token_cost,
		price_mxn = EXCLUDED.price_mxn,
		max_users = EXCLUDED.max_users,
		max_admins = EXCLUDED.max_admins,
		max_products = EXCLUDED.max_products,
		includes_shipping = EXCLUDED.includes_shipping,
		includes_interactions = EXCLUDED.includes_interactions,
		includes_cfdi = EXCLUDED.includes_cfdi,
		includes_soa_bridge = EXCLUDED.includes_soa_bridge,
		support_level = EXCLUDED.support_level,
		badge_color = EXCLUDED.badge_color,
		icon = EXCLUDED.icon,
		description = EXCLUDED.description;

	CREATE TABLE IF NOT EXISTS system_license (
		id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
		company_name VARCHAR(150) NOT NULL DEFAULT 'Empresa Demostración S.A. de C.V.',
		active_tier_id VARCHAR(50) NOT NULL DEFAULT 'tier_1' REFERENCES system_tiers(id),
		tier_level INT NOT NULL DEFAULT 1,
		system_token_balance INT NOT NULL DEFAULT 350,
		total_tokens_purchased INT NOT NULL DEFAULT 350,
		total_tokens_consumed INT NOT NULL DEFAULT 0,
		extra_users_capacity INT NOT NULL DEFAULT 0,
		extra_admins_capacity INT NOT NULL DEFAULT 0,
		extra_products_capacity INT NOT NULL DEFAULT 0,
		status VARCHAR(50) NOT NULL DEFAULT 'active',
		started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	INSERT INTO system_license (id, company_name, active_tier_id, tier_level, system_token_balance, total_tokens_purchased, total_tokens_consumed)
	VALUES ('default', 'Monolito Commerce Enterprise S.A. de C.V.', 'tier_1', 1, 350, 350, 0)
	ON CONFLICT (id) DO NOTHING;

	CREATE TABLE IF NOT EXISTS system_token_packages (
		id VARCHAR(50) PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		tokens INT NOT NULL,
		bonus_tokens INT NOT NULL DEFAULT 0,
		price_mxn NUMERIC(10, 2) NOT NULL,
		badge VARCHAR(60),
		icon VARCHAR(10) DEFAULT '🪙',
		description TEXT
	);

	INSERT INTO system_token_packages (id, name, tokens, bonus_tokens, price_mxn, badge, icon, description)
	VALUES
		('sys_pack_200', 'Paquete Starter SaaS', 200, 0, 990.00, 'ACTIVACIÓN TIER 1', '🪙', '200 Tokens del Sistema. Cubre 1 mes completo de licencia Tier 1 · Starter.'),
		('sys_pack_600', 'Paquete Business Pro', 500, 100, 2290.00, 'MÁS VENDIDO (+100 BONUS)', '💰', '500 Tokens + 100 Tokens gratis (600 en total). Activa Tier 2 · Business Pro y deja saldo operativo.'),
		('sys_pack_1300', 'Paquete Enterprise SOA', 1000, 300, 4490.00, 'IDEAL TIER 3 (+300 BONUS)', '💎', '1,000 Tokens + 300 Tokens gratis (1,300 en total). Activa Tier 3 · Enterprise SOA + timbrados CFDI.'),
		('sys_pack_3500', 'Bóveda Corporativa Anual', 2500, 1000, 9990.00, 'MÁXIMO AHORRO (+1,000 BONUS)', '👑', '2,500 Tokens + 1,000 Tokens gratis (3,500 en total) para operación multi-mes, cupos extra y alto volumen.')
	ON CONFLICT (id) DO UPDATE SET
		name = EXCLUDED.name,
		tokens = EXCLUDED.tokens,
		bonus_tokens = EXCLUDED.bonus_tokens,
		price_mxn = EXCLUDED.price_mxn,
		badge = EXCLUDED.badge,
		icon = EXCLUDED.icon,
		description = EXCLUDED.description;

	CREATE TABLE IF NOT EXISTS system_token_logs (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		category VARCHAR(50) NOT NULL,
		amount INT NOT NULL,
		balance_after INT NOT NULL,
		description TEXT NOT NULL,
		price_paid_mxn NUMERIC(10, 2) DEFAULT 0.00,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err = DB.Exec(createTables)
	if err != nil {
		log.Fatal("Error creando tablas: ", err)
	}
}

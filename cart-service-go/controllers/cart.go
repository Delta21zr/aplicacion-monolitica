package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"cart-service-go/config"
	"cart-service-go/models"
	"github.com/gin-gonic/gin"
)

// Valid coupons map (Simulated DB)
var validCoupons = map[string]float64{
	"DESCUENTO10": 0.10, // 10%
	"PROMO20":     0.20, // 20%
}

// Struct to parse catalog response
type CatalogProduct struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

// Security Fix: Fetch true product data directly from Catalog Service
func fetchProductData(productID string) (*CatalogProduct, error) {
	resp, err := http.Get("http://localhost:8081/api/catalog/products/" + productID)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("product not found or catalog service down")
	}

	var product CatalogProduct
	if err := json.NewDecoder(resp.Body).Decode(&product); err != nil {
		return nil, err
	}

	return &product, nil
}

func getCartFromRedis(userId string) models.Cart {
	var cart models.Cart
	val, err := config.RDB.Get(config.Ctx, "cart:"+userId).Result()
	if err == nil {
		json.Unmarshal([]byte(val), &cart)
	} else {
		cart.UserID = userId
		cart.Items = []models.CartItem{}
	}
	return cart
}

func saveCartToRedis(cart models.Cart) {
	// Calcular totales dinamicos
	cart.Subtotal = 0
	for _, item := range cart.Items {
		cart.Subtotal += item.Price * float64(item.Quantity)
	}

	cart.Discount = 0
	if discountPerc, ok := validCoupons[cart.Coupon]; ok {
		cart.Discount = cart.Subtotal * discountPerc
	}

	subtotalWithDiscount := cart.Subtotal - cart.Discount
	cart.IVA = subtotalWithDiscount * 0.16 // 16% taxes
	cart.Total = subtotalWithDiscount + cart.IVA

	// Guardar en Redis con TTL de 24 horas (Persistencia temporal)
	data, _ := json.Marshal(cart)
	config.RDB.Set(config.Ctx, "cart:"+cart.UserID, data, 24*time.Hour)
}

func GetCart(c *gin.Context) {
	userId := c.Param("userId")
	cart := getCartFromRedis(userId)
	c.JSON(http.StatusOK, cart)
}

func AddItem(c *gin.Context) {
	userId := c.Param("userId")
	
	var req models.AddItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Security: Fetch true price from catalog instead of trusting the client
	productData, err := fetchProductData(req.ProductID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product or catalog unavailable"})
		return
	}

	cart := getCartFromRedis(userId)

	// Check if item exists, just add quantity
	found := false
	for i, item := range cart.Items {
		if item.ProductID == req.ProductID {
			cart.Items[i].Quantity += req.Quantity
			found = true
			break
		}
	}

	if !found {
		newItem := models.CartItem{
			ProductID: req.ProductID,
			Quantity:  req.Quantity,
			Price:     productData.Price, // Use the verified secure price
			Name:      productData.Name,
		}
		cart.Items = append(cart.Items, newItem)
	}

	saveCartToRedis(cart)
	c.JSON(http.StatusOK, cart)
}

func UpdateItemQuantity(c *gin.Context) {
	userId := c.Param("userId")
	productId := c.Param("productId")

	var req models.UpdateQuantityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Quantity <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quantity must be greater than zero. Use DELETE instead."})
		return
	}

	cart := getCartFromRedis(userId)

	found := false
	for i, item := range cart.Items {
		if item.ProductID == productId {
			cart.Items[i].Quantity = req.Quantity // Set exact quantity
			found = true
			break
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found in cart"})
		return
	}

	saveCartToRedis(cart)
	c.JSON(http.StatusOK, cart)
}

func RemoveItem(c *gin.Context) {
	userId := c.Param("userId")
	productId := c.Param("productId")

	cart := getCartFromRedis(userId)

	var newItems []models.CartItem
	for _, item := range cart.Items {
		if item.ProductID != productId {
			newItems = append(newItems, item)
		}
	}
	cart.Items = newItems

	saveCartToRedis(cart)
	c.JSON(http.StatusOK, cart)
}

func ApplyCoupon(c *gin.Context) {
	userId := c.Param("userId")
	var req struct {
		Coupon string `json:"coupon"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cart := getCartFromRedis(userId)

	if _, ok := validCoupons[req.Coupon]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cupon invalido"})
		return
	}

	cart.Coupon = req.Coupon
	saveCartToRedis(cart)
	c.JSON(http.StatusOK, cart)
}

func RemoveCoupon(c *gin.Context) {
	userId := c.Param("userId")
	cart := getCartFromRedis(userId)

	cart.Coupon = ""
	saveCartToRedis(cart)
	
	c.JSON(http.StatusOK, cart)
}

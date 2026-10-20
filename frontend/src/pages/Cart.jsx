import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Checkout & Shipping state
  const [showCheckout, setShowCheckout] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [originZip, setOriginZip] = useState('06600');
  const [destZip, setDestZip] = useState('64000');
  const [weightKg, setWeightKg] = useState(1.5);
  const [shippingAddress, setShippingAddress] = useState('Av. Reforma 123, CDMX, CP 06600');
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [calculatingShipping, setCalculatingShipping] = useState(false);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [cardNumber, setCardNumber] = useState('4242424242424242');
  const [cardHolder, setCardHolder] = useState('Cliente Monolito');
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null);

  // Extract userId from token or use guest-123 (tied to session in Redis)
  let userId = "guest-123";
  let userEmail = "cliente@monolito.com";
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = String(payload.id);
      if (payload.email) userEmail = payload.email;
    } catch (e) {}
  }

  const fetchCart = async () => {
    try {
      const res = await axios.get(`http://localhost:8083/api/cart/${userId}`);
      setCart(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCart();
    if (token) {
      const headers = { Authorization: `Bearer ${token}` };
      axios.get('http://localhost:3002/api/users/addresses', { headers })
        .then(res => {
          const addrs = res.data || [];
          setSavedAddresses(addrs);
          if (addrs.length > 0) {
            const a = addrs[0];
            setShippingAddress(`${a.street}, ${a.city}, CP ${a.zip_code}, ${a.country}`);
            if (a.zip_code) setDestZip(a.zip_code);
          }
        })
        .catch(() => {});
      axios.get('http://localhost:3002/api/users/payment-methods', { headers })
        .then(res => {
          const cards = res.data || [];
          setSavedCards(cards);
          if (cards.length > 0) {
            setCardNumber(`400000000000${cards[0].last_four}`);
          }
        })
        .catch(() => {});
    }
  }, [userId]);

  // Editar cantidad en el carrito (PUT /api/cart/:userId/items/:productId)
  const handleUpdateQuantity = async (productId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemove(productId);
      return;
    }
    try {
      await axios.put(`http://localhost:8083/api/cart/${userId}/items/${productId}`, {
        quantity: newQuantity,
      });
      fetchCart();
    } catch (err) {
      console.error("Error al actualizar cantidad", err);
    }
  };

  // Eliminar producto del carrito (DELETE /api/cart/:userId/items/:productId)
  const handleRemove = async (productId) => {
    try {
      await axios.delete(`http://localhost:8083/api/cart/${userId}/items/${productId}`);
      fetchCart();
    } catch (err) {
      console.error("Error al eliminar item", err);
    }
  };

  // Aplicar cupón promocional (POST /api/cart/:userId/coupon)
  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`http://localhost:8083/api/cart/${userId}/coupon`, { coupon: couponCode });
      setCouponCode('');
      fetchCart();
    } catch (err) {
      setError(err.response?.data?.error || 'Cupón inválido');
    } finally {
      setLoading(false);
    }
  };

  // Quitar cupón promocional (DELETE /api/cart/:userId/coupon)
  const handleRemoveCoupon = async () => {
    try {
      await axios.delete(`http://localhost:8083/api/cart/${userId}/coupon`);
      fetchCart();
    } catch (err) {
      console.error("Error al quitar cupón", err);
    }
  };

  // Cotizar tarifas de envío en Shipping Service (:8085)
  const handleCalculateShipping = async (e) => {
    if (e) e.preventDefault();
    setCalculatingShipping(true);
    try {
      const res = await axios.post('http://localhost:8085/api/shipping/calculate', {
        origin_zip: originZip || '06600',
        destination_zip: destZip || '64000',
        weight_kg: Number(weightKg) || 1.5,
        length_cm: 30,
        width_cm: 20,
        height_cm: 15,
      });
      const opts = res.data.options || [];
      setShippingOptions(opts);
      if (opts.length > 0) setSelectedCarrier(opts[0]);
    } catch (err) {
      console.error("Error cotizando envío:", err);
    } finally {
      setCalculatingShipping(false);
    }
  };

  // Procesar Checkout en Order Service (:8084) y crear Guía en Shipping Service (:8085)
  const handleProcessCheckout = async (e) => {
    e.preventDefault();
    setProcessingCheckout(true);
    setError('');
    try {
      // 1. Crear orden, descontar inventario, emitir recibo criptográfico
      const checkoutRes = await axios.post('http://localhost:8084/api/orders/checkout', {
        user_id: String(userId),
        payment_method: paymentMethod,
        card_details: paymentMethod !== 'PAYPAL' ? {
          card_number: cardNumber,
          card_holder: cardHolder,
          exp_month: '12',
          exp_year: '28',
          cvv: '123',
        } : undefined,
        shipping_address: shippingAddress,
      });

      const orderData = checkoutRes.data;
      let shipmentData = null;

      // 2. Generar guía de envío en Shipping Service (:8085)
      const carrierToUse = selectedCarrier || {
        carrier: 'DHL Express',
        service_type: 'EXPRESS',
        shipping_cost: 145.0,
      };

      try {
        const shipRes = await axios.post('http://localhost:8085/api/shipping/shipments', {
          order_id: orderData.order_id,
          carrier: carrierToUse.carrier,
          service_type: carrierToUse.service_type,
          origin_zip: originZip || '06600',
          destination_zip: destZip || '64000',
          destination_address: shippingAddress,
          shipping_cost: carrierToUse.shipping_cost,
        });
        shipmentData = shipRes.data;

        // Enviar notificación de guía generada
        await axios.post('http://localhost:8086/api/interactions/notifications/email', {
          user_id: String(userId),
          recipient_email: userEmail,
          type: 'ORDER_SHIPPED',
          order_number: orderData.order_number,
          tracking_number: shipmentData.tracking_number,
          carrier: shipmentData.carrier,
        });
      } catch (shipErr) {
        console.error("Error generando guía de envío:", shipErr);
      }

      setCheckoutResult({
        ...orderData,
        shipment: shipmentData,
        shipping_cost: carrierToUse.shipping_cost,
      });
      fetchCart();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al procesar la compra');
    } finally {
      setProcessingCheckout(false);
    }
  };

  if (!cart) return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Cargando carrito...</p>;

  // Pantalla de Confirmación de Compra y Firma Criptográfica
  if (checkoutResult) {
    return (
      <div style={{ maxWidth: '750px', margin: '2rem auto' }}>
        <div className="card" style={{ padding: '2.5rem', borderTop: '5px solid var(--success-color)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '3rem' }}>🎉</span>
            <h2 style={{ color: 'var(--success-color)', marginTop: '0.5rem' }}>{checkoutResult.message}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              El stock ha sido descontado, tu pago fue aprobado y se generó tu comprobante electrónico y guía de envío.
            </p>
          </div>

          <div style={{ backgroundColor: '#f9fafb', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', fontSize: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <strong>Número de Orden:</strong>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', margin: '0.2rem 0' }}>{checkoutResult.order_number}</p>
              </div>
              <div>
                <strong>Recibo Electrónico:</strong>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', margin: '0.2rem 0' }}>{checkoutResult.receipt_number}</p>
              </div>
              <div>
                <strong>Referencia de Pago:</strong>
                <p style={{ margin: '0.2rem 0', fontFamily: 'monospace' }}>{checkoutResult.transaction_ref}</p>
              </div>
              <div>
                <strong>Total Cobrado (Carrito):</strong>
                <p style={{ margin: '0.2rem 0', fontWeight: '700', color: 'var(--success-color)' }}>
                  ${checkoutResult.total?.toLocaleString('es-MX')} (+ ${checkoutResult.shipping_cost} envío)
                </p>
              </div>
            </div>

            {checkoutResult.shipment && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed var(--border-color)' }}>
                <strong>🚚 Logística y Guía de Rastreo ({checkoutResult.shipment.carrier}):</strong>
                <p style={{ margin: '0.3rem 0', fontFamily: 'monospace', fontSize: '15px', fontWeight: '700', color: '#2563eb' }}>
                  Guía: {checkoutResult.shipment.tracking_number} — Estado: {checkoutResult.shipment.status}
                </p>
              </div>
            )}

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed var(--border-color)' }}>
              <strong>🔒 Firma Criptográfica de la Transacción (HMAC-SHA256):</strong>
              <p style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', backgroundColor: '#e5e7eb', padding: '0.5rem', borderRadius: '4px', marginTop: '0.3rem' }}>
                {checkoutResult.crypto_signature}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link to="/profile">
              <button>📦 Ver Historial de Pedidos, Recibos y Rastreo</button>
            </Link>
            <Link to="/">
              <button style={{ backgroundColor: '#f3f4f6', color: '#111' }}>Seguir Comprando</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '950px', margin: '2rem auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Tu Carrito de Compras</h2>

      {cart.items && cart.items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.3fr', gap: '2rem', alignItems: 'flex-start' }}>
          
          {/* Columna Izquierda: Lista de productos + Formulario de Checkout */}
          <div>
            {cart.items.map(item => (
              <div 
                key={item.productId} 
                className="card" 
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginBottom: '1rem', 
                  padding: '1.25rem' 
                }}
              >
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem' }}>
                    {item.name || `Producto #${item.productId}`}
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                    Precio unitario: ${item.price?.toLocaleString('es-MX')}
                  </p>
                  <p style={{ fontWeight: '600', color: '#111827', marginTop: '0.25rem' }}>
                    Subtotal: ${(item.price * item.quantity).toLocaleString('es-MX')}
                  </p>
                </div>

                {/* Controles para Editar Cantidad (+ / -) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                      style={{ backgroundColor: '#f3f4f6', color: '#111', padding: '0.4rem 0.75rem', borderRadius: 0 }}
                      title="Reducir cantidad"
                    >
                      -
                    </button>
                    <span style={{ padding: '0 0.75rem', fontWeight: '600', minWidth: '30px', textAlign: 'center', fontSize: '14px' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                      style={{ backgroundColor: '#f3f4f6', color: '#111', padding: '0.4rem 0.75rem', borderRadius: 0 }}
                      title="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>

                  {/* Botón Eliminar */}
                  <button 
                    onClick={() => handleRemove(item.productId)}
                    style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '13px' }}
                    title="Eliminar del carrito"
                  >
                    🗑️ Quitar
                  </button>
                </div>
              </div>
            ))}

            {/* Panel de Checkout: Logística y Pago */}
            {showCheckout && (
              <div className="card" style={{ padding: '1.75rem', marginTop: '1.5rem', border: '2px solid var(--primary-color)' }}>
                <h3 style={{ marginBottom: '1rem' }}>📦 1. Logística y Cotización de Envío (Shipping Service :8085)</h3>

                {savedAddresses.length > 0 && (
                  <div className="form-group">
                    <label>Seleccionar dirección de tu libreta:</label>
                    <select
                      onChange={(e) => {
                        const addr = savedAddresses.find(a => String(a.id) === e.target.value);
                        if (addr) {
                          setShippingAddress(`${addr.street}, ${addr.city}, CP ${addr.zip_code}, ${addr.country}`);
                          setDestZip(addr.zip_code);
                        }
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    >
                      {savedAddresses.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.alias || 'Dirección'}: {a.street}, {a.city} (CP {a.zip_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>Dirección completa de entrega:</label>
                  <input
                    type="text"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>C.P. Origen</label>
                    <input type="text" value={originZip} onChange={(e) => setOriginZip(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>C.P. Destino</label>
                    <input type="text" value={destZip} onChange={(e) => setDestZip(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Peso (kg)</label>
                    <input type="number" step="0.5" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                  </div>
                  <button type="button" onClick={handleCalculateShipping} disabled={calculatingShipping}>
                    {calculatingShipping ? 'Cotizando...' : 'Calcular Tarifas'}
                  </button>
                </div>

                {shippingOptions.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                      Selecciona tu paquetería:
                    </label>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {shippingOptions.map((opt, idx) => (
                        <label
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            border: selectedCarrier?.carrier === opt.carrier ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            backgroundColor: selectedCarrier?.carrier === opt.carrier ? '#eff6ff' : '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="radio"
                              name="carrier"
                              checked={selectedCarrier?.carrier === opt.carrier}
                              onChange={() => setSelectedCarrier(opt)}
                              style={{ width: 'auto' }}
                            />
                            <div>
                              <strong>{opt.carrier} ({opt.service_type})</strong>
                              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{opt.description}</p>
                            </div>
                          </div>
                          <span style={{ fontWeight: '700' }}>${opt.shipping_cost}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <h3 style={{ marginBottom: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  💳 2. Método de Pago (Order & Payment Service :8084)
                </h3>

                <form onSubmit={handleProcessCheckout}>
                  <div className="form-group">
                    <label>Pasarela / Método de Pago:</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    >
                      <option value="CREDIT_CARD">Tarjeta de Crédito / Débito (Stripe / Bancos)</option>
                      <option value="PAYPAL">PayPal Express Checkout</option>
                    </select>
                  </div>

                  {paymentMethod !== 'PAYPAL' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '13px' }}>Número de Tarjeta</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4242424242424242"
                          required
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '13px' }}>Titular</label>
                        <input
                          type="text"
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={processingCheckout}
                    style={{ width: '100%', backgroundColor: 'var(--success-color)', padding: '0.9rem', fontSize: '15px', fontWeight: '700' }}
                  >
                    {processingCheckout ? 'Procesando Orden, Pago y Guía...' : '✅ Confirmar y Pagar Ahora'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Resumen Financiero Dinámico */}
          <div>
            <div className="card" style={{ position: 'sticky', top: '100px', padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                Resumen de Compra
              </h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '14px' }}>
                <span style={{ color: '#4b5563' }}>Subtotal:</span>
                <span style={{ fontWeight: '500' }}>${cart.subtotal.toLocaleString('es-MX')}</span>
              </div>
              
              {cart.coupon && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', color: 'var(--success-color)', fontSize: '14px' }}>
                  <span>
                    Descuento ({cart.coupon}):
                    <button 
                      onClick={handleRemoveCoupon} 
                      style={{ background: 'none', color: '#ef4444', border: 'none', padding: '0 0 0 8px', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                    >
                      (Quitar)
                    </button>
                  </span>
                  <span style={{ fontWeight: '600' }}>-${cart.discount.toLocaleString('es-MX')}</span>
                </div>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', color: '#6b7280', fontSize: '14px' }}>
                <span>Impuestos IVA (16%):</span>
                <span>${cart.iva.toLocaleString('es-MX')}</span>
              </div>

              {selectedCarrier && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', color: '#2563eb', fontSize: '14px' }}>
                  <span>Envío ({selectedCarrier.carrier}):</span>
                  <span>+${selectedCarrier.shipping_cost.toLocaleString('es-MX')}</span>
                </div>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.3rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
                <span>Total a Pagar:</span>
                <span>${(cart.total + (selectedCarrier ? selectedCarrier.shipping_cost : 0)).toLocaleString('es-MX')}</span>
              </div>

              {/* Formulario de Cupones Promocionales */}
              <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  ¿Tienes un cupón? (Prueba: DESCUENTO10 o PROMO20)
                </p>
                <form onSubmit={handleApplyCoupon} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="CUPÓN" 
                    value={couponCode} 
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    style={{ padding: '0.5rem', fontSize: '13px' }}
                  />
                  <button type="submit" disabled={loading} style={{ padding: '0.5rem 0.9rem', fontSize: '13px' }}>
                    Aplicar
                  </button>
                </form>
                {error && <p style={{ color: 'var(--error-color)', fontSize: '12px', marginTop: '0.4rem' }}>{error}</p>}
              </div>

              <button
                onClick={() => {
                  setShowCheckout(!showCheckout);
                  if (!showCheckout && shippingOptions.length === 0) {
                    handleCalculateShipping();
                  }
                }}
                style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'var(--primary-color)', fontSize: '15px', padding: '0.8rem' }}
              >
                {showCheckout ? 'Ocultar Opciones de Pago' : '💳 Proceder al Pago y Envío'}
              </button>
            </div>
          </div>

        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem', border: '1px dashed var(--border-color)', borderRadius: '12px', background: '#fff' }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Tu carrito está vacío</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1.5rem' }}>
            Los productos que agregues se mantendrán guardados temporalmente en tu sesión.
          </p>
          <Link to="/">
            <button>Explorar el Catálogo</button>
          </Link>
        </div>
      )}
    </div>
  );
}


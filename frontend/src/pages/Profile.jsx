import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

export default function Profile() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'wishlists' | 'notifications' | 'personal' | 'addresses' | 'payments'
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [profileMsg, setProfileMsg] = useState({ text: '', type: '' });

  // Addresses state
  const [addresses, setAddresses] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressForm, setAddressForm] = useState({
    id: null,
    alias: '',
    street: '',
    city: '',
    zip_code: '',
    country: '',
    is_shipping: true,
    is_billing: false,
  });
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressMsg, setAddressMsg] = useState({ text: '', type: '' });

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    card_brand: 'Visa',
    last_four: '',
    stripe_token: 'tok_visa_sample_' + Math.floor(1000 + Math.random() * 9000),
    is_default: false,
  });
  const [paymentMsg, setPaymentMsg] = useState({ text: '', type: '' });

  // Orders, Receipts & Shipments state (:8084 & :8085)
  const [orders, setOrders] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [shippingMsg, setShippingMsg] = useState('');

  // Wishlists & Notifications state (:8086)
  const [wishlists, setWishlists] = useState([]);
  const [newWishlistName, setNewWishlistName] = useState('');
  const [sharedPreview, setSharedPreview] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const getEffectiveUserId = () => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return String(payload.id);
      } catch (e) {}
    }
    if (user?.id) return String(user.id);
    return 'guest-123';
  };

  const currentUserId = getEffectiveUserId();

  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` },
  };

  useEffect(() => {
    fetchOrders();
    fetchWishlists();
    fetchNotifications();
    if (token) {
      fetchAddresses();
      fetchPaymentMethods();
    }
  }, [token, currentUserId]);

  // Orders & Receipts (:8084) + Shipping (:8085)
  const fetchOrders = async () => {
    try {
      const res = await axios.get(`http://localhost:8084/api/orders/user/${currentUserId}`);
      setOrders(res.data || []);
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    }
  };

  const handleViewReceipt = async (orderId) => {
    try {
      const res = await axios.get(`http://localhost:8084/api/orders/${orderId}/receipt`);
      setSelectedReceipt(res.data);
    } catch (err) {
      alert('No se pudo obtener el recibo electrónico.');
    }
  };

  const handleTrackOrderShipment = async (orderId) => {
    setShippingMsg('');
    try {
      const shipRes = await axios.get(`http://localhost:8085/api/shipping/shipments/order/${orderId}`);
      const trackingNum = shipRes.data.tracking_number;
      const trackRes = await axios.get(`http://localhost:8085/api/shipping/shipments/track/${trackingNum}`);
      setSelectedShipment(trackRes.data);
    } catch (err) {
      // Si aún no tiene guía, permitir generarla al vuelo
      try {
        const createRes = await axios.post('http://localhost:8085/api/shipping/shipments', {
          order_id: orderId,
          carrier: 'DHL Express',
          service_type: 'EXPRESS',
          origin_zip: '06600',
          destination_zip: '64000',
          destination_address: 'Dirección de la orden',
          shipping_cost: 145.0,
        });
        const trackRes = await axios.get(`http://localhost:8085/api/shipping/shipments/track/${createRes.data.tracking_number}`);
        setSelectedShipment(trackRes.data);
      } catch (e) {
        alert('Error consultando o generando guía de envío.');
      }
    }
  };

  const handleUpdateShipmentStatus = async (trackingNumber, newStatus, location, description) => {
    try {
      await axios.put(`http://localhost:8085/api/shipping/shipments/${trackingNumber}/status`, {
        status: newStatus,
        location,
        description,
      });
      const trackRes = await axios.get(`http://localhost:8085/api/shipping/shipments/track/${trackingNumber}`);
      setSelectedShipment(trackRes.data);
      setShippingMsg(`✅ Estado actualizado a ${newStatus} y sincronizado con Order Service (:8084)`);
      fetchOrders();
    } catch (err) {
      alert('Error al actualizar estado de envío');
    }
  };

  // Wishlists (:8086)
  const fetchWishlists = async () => {
    try {
      const res = await axios.get(`http://localhost:8086/api/interactions/wishlists/user/${currentUserId}`);
      setWishlists(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateWishlist = async (e) => {
    e.preventDefault();
    if (!newWishlistName.trim()) return;
    try {
      await axios.post('http://localhost:8086/api/interactions/wishlists', {
        user_id: currentUserId,
        name: newWishlistName.trim(),
        is_public: true,
      });
      setNewWishlistName('');
      fetchWishlists();
    } catch (err) {
      alert('Error al crear Wishlist');
    }
  };

  const handleRemoveWishlistItem = async (wishlistId, productId) => {
    try {
      await axios.delete(`http://localhost:8086/api/interactions/wishlists/${wishlistId}/items/${productId}`);
      fetchWishlists();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePreviewSharedWishlist = async (shareToken) => {
    try {
      const res = await axios.get(`http://localhost:8086/api/interactions/wishlists/share/${shareToken}`);
      setSharedPreview(res.data);
    } catch (err) {
      alert('Error al consultar enlace compartido');
    }
  };

  // Notifications (:8086)
  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`http://localhost:8086/api/interactions/notifications/user/${currentUserId}`);
      setNotifications(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Personal Info
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ text: '', type: '' });
    try {
      await axios.put('http://localhost:3002/api/users/profile', { full_name: fullName }, authHeaders);
      const updatedUser = { ...user, full_name: fullName };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setProfileMsg({ text: 'Perfil actualizado exitosamente', type: 'success' });
    } catch (err) {
      setProfileMsg({ text: err.response?.data?.error || 'Error al actualizar perfil', type: 'error' });
    }
  };

  // Addresses CRUD
  const fetchAddresses = async () => {
    setAddressLoading(true);
    try {
      const res = await axios.get('http://localhost:3002/api/users/addresses', authHeaders);
      setAddresses(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setAddressLoading(false);
    }
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    setAddressMsg({ text: '', type: '' });
    try {
      if (isEditingAddress && addressForm.id) {
        await axios.put(
          `http://localhost:3002/api/users/addresses/${addressForm.id}`,
          {
            alias: addressForm.alias,
            street: addressForm.street,
            city: addressForm.city,
            zip_code: addressForm.zip_code,
            country: addressForm.country,
            is_shipping: addressForm.is_shipping,
            is_billing: addressForm.is_billing,
          },
          authHeaders
        );
        setAddressMsg({ text: 'Dirección actualizada correctamente', type: 'success' });
      } else {
        await axios.post(
          'http://localhost:3002/api/users/addresses',
          {
            alias: addressForm.alias,
            street: addressForm.street,
            city: addressForm.city,
            zip_code: addressForm.zip_code,
            country: addressForm.country,
            is_shipping: addressForm.is_shipping,
            is_billing: addressForm.is_billing,
          },
          authHeaders
        );
        setAddressMsg({ text: 'Dirección guardada exitosamente', type: 'success' });
      }

      setAddressForm({
        id: null,
        alias: '',
        street: '',
        city: '',
        zip_code: '',
        country: '',
        is_shipping: true,
        is_billing: false,
      });
      setIsEditingAddress(false);
      fetchAddresses();
    } catch (err) {
      setAddressMsg({ text: err.response?.data?.error || 'Error al guardar dirección', type: 'error' });
    }
  };

  const handleEditAddress = (addr) => {
    setAddressForm({
      id: addr.id,
      alias: addr.alias || '',
      street: addr.street || '',
      city: addr.city || '',
      zip_code: addr.zip_code || '',
      country: addr.country || '',
      is_shipping: Boolean(addr.is_shipping),
      is_billing: Boolean(addr.is_billing),
    });
    setIsEditingAddress(true);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDeleteAddress = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta dirección?')) return;
    try {
      await axios.delete(`http://localhost:3002/api/users/addresses/${id}`, authHeaders);
      fetchAddresses();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar dirección');
    }
  };

  // Payment Methods CRUD
  const fetchPaymentMethods = async () => {
    setPaymentLoading(true);
    try {
      const res = await axios.get('http://localhost:3002/api/users/payment-methods', authHeaders);
      setPaymentMethods(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleAddPaymentMethod = async (e) => {
    e.preventDefault();
    setPaymentMsg({ text: '', type: '' });
    try {
      await axios.post(
        'http://localhost:3002/api/users/payment-methods',
        {
          card_brand: paymentForm.card_brand,
          last_four: paymentForm.last_four,
          stripe_token: paymentForm.stripe_token,
          is_default: paymentForm.is_default,
        },
        authHeaders
      );
      setPaymentMsg({ text: 'Método de pago registrado con éxito', type: 'success' });
      setPaymentForm({
        card_brand: 'Visa',
        last_four: '',
        stripe_token: 'tok_visa_sample_' + Math.floor(1000 + Math.random() * 9000),
        is_default: false,
      });
      fetchPaymentMethods();
    } catch (err) {
      setPaymentMsg({ text: err.response?.data?.error || 'Error al registrar método de pago', type: 'error' });
    }
  };

  const handleDeletePaymentMethod = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este método de pago?')) return;
    try {
      await axios.delete(`http://localhost:3002/api/users/payment-methods/${id}`, authHeaders);
      fetchPaymentMethods();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar método de pago');
    }
  };

  return (
    <div style={{ maxWidth: '980px', margin: '2rem auto' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Centro de Cuenta, Pedidos y Fidelización</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '1.5rem' }}>
        Usuario activo: <strong>{user?.email || `Sesión Invitado (${currentUserId})`}</strong>
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            backgroundColor: activeTab === 'orders' ? 'var(--primary-color)' : '#f3f4f6',
            color: activeTab === 'orders' ? '#fff' : 'var(--text-color)',
            borderRadius: '6px 6px 0 0',
          }}
        >
          📦 Mis Pedidos y Envíos ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('wishlists')}
          style={{
            backgroundColor: activeTab === 'wishlists' ? 'var(--primary-color)' : '#f3f4f6',
            color: activeTab === 'wishlists' ? '#fff' : 'var(--text-color)',
            borderRadius: '6px 6px 0 0',
          }}
        >
          ❤️ Wishlists ({wishlists.length})
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          style={{
            backgroundColor: activeTab === 'notifications' ? 'var(--primary-color)' : '#f3f4f6',
            color: activeTab === 'notifications' ? '#fff' : 'var(--text-color)',
            borderRadius: '6px 6px 0 0',
          }}
        >
          🔔 Notificaciones Email ({notifications.length})
        </button>
        {token && (
          <>
            <button
              onClick={() => setActiveTab('personal')}
              style={{
                backgroundColor: activeTab === 'personal' ? 'var(--primary-color)' : '#f3f4f6',
                color: activeTab === 'personal' ? '#fff' : 'var(--text-color)',
                borderRadius: '6px 6px 0 0',
              }}
            >
              👤 Datos Personales
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              style={{
                backgroundColor: activeTab === 'addresses' ? 'var(--primary-color)' : '#f3f4f6',
                color: activeTab === 'addresses' ? '#fff' : 'var(--text-color)',
                borderRadius: '6px 6px 0 0',
              }}
            >
              📍 Direcciones ({addresses.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              style={{
                backgroundColor: activeTab === 'payments' ? 'var(--primary-color)' : '#f3f4f6',
                color: activeTab === 'payments' ? '#fff' : 'var(--text-color)',
                borderRadius: '6px 6px 0 0',
              }}
            >
              💳 Métodos de Pago ({paymentMethods.length})
            </button>
          </>
        )}
      </div>

      {/* Tab 1: Historial de Pedidos, Recibos Electrónicos y Rastreo Logístico (:8084 & :8085) */}
      {activeTab === 'orders' && (
        <div>
          {/* Modal / Panel de Recibo Electrónico */}
          {selectedReceipt && (
            <div className="card" style={{ marginBottom: '2rem', border: '2px solid #10b981', backgroundColor: '#ecfdf5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#065f46' }}>📄 Comprobante Fiscal / Recibo Electrónico #{selectedReceipt.receipt_number}</h3>
                <button onClick={() => setSelectedReceipt(null)} style={{ backgroundColor: '#fff', color: '#111', padding: '0.3rem 0.7rem' }}>Cerrar ✕</button>
              </div>
              <div style={{ marginTop: '1rem', fontSize: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><strong>Orden:</strong> {selectedReceipt.details?.order_number}</div>
                <div><strong>Fecha Emisión:</strong> {new Date(selectedReceipt.issued_at).toLocaleString('es-MX')}</div>
                <div><strong>Pasarela:</strong> {selectedReceipt.details?.payment_gateway} ({selectedReceipt.details?.transaction_ref})</div>
                <div><strong>Total Facturado:</strong> ${selectedReceipt.details?.total?.toLocaleString('es-MX')} (IVA: ${selectedReceipt.details?.iva_16?.toLocaleString('es-MX')})</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Dirección de Envío:</strong> {selectedReceipt.details?.shipping_address}</div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Sello Digital SHA-256 del Comprobante:</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                    {selectedReceipt.crypto_hash}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal / Panel de Rastreo y Simulación Logística (:8085) */}
          {selectedShipment && (
            <div className="card" style={{ marginBottom: '2rem', border: '2px solid #2563eb', backgroundColor: '#eff6ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#1e40af' }}>
                  🚚 Rastreo en Vivo — {selectedShipment.carrier} ({selectedShipment.tracking_number})
                </h3>
                <button onClick={() => setSelectedShipment(null)} style={{ backgroundColor: '#fff', color: '#111', padding: '0.3rem 0.7rem' }}>Cerrar ✕</button>
              </div>

              <p style={{ fontSize: '14px', margin: '0.75rem 0' }}>
                Estado Actual: <span className="badge success">{selectedShipment.status}</span> | Origen CP: {selectedShipment.origin_zip} → Destino CP: {selectedShipment.destination_zip}
              </p>

              {/* Botones para actualizar el estado del pedido en vivo */}
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '0.5rem' }}>
                  Simulador de Paquetería (Actualizar Estado del Pedido en Shipping Service :8085):
                </strong>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleUpdateShipmentStatus(selectedShipment.tracking_number, 'PACKING', 'Almacén Central CDMX', 'Empacando productos para recolección')}
                    style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#f3f4f6', color: '#111' }}
                  >
                    1. Empacando (PACKING)
                  </button>
                  <button
                    onClick={() => handleUpdateShipmentStatus(selectedShipment.tracking_number, 'IN_TRANSIT', 'Hub Regional Querétaro', 'Paquete en tránsito hacia ciudad destino')}
                    style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: '#fff' }}
                  >
                    2. En Tránsito (IN_TRANSIT)
                  </button>
                  <button
                    onClick={() => handleUpdateShipmentStatus(selectedShipment.tracking_number, 'OUT_FOR_DELIVERY', 'Unidad de Reparto Local', 'En ruta de entrega con el mensajero')}
                    style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#d97706', color: '#fff' }}
                  >
                    3. En Reparto (OUT_FOR_DELIVERY)
                  </button>
                  <button
                    onClick={() => handleUpdateShipmentStatus(selectedShipment.tracking_number, 'DELIVERED', 'Domicilio del Cliente', 'Entregado exitosamente y firmado por el destinatario')}
                    style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#10b981', color: '#fff' }}
                  >
                    4. Entregado (DELIVERED)
                  </button>
                  <button
                    onClick={() => handleUpdateShipmentStatus(selectedShipment.tracking_number, 'RETURNED', 'Centro de Devoluciones', 'Paquete devuelto al remitente')}
                    style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#ef4444', color: '#fff' }}
                  >
                    5. Devuelto (RETURNED)
                  </button>
                </div>
                {shippingMsg && <p style={{ margin: '0.5rem 0 0 0', fontSize: '13px', color: '#047857', fontWeight: '600' }}>{shippingMsg}</p>}
              </div>

              {/* Historial de Checkpoints */}
              <div>
                <strong style={{ fontSize: '13px' }}>Historial de Movimientos (Checkpoints):</strong>
                <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                  {selectedShipment.checkpoints && selectedShipment.checkpoints.map((cp) => (
                    <div key={cp.id} style={{ backgroundColor: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>[{cp.status}] {cp.location}</strong> — {cp.description}
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(cp.timestamp).toLocaleString('es-MX')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {orders.length > 0 ? (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {orders.map((ord) => (
                <div key={ord.id} className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Orden #{ord.order_number}</span>
                      <span style={{ marginLeft: '0.75rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(ord.created_at).toLocaleString('es-MX')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="badge success" style={{ margin: 0 }}>Estado: {ord.status}</span>
                      <span className="badge" style={{ margin: 0 }}>{ord.payment_method}</span>
                    </div>
                  </div>

                  {/* Artículos de la orden */}
                  <div style={{ marginBottom: '1rem', fontSize: '14px' }}>
                    {ord.items && ord.items.map((it) => (
                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                        <Link to={`/product/${it.product_id}`} style={{ fontWeight: '500', color: '#2563eb' }}>
                          {it.quantity}x {it.name}
                        </Link>
                        <span>${it.subtotal?.toLocaleString('es-MX')}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Dirección: {ord.shipping_address}</span>
                      <div style={{ fontWeight: '700', fontSize: '1.1rem', marginTop: '0.2rem' }}>
                        Total: ${ord.total?.toLocaleString('es-MX')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleViewReceipt(ord.id)}
                        style={{ backgroundColor: '#ecfdf5', color: '#047857', fontSize: '13px', padding: '0.5rem 0.9rem' }}
                      >
                        📄 Recibo Electrónico
                      </button>
                      <button
                        onClick={() => handleTrackOrderShipment(ord.id)}
                        style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '13px', padding: '0.5rem 0.9rem' }}
                      >
                        🚚 Rastrear / Actualizar Envío
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Aún no tienes pedidos registrados con este usuario.</p>
              <Link to="/">
                <button>Ir al Catálogo para hacer una compra de prueba</button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Listas de Deseos Compartibles (:8086) */}
      {activeTab === 'wishlists' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', maxWidth: '550px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Crear Nueva Lista de Deseos (Compartible)</h3>
            <form onSubmit={handleCreateWishlist} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Ej. Regalos de Cumpleaños, Setup Gamer..."
                value={newWishlistName}
                onChange={(e) => setNewWishlistName(e.target.value)}
                required
              />
              <button type="submit">Crear Lista</button>
            </form>
          </div>

          {sharedPreview && (
            <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid #ec4899', backgroundColor: '#fdf2f8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, color: '#9d174d' }}>
                  🔗 Vista Pública Compartida: "{sharedPreview.name}" (Token: {sharedPreview.share_token})
                </h4>
                <button onClick={() => setSharedPreview(null)} style={{ backgroundColor: '#fff', color: '#111', padding: '0.25rem 0.6rem' }}>Cerrar ✕</button>
              </div>
              <p style={{ fontSize: '13px', margin: '0.5rem 0' }}>
                Endpoint público: <code>http://localhost:8086/api/interactions/wishlists/share/{sharedPreview.share_token}</code>
              </p>
              <ul style={{ margin: 0, fontSize: '14px' }}>
                {sharedPreview.items && sharedPreview.items.map((it) => (
                  <li key={it.id}>{it.notes || `Producto ID: ${it.product_id}`}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {wishlists.map((w) => (
              <div key={w.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>❤️ {w.name}</h4>
                  <span className="badge success" style={{ margin: 0 }}>Pública ({w.share_token})</span>
                </div>

                {w.items && w.items.length > 0 ? (
                  <div style={{ margin: '0.75rem 0', fontSize: '14px' }}>
                    {w.items.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <Link to={`/product/${item.product_id}`} style={{ color: '#2563eb' }}>
                          {item.notes || `Producto #${item.product_id}`}
                        </Link>
                        <button
                          onClick={() => handleRemoveWishlistItem(w.id, item.product_id)}
                          style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.2rem 0.5rem', fontSize: '11px' }}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0.75rem 0' }}>
                    Lista vacía. Agrega productos desde el detalle de cualquier artículo.
                  </p>
                )}

                <button
                  onClick={() => handlePreviewSharedWishlist(w.share_token)}
                  style={{ marginTop: 'auto', backgroundColor: '#fce7f3', color: '#be185d', fontSize: '13px' }}
                >
                  🔗 Probar Enlace Compartible ({w.share_token})
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Notificaciones Transaccionales (:8086) */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {notifications.length > 0 ? (
            notifications.map((n) => (
              <div key={n.id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <strong style={{ color: '#111827' }}>✉️ {n.subject}</strong>
                  <span className="badge success" style={{ margin: 0 }}>{n.type} ({n.status})</span>
                </div>
                <p style={{ margin: '0.3rem 0', fontSize: '14px', color: '#4b5563' }}>{n.body_content}</p>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Enviado el {new Date(n.sent_at).toLocaleString('es-MX')}
                </span>
              </div>
            ))
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No hay notificaciones enviadas aún. Al realizar una compra se enviarán correos transaccionales automáticamente.
            </div>
          )}
        </div>
      )}

      {/* Tab: Datos Personales */}
      {activeTab === 'personal' && (
        <div className="card" style={{ maxWidth: '500px' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Información de la Cuenta</h3>
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>Correo Electrónico (No editable)</label>
              <input type="text" value={user?.email || 'N/A'} disabled style={{ backgroundColor: '#f9fafb' }} />
            </div>
            <div className="form-group">
              <label>Nombre Completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <button type="submit" style={{ marginTop: '0.5rem' }}>Guardar Cambios</button>
          </form>
          {profileMsg.text && (
            <p style={{ marginTop: '1rem', fontSize: '14px', color: profileMsg.type === 'error' ? 'var(--error-color)' : 'var(--success-color)' }}>
              {profileMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Tab: Libreta de Direcciones */}
      {activeTab === 'addresses' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {addresses.map((addr) => (
              <div key={addr.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h4 style={{ margin: 0 }}>{addr.alias || 'Dirección'}</h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {addr.is_shipping && <span className="badge success" style={{ margin: 0 }}>Envío</span>}
                    {addr.is_billing && <span className="badge" style={{ margin: 0, backgroundColor: '#dbeafe', color: '#1e40af' }}>Facturación</span>}
                  </div>
                </div>
                <p style={{ margin: '0.75rem 0', fontSize: '14px', color: '#374151' }}>
                  {addr.street}<br />
                  {addr.city}, {addr.zip_code}<br />
                  {addr.country}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  <button onClick={() => handleEditAddress(addr)} style={{ backgroundColor: '#f3f4f6', color: '#111', padding: '0.4rem 0.8rem', fontSize: '12px' }}>
                    Editar
                  </button>
                  <button onClick={() => handleDeleteAddress(addr.id)} style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '12px' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {addresses.length === 0 && !addressLoading && (
              <p style={{ color: 'var(--text-muted)' }}>No tienes direcciones registradas aún.</p>
            )}
          </div>

          {/* Formulario Agregar/Editar Dirección */}
          <div className="card" style={{ maxWidth: '600px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>{isEditingAddress ? 'Editar Dirección' : 'Agregar Nueva Dirección'}</h3>
            <form onSubmit={handleSaveAddress}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Alias (Ej. Casa, Oficina)</label>
                  <input
                    type="text"
                    value={addressForm.alias}
                    onChange={(e) => setAddressForm({ ...addressForm, alias: e.target.value })}
                    placeholder="Casa"
                  />
                </div>
                <div className="form-group">
                  <label>Calle y Número</label>
                  <input
                    type="text"
                    value={addressForm.street}
                    onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                    required
                    placeholder="Av. Reforma 123"
                  />
                </div>
                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    required
                    placeholder="Ciudad de México"
                  />
                </div>
                <div className="form-group">
                  <label>Código Postal</label>
                  <input
                    type="text"
                    value={addressForm.zip_code}
                    onChange={(e) => setAddressForm({ ...addressForm, zip_code: e.target.value })}
                    required
                    placeholder="06600"
                  />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>País</label>
                  <input
                    type="text"
                    value={addressForm.country}
                    onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                    required
                    placeholder="México"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={addressForm.is_shipping}
                    onChange={(e) => setAddressForm({ ...addressForm, is_shipping: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Dirección de Envío
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={addressForm.is_billing}
                    onChange={(e) => setAddressForm({ ...addressForm, is_billing: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Dirección de Facturación
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="submit">{isEditingAddress ? 'Actualizar Dirección' : 'Guardar Dirección'}</button>
                {isEditingAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingAddress(false);
                      setAddressForm({ id: null, alias: '', street: '', city: '', zip_code: '', country: '', is_shipping: true, is_billing: false });
                    }}
                    style={{ backgroundColor: '#f3f4f6', color: '#111' }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
            {addressMsg.text && (
              <p style={{ marginTop: '1rem', fontSize: '14px', color: addressMsg.type === 'error' ? 'var(--error-color)' : 'var(--success-color)' }}>
                {addressMsg.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Métodos de Pago */}
      {activeTab === 'payments' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>💳 {pm.card_brand}</span>
                  {pm.is_default && <span className="badge success" style={{ margin: 0 }}>Predeterminado</span>}
                </div>
                <p style={{ margin: '1rem 0', fontSize: '16px', letterSpacing: '2px', color: '#4b5563' }}>
                  •••• •••• •••• {pm.last_four}
                </p>
                <button
                  onClick={() => handleDeletePaymentMethod(pm.id)}
                  style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.4rem 0.8rem', fontSize: '12px', marginTop: 'auto' }}
                >
                  Eliminar Tarjeta
                </button>
              </div>
            ))}
            {paymentMethods.length === 0 && !paymentLoading && (
              <p style={{ color: 'var(--text-muted)' }}>No tienes métodos de pago guardados.</p>
            )}
          </div>

          {/* Formulario Agregar Método de Pago */}
          <div className="card" style={{ maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Agregar Tarjeta</h3>
            <form onSubmit={handleAddPaymentMethod}>
              <div className="form-group">
                <label>Marca de la Tarjeta</label>
                <select
                  value={paymentForm.card_brand}
                  onChange={(e) => setPaymentForm({ ...paymentForm, card_brand: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                >
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="American Express">American Express</option>
                </select>
              </div>
              <div className="form-group">
                <label>Últimos 4 dígitos</label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="\d{4}"
                  placeholder="4242"
                  value={paymentForm.last_four}
                  onChange={(e) => setPaymentForm({ ...paymentForm, last_four: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={paymentForm.is_default}
                    onChange={(e) => setPaymentForm({ ...paymentForm, is_default: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Establecer como método de pago por defecto
                </label>
              </div>
              <button type="submit">Guardar Método de Pago</button>
            </form>
            {paymentMsg.text && (
              <p style={{ marginTop: '1rem', fontSize: '14px', color: paymentMsg.type === 'error' ? 'var(--error-color)' : 'var(--success-color)' }}>
                {paymentMsg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


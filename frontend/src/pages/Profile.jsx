import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import SystemLicense from './SystemLicense';

export default function Profile() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'orders'); // 'orders' | 'subscriptions' | 'admin' | 'wishlists' | 'notifications' | 'personal' | 'addresses' | 'payments'
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [profileMsg, setProfileMsg] = useState({ text: '', type: '' });

  // Subscriptions & Tokens state (:3002)
  const [plans, setPlans] = useState([]);
  const [tokenPackages, setTokenPackages] = useState([]);
  const [tokenTransactions, setTokenTransactions] = useState([]);
  const [customTokenAmount, setCustomTokenAmount] = useState(200);
  const [selectedTokenPayment, setSelectedTokenPayment] = useState('Tarjeta Visa •••• 4242');
  const [tokenPurchaseLoading, setTokenPurchaseLoading] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subMsg, setSubMsg] = useState({ text: '', type: '' });

  // Admin management state (:3002)
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminMsg, setAdminMsg] = useState({ text: '', type: '' });

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

  // Facturación CFDI 4.0 Profact (:8087)
  const [facturaModalOrder, setFacturaModalOrder] = useState(null);
  const [facturaFormData, setFacturaFormData] = useState({
    rfc_receptor: 'XAXX010101000',
    nombre_receptor: 'PUBLICO EN GENERAL',
    cp_receptor: '01000',
    regimen_fiscal_receptor: '616',
    uso_cfdi: 'S01',
    forma_pago: '04',
  });
  const [facturaResult, setFacturaResult] = useState(null);
  const [facturaLoading, setFacturaLoading] = useState(false);
  const [facturaError, setFacturaError] = useState('');

  // Wishlists & Notifications state (:8086)
  const [wishlists, setWishlists] = useState([]);
  const [newWishlistName, setNewWishlistName] = useState('');
  const [sharedPreview, setSharedPreview] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // Partner SOA (Salvador - Hotel Paraíso: Microservicio 1 Usuarios & Microservicio 2 Notificaciones)
  const [hotelConfig, setHotelConfig] = useState({ hotel_url: 'http://localhost:8000', online: false, modo: '', mensaje: '' });
  const [hotelUrlInput, setHotelUrlInput] = useState('http://localhost:8000');
  const [hotelNotifications, setHotelNotifications] = useState([]);
  const [hotelReservations, setHotelReservations] = useState([]);
  const [hotelSource, setHotelSource] = useState('');
  const [hotelMsg, setHotelMsg] = useState('');
  const [hotelUser, setHotelUser] = useState(() => {
    const saved = localStorage.getItem('hotel_user');
    return saved ? JSON.parse(saved) : null;
  });

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
    fetchPartnerHotelData();
    fetchSubscriptionData();
    if (token) {
      fetchUserProfile();
      fetchAddresses();
      fetchPaymentMethods();
    }
  }, [token, currentUserId]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) setActiveTab(tabParam);
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'subscriptions') {
      fetchSubscriptionData();
    } else if (activeTab === 'admin' && user?.role === 'admin') {
      fetchAdminData();
    }
  }, [activeTab, user?.role]);

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
      setShippingMsg(`Estado actualizado a ${newStatus} y sincronizado con Order Service (:8084)`);
      fetchOrders();
    } catch (err) {
      alert('Error al actualizar estado de envío');
    }
  };

  // Handlers para Facturación CFDI 4.0 con Profact (:8087)
  const handleOpenFacturaModal = async (order) => {
    setFacturaModalOrder(order);
    setFacturaError('');
    setFacturaLoading(true);
    try {
      const res = await axios.get(`http://localhost:8087/api/billing/order/${order.id}/invoice`);
      if (res.data && res.data.uuid) {
        setFacturaResult(res.data);
      } else {
        setFacturaResult(null);
      }
    } catch (e) {
      setFacturaResult(null);
    } finally {
      setFacturaLoading(false);
    }
  };

  const handleEmitirFactura = async (e) => {
    e.preventDefault();
    if (!facturaModalOrder) return;
    setFacturaLoading(true);
    setFacturaError('');
    try {
      const res = await axios.post(`http://localhost:8087/api/billing/order/${facturaModalOrder.id}`, facturaFormData);
      setFacturaResult(res.data);

      // Registrar consumo operativo de Tokens del Sistema por Timbrado CFDI 4.0 (-5 🪙)
      try {
        await axios.post('http://localhost:3002/api/users/system/tokens/consume', {
          operation: 'cfdi_invoice',
          details: `CFDI 4.0 Orden #${facturaModalOrder.order_number || facturaModalOrder.id} (RFC: ${facturaFormData.rfc_receptor})`,
        });
        window.dispatchEvent(new Event('system-license-updated'));
      } catch (_) {}
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Error al emitir factura con Profact';
      setFacturaError(msg);
    } finally {
      setFacturaLoading(false);
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

  // Partner Hotel SOA (Microservicio 1 Usuarios & Microservicio 2 Notificaciones de Salvador)
  const fetchPartnerHotelData = async () => {
    try {
      const cfgRes = await axios.get('http://localhost:8080/api/partner-hotel/config');
      setHotelConfig(cfgRes.data);
      setHotelUrlInput(cfgRes.data.hotel_url || 'http://localhost:8000');

      const hotelToken = localStorage.getItem('hotel_token') || '';
      const targetEmail = hotelUser?.correo || user?.email || 'juan@cliente.com';
      const notifRes = await axios.get(`http://localhost:8080/api/partner-hotel/notifications?email=${encodeURIComponent(targetEmail)}`, {
        headers: { 'X-Hotel-Token': hotelToken },
      });
      setHotelNotifications(notifRes.data?.notificaciones || []);
      setHotelReservations(notifRes.data?.reservaciones || []);
      setHotelSource(notifRes.data?.origen_servicio || '');
    } catch (err) {
      console.error('Error consultando puente Hotel SOA:', err);
    }
  };

  const handleSaveHotelUrl = async (e) => {
    e.preventDefault();
    setHotelMsg('');
    try {
      await axios.post('http://localhost:8080/api/partner-hotel/config', {
        hotel_url: hotelUrlInput,
      });
      setHotelMsg('URL de Hotel Paraíso actualizada. Re-verificando conexión...');
      await fetchPartnerHotelData();
    } catch (err) {
      setHotelMsg('Error al guardar URL del hotel');
    }
  };

  const handleClearHotelNotifications = async () => {
    try {
      const hotelToken = localStorage.getItem('hotel_token') || '';
      const res = await axios.post('http://localhost:8080/api/partner-hotel/notifications/clear', {}, {
        headers: { 'X-Hotel-Token': hotelToken },
      });
      setHotelNotifications([]);
      setHotelMsg(res.data?.mensaje || 'Bandeja limpiada');
    } catch (err) {
      alert('Error al limpiar notificaciones del hotel');
    }
  };

  const handleQuickHotelSSO = async (demoEmail) => {
    try {
      const ssoRes = await axios.post('http://localhost:8080/api/partner-hotel/login', {
        email: demoEmail,
        password: '123',
      });
      if (ssoRes.data?.exito) {
        localStorage.setItem('hotel_token', ssoRes.data.token);
        localStorage.setItem('hotel_user', JSON.stringify(ssoRes.data.usuario));
        setHotelUser(ssoRes.data.usuario);
        setHotelMsg(`Sesión SSO vinculada con ${ssoRes.data.usuario.nombre} (${ssoRes.data.usuario.correo})`);
        await fetchPartnerHotelData();
      }
    } catch (err) {
      setHotelMsg('Error al cambiar usuario SSO del hotel');
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

  // --- Suscripciones por Tier y Compra de Tokens (:3002) ---
  const fetchUserProfile = async () => {
    if (!token) return;
    try {
      const res = await axios.get('http://localhost:3002/api/users/profile', authHeaders);
      if (res.data) {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
        window.dispatchEvent(new Event('user-updated'));
        if (res.data.full_name) setFullName(res.data.full_name);
      }
    } catch (err) {
      console.error('Error actualizando perfil:', err);
    }
  };

  const fetchSubscriptionData = async () => {
    setSubLoading(true);
    try {
      const [plansRes, packsRes] = await Promise.all([
        axios.get('http://localhost:3002/api/users/subscriptions/plans'),
        axios.get('http://localhost:3002/api/users/tokens/packages'),
      ]);
      setPlans(plansRes.data || []);
      setTokenPackages(packsRes.data || []);

      if (token) {
        const [subRes, walletRes] = await Promise.all([
          axios.get('http://localhost:3002/api/users/subscription', authHeaders),
          axios.get('http://localhost:3002/api/users/tokens/wallet', authHeaders),
        ]);
        setCurrentSubscription(subRes.data);
        setTokenTransactions(walletRes.data?.transactions || []);
      }
    } catch (err) {
      console.error('Error cargando Tiers y paquetes de tokens:', err);
    } finally {
      setSubLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    setSubLoading(true);
    setSubMsg({ text: '', type: '' });
    try {
      const res = await axios.post(
        'http://localhost:3002/api/users/subscription/subscribe',
        { plan_id: planId },
        authHeaders
      );
      setSubMsg({ text: res.data.message || '¡Tier activado exitosamente con tus Tokens!', type: 'success' });
      if (res.data.token) localStorage.setItem('token', res.data.token);
      if (res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        window.dispatchEvent(new Event('user-updated'));
      }
      fetchSubscriptionData();
    } catch (err) {
      setSubMsg({
        text: err.response?.data?.error || 'Error al activar Tier con Tokens',
        type: 'error',
      });
    } finally {
      setSubLoading(false);
    }
  };

  const handlePurchaseTokens = async ({ packageId = '', customTokens = 0 }) => {
    setTokenPurchaseLoading(true);
    setSubMsg({ text: '', type: '' });
    try {
      const res = await axios.post(
        'http://localhost:3002/api/users/tokens/purchase',
        {
          package_id: packageId,
          custom_tokens: Number(customTokens) || 0,
          payment_method: selectedTokenPayment,
        },
        authHeaders
      );
      setSubMsg({
        text: `🪙 ${res.data.message} (Nuevo saldo: ${res.data.token_balance} Tokens)`,
        type: 'success',
      });
      if (res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        window.dispatchEvent(new Event('user-updated'));
      }
      fetchSubscriptionData();
    } catch (err) {
      setSubMsg({
        text: err.response?.data?.error || 'Error al procesar la compra de Tokens',
        type: 'error',
      });
    } finally {
      setTokenPurchaseLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('¿Seguro que deseas cancelar tu Tier actual? Tus tokens restantes se conservarán en tu billetera.')) return;
    setSubLoading(true);
    setSubMsg({ text: '', type: '' });
    try {
      const res = await axios.post(
        'http://localhost:3002/api/users/subscription/cancel',
        {},
        authHeaders
      );
      setSubMsg({ text: res.data.message, type: 'success' });
      if (res.data.token) localStorage.setItem('token', res.data.token);
      if (res.data.user) {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        window.dispatchEvent(new Event('user-updated'));
      }
      fetchSubscriptionData();
    } catch (err) {
      setSubMsg({ text: err.response?.data?.error || 'Error al cancelar Tier', type: 'error' });
    } finally {
      setSubLoading(false);
    }
  };

  // --- Panel Administrador: Gestión de Usuarios, Tiers, Tokens y Roles (:3002) ---
  const fetchAdminData = async () => {
    if (!token || user?.role !== 'admin') return;
    setAdminLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get('http://localhost:3002/api/users/admin/users', authHeaders),
        axios.get('http://localhost:3002/api/users/admin/stats', authHeaders)
      ]);
      setAdminUsers(usersRes.data || []);
      setAdminStats(statsRes.data || null);
    } catch (err) {
      console.error('Error cargando datos de administrador:', err);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminUpdateSubscription = async (targetUserId, newPlanId) => {
    setAdminMsg({ text: '', type: '' });
    try {
      const res = await axios.put(
        `http://localhost:3002/api/users/admin/users/${targetUserId}/subscription`,
        { plan_id: newPlanId },
        authHeaders
      );
      setAdminMsg({ text: res.data.message, type: 'success' });
      fetchAdminData();
      if (targetUserId === user?.id) {
        fetchUserProfile();
      }
    } catch (err) {
      setAdminMsg({ text: err.response?.data?.error || 'Error al actualizar Tier', type: 'error' });
    }
  };

  const handleAdminAddTokens = async (targetUserId, amount) => {
    setAdminMsg({ text: '', type: '' });
    try {
      const res = await axios.post(
        `http://localhost:3002/api/users/admin/users/${targetUserId}/tokens`,
        {
          amount: Number(amount),
          reason: `Asignación manual desde Panel Admin (${amount >= 0 ? '+' : ''}${amount} Tokens)`,
        },
        authHeaders
      );
      setAdminMsg({ text: res.data.message, type: 'success' });
      fetchAdminData();
      if (targetUserId === user?.id) {
        fetchUserProfile();
        fetchSubscriptionData();
      }
    } catch (err) {
      setAdminMsg({ text: err.response?.data?.error || 'Error al ajustar Tokens del usuario', type: 'error' });
    }
  };

  const handleAdminUpdateRole = async (targetUserId, newRole) => {
    setAdminMsg({ text: '', type: '' });
    try {
      const res = await axios.put(
        `http://localhost:3002/api/users/admin/users/${targetUserId}/role`,
        { role: newRole },
        authHeaders
      );
      setAdminMsg({ text: res.data.message, type: 'success' });
      fetchAdminData();
      if (targetUserId === user?.id) {
        fetchUserProfile();
      }
    } catch (err) {
      setAdminMsg({ text: err.response?.data?.error || 'Error al actualizar rol', type: 'error' });
    }
  };

  return (
    <div style={{ maxWidth: '1060px', margin: '1.5rem auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Centro de Cuenta, Pedidos y Administración</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', margin: '0.25rem 0 0 0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            Usuario activo: <strong>{user?.email || `Sesión Invitado (${currentUserId})`}</strong>
            {user && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 7px',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: user.role === 'admin' ? '#0a0a0a' : '#f5f5f5',
                  color: user.role === 'admin' ? '#ffffff' : '#525252',
                  border: '1px solid #e5e5e5',
                }}
              >
                {user.role === 'admin' ? 'Administrador del Sistema' : 'Usuario de la Plataforma'}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('subscriptions')}
            style={{
              backgroundColor: '#0a0a0a',
              color: '#fff',
              fontSize: '12.5px',
              padding: '0.45rem 0.9rem',
            }}
          >
            Licencia del Sistema (Tiers y Tokens)
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              style={{
                backgroundColor: '#ffffff',
                color: '#0a0a0a',
                border: '1px solid #d4d4d4',
                fontSize: '12.5px',
                padding: '0.45rem 0.9rem',
              }}
            >
              Panel Admin
            </button>
          )}
        </div>
      </div>

      {/* Tabs Minimalistas */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', paddingBottom: '0.5rem' }}>
        {[
          { id: 'orders', label: `Pedidos y Envíos (${orders.length})`, show: true },
          { id: 'subscriptions', label: 'Licencia del Sistema (Tiers y Tokens)', show: true },
          { id: 'admin', label: `Usuarios y Admins (${adminUsers.length > 0 ? adminUsers.length : 'Control'})`, show: user?.role === 'admin' },
          { id: 'wishlists', label: `Wishlists (${wishlists.length})`, show: true },
          { id: 'notifications', label: `Notificaciones (${notifications.length})`, show: true },
          { id: 'hotel-soa', label: `Hotel Paraíso SOA (${hotelNotifications.length})`, show: true },
          { id: 'personal', label: 'Datos Personales', show: Boolean(token) },
          { id: 'addresses', label: `Direcciones (${addresses.length})`, show: Boolean(token) },
          { id: 'payments', label: `Métodos de Pago (${paymentMethods.length})`, show: Boolean(token) },
        ]
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                backgroundColor: activeTab === t.id ? '#0a0a0a' : 'transparent',
                color: activeTab === t.id ? '#ffffff' : '#525252',
                border: activeTab === t.id ? '1px solid #0a0a0a' : '1px solid transparent',
                borderRadius: '4px',
                padding: '0.45rem 0.85rem',
                fontSize: '12.5px',
                fontWeight: activeTab === t.id ? '600' : '500',
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* Tab: Licenciamiento Comercial del Sistema por Tiers y Tokens */}
      {activeTab === 'subscriptions' && <SystemLicense />}

      {/* Tab: Panel de Control Administrativo */}
      {activeTab === 'admin' && (
        <div style={{ marginBottom: '3rem' }}>
          {user?.role !== 'admin' ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', border: '1px solid #fecaca' }}>
              <h3 style={{ color: '#991b1b' }}>Acceso Denegado</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Esta sección está reservada exclusivamente para cuentas con rol de Administrador del Sistema.
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Gestión de Cuentas de Usuario y Administradores</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                    El número máximo de Usuarios y Administradores permitidos depende del Tier de Licencia del Sistema activo.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setActiveTab('subscriptions')}
                    style={{ fontSize: '12.5px', padding: '0.45rem 0.85rem', backgroundColor: '#0a0a0a', color: '#fff' }}
                  >
                    Ampliar Licencia / Comprar Tokens
                  </button>
                  <button
                    onClick={fetchAdminData}
                    disabled={adminLoading}
                    style={{ fontSize: '12.5px', padding: '0.45rem 0.85rem', backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4' }}
                  >
                    {adminLoading ? 'Actualizando...' : 'Refrescar'}
                  </button>
                </div>
              </div>

              {adminMsg.text && (
                <div
                  style={{
                    padding: '0.8rem 1.1rem',
                    borderRadius: '6px',
                    marginBottom: '1.5rem',
                    backgroundColor: adminMsg.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    color: adminMsg.type === 'error' ? '#991b1b' : '#166534',
                    border: `1px solid ${adminMsg.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    fontWeight: '500',
                  }}
                >
                  {adminMsg.text}
                </div>
              )}

              {adminStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Usuarios en Plataforma</p>
                    <h2 style={{ margin: '0.4rem 0 0 0', fontSize: '1.85rem' }}>{adminStats.total_users}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Registrados en PostgreSQL</span>
                  </div>
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cuentas Administrador</p>
                    <h2 style={{ margin: '0.4rem 0 0 0', fontSize: '1.85rem' }}>{adminStats.admin_users}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sujeto al límite del Tier del Sistema</span>
                  </div>
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clientes Activos</p>
                    <h2 style={{ margin: '0.4rem 0 0 0', fontSize: '1.85rem' }}>{adminStats.client_users}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Compradores de la tienda</span>
                  </div>
                </div>
              )}

              {/* Filtro y Buscador de Usuarios */}
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Buscar usuario o administrador por correo o nombre..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
              </div>

              {/* Tabla de Usuarios y Administradores */}
              <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead style={{ backgroundColor: '#fafafa', borderBottom: '1px solid var(--border-color)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    <tr>
                      <th style={{ padding: '0.75rem 1rem' }}>Nombre Completo</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Correo Electrónico</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Rol en el Sistema</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Fecha de Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers
                      .filter((u) => {
                        const q = adminSearch.toLowerCase();
                        return (
                          u.email.toLowerCase().includes(q) ||
                          u.full_name.toLowerCase().includes(q) ||
                          u.role.toLowerCase().includes(q)
                        );
                      })
                      .map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                            {u.full_name}
                            {u.id === user?.id && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>(Tú)</span>}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#525252' }}>{u.email}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <select
                              value={u.role}
                              onChange={(e) => handleAdminUpdateRole(u.id, e.target.value)}
                              style={{
                                width: 'auto',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '500',
                                backgroundColor: u.role === 'admin' ? '#0a0a0a' : '#fafafa',
                                color: u.role === 'admin' ? '#ffffff' : '#0a0a0a',
                                border: '1px solid #d4d4d4',
                              }}
                            >
                              <option value="cliente" style={{ backgroundColor: '#fff', color: '#0a0a0a' }}>Usuario / Cliente</option>
                              <option value="admin" style={{ backgroundColor: '#fff', color: '#0a0a0a' }}>Administrador del Sistema</option>
                            </select>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                            {new Date(u.created_at).toLocaleDateString('es-MX')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Historial de Pedidos, Recibos Electrónicos y Rastreo Logístico (:8084 & :8085) */}
      {activeTab === 'orders' && (
        <div>
          {/* Modal / Panel de Recibo Electrónico */}
          {selectedReceipt && (
            <div className="card" style={{ marginBottom: '2rem', border: '1px solid #0a0a0a', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Comprobante Fiscal / Recibo Electrónico #{selectedReceipt.receipt_number}</h3>
                <button onClick={() => setSelectedReceipt(null)} style={{ backgroundColor: '#fff', color: '#111', border: '1px solid #d4d4d4', padding: '0.3rem 0.7rem' }}>Cerrar</button>
              </div>
              <div style={{ marginTop: '1rem', fontSize: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><strong>Orden:</strong> {selectedReceipt.details?.order_number}</div>
                <div><strong>Fecha Emisión:</strong> {new Date(selectedReceipt.issued_at).toLocaleString('es-MX')}</div>
                <div><strong>Pasarela:</strong> {selectedReceipt.details?.payment_gateway} ({selectedReceipt.details?.transaction_ref})</div>
                <div><strong>Total Facturado:</strong> ${selectedReceipt.details?.total?.toLocaleString('es-MX')} (IVA: ${selectedReceipt.details?.iva_16?.toLocaleString('es-MX')})</div>
                <div style={{ gridColumn: 'span 2' }}><strong>Dirección de Envío:</strong> {selectedReceipt.details?.shipping_address}</div>
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Sello Digital SHA-256 del Comprobante:</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#fff', border: '1px solid #e5e5e5', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                    {selectedReceipt.crypto_hash}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal / Panel de Rastreo y Simulación Logística (:8085) */}
          {selectedShipment && (
            <div className="card" style={{ marginBottom: '2rem', border: '1px solid #0a0a0a', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  Rastreo en Vivo — {selectedShipment.carrier} ({selectedShipment.tracking_number})
                </h3>
                <button onClick={() => setSelectedShipment(null)} style={{ backgroundColor: '#fff', color: '#111', border: '1px solid #d4d4d4', padding: '0.3rem 0.7rem' }}>Cerrar</button>
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

          {/* Modal / Panel de Facturación Electrónica CFDI 4.0 con Profact (:8087) */}
          {facturaModalOrder && (
            <div className="card" style={{ marginBottom: '2rem', border: '1px solid #0a0a0a', backgroundColor: '#fafafa', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>
                  Facturación Electrónica CFDI 4.0 — Profact (Orden #{facturaModalOrder.order_number})
                </h3>
                <button
                  onClick={() => { setFacturaModalOrder(null); setFacturaResult(null); }}
                  style={{ backgroundColor: '#fff', color: '#111', border: '1px solid #d4d4d4', padding: '0.3rem 0.7rem' }}
                >
                  Cerrar
                </button>
              </div>

              {facturaLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Conectando con el PAC Profact (TimbraCFDI)...
                </div>
              ) : facturaResult ? (
                <div style={{ marginTop: '1rem', backgroundColor: '#fff', padding: '1.25rem', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span className="badge success" style={{ margin: 0 }}>
                        {facturaResult.modo === 'SIMULACION' ? 'TIMBRADO EXITOSO (SIMULACIÓN PROFACT)' : 'TIMBRADO OFICIAL SAT'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      Fecha Timbrado: {new Date(facturaResult.fecha_timbrado).toLocaleString('es-MX')}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '14px' }}>
                    <div>
                      <strong>Folio Fiscal (UUID SAT):</strong>
                      <div style={{ fontFamily: 'monospace', color: '#0a0a0a', fontWeight: 'bold', fontSize: '13px' }}>
                        {facturaResult.uuid}
                      </div>
                    </div>
                    <div>
                      <strong>Emisor (PAC Profact):</strong>
                      <div>{facturaResult.nombre_emisor} ({facturaResult.rfc_emisor})</div>
                    </div>
                    <div>
                      <strong>Receptor:</strong>
                      <div>{facturaResult.nombre_receptor} ({facturaResult.rfc_receptor})</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>CP: {facturaResult.cp_receptor} | Régimen: {facturaResult.regimen_fiscal_receptor} | Uso: {facturaResult.uso_cfdi}</div>
                    </div>
                    <div>
                      <strong>Importes Fiscales:</strong>
                      <div>Subtotal: ${facturaResult.subtotal?.toLocaleString('es-MX')}</div>
                      <div>IVA (16%): ${facturaResult.iva?.toLocaleString('es-MX')}</div>
                      <div style={{ fontWeight: 'bold', color: '#0a0a0a' }}>Total: ${facturaResult.total?.toLocaleString('es-MX')} {facturaResult.moneda}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <a
                      href={`http://localhost:8087/api/billing/invoices/${facturaResult.uuid}/xml`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <button style={{ backgroundColor: '#0a0a0a', color: '#fff', fontSize: '12.5px' }}>
                        Descargar XML Timbrado Oficial
                      </button>
                    </a>
                    <a
                      href={`http://localhost:8087/api/billing/invoices/${facturaResult.uuid}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <button style={{ backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4', fontSize: '12.5px' }}>
                        Ver Representación Impresa (HTML / PDF)
                      </button>
                    </a>
                    {facturaResult.qr_code_url && (
                      <a
                        href={facturaResult.qr_code_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <button style={{ backgroundColor: '#ffffff', color: '#525252', border: '1px solid #d4d4d4', fontSize: '12.5px' }}>
                          Validar en Portal SAT
                        </button>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleEmitirFactura} style={{ marginTop: '1rem' }}>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: 0 }}>
                    Ingresa los datos fiscales del cliente para generar y timbrar el <strong>CFDI 4.0</strong> mediante el método <code>TimbraCFDI</code> de Profact.
                  </p>

                  {facturaError && (
                    <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '13.5px', border: '1px solid #fecaca' }}>
                      {facturaError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>RFC del Receptor:</label>
                      <input
                        type="text"
                        value={facturaFormData.rfc_receptor}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, rfc_receptor: e.target.value.toUpperCase() })}
                        placeholder="XAXX010101000"
                        required
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Nombre o Razón Social:</label>
                      <input
                        type="text"
                        value={facturaFormData.nombre_receptor}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, nombre_receptor: e.target.value.toUpperCase() })}
                        placeholder="PUBLICO EN GENERAL"
                        required
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Código Postal Fiscal:</label>
                      <input
                        type="text"
                        value={facturaFormData.cp_receptor}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, cp_receptor: e.target.value })}
                        placeholder="01000"
                        required
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Régimen Fiscal (SAT):</label>
                      <select
                        value={facturaFormData.regimen_fiscal_receptor}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, regimen_fiscal_receptor: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                      >
                        <option value="616">616 - Sin obligaciones fiscales</option>
                        <option value="605">605 - Sueldos y Salarios</option>
                        <option value="612">612 - Personas Físicas con Actividades Empresariales</option>
                        <option value="601">601 - General de Ley Personas Morales</option>
                        <option value="626">626 - Régimen Simplificado de Confianza (RESICO)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Uso de CFDI:</label>
                      <select
                        value={facturaFormData.uso_cfdi}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, uso_cfdi: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                      >
                        <option value="S01">S01 - Sin efectos fiscales</option>
                        <option value="G03">G03 - Gastos en general</option>
                        <option value="G01">G01 - Adquisición de mercancías</option>
                        <option value="CP01">CP01 - Pagos</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Forma de Pago:</label>
                      <select
                        value={facturaFormData.forma_pago}
                        onChange={(e) => setFacturaFormData({ ...facturaFormData, forma_pago: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                      >
                        <option value="04">04 - Tarjeta de crédito</option>
                        <option value="28">28 - Tarjeta de débito</option>
                        <option value="03">03 - Transferencia electrónica</option>
                        <option value="01">01 - Efectivo</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setFacturaModalOrder(null)}
                      style={{ backgroundColor: '#e5e7eb', color: '#374151', padding: '0.5rem 1rem' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={facturaLoading}
                      style={{ backgroundColor: '#0a0a0a', color: '#fff', fontWeight: '600', padding: '0.5rem 1.25rem' }}
                    >
                      {facturaLoading ? 'Timbrando con Profact...' : 'Emitir y Timbrar Factura (Profact)'}
                    </button>
                  </div>
                </form>
              )}
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

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleViewReceipt(ord.id)}
                        style={{ backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4', fontSize: '12.5px', padding: '0.45rem 0.85rem' }}
                      >
                        Recibo Electrónico
                      </button>
                      <button
                        onClick={() => handleTrackOrderShipment(ord.id)}
                        style={{ backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4', fontSize: '12.5px', padding: '0.45rem 0.85rem' }}
                      >
                        Rastrear Envío
                      </button>
                      <button
                        onClick={() => handleOpenFacturaModal(ord)}
                        style={{ backgroundColor: '#0a0a0a', color: '#ffffff', fontSize: '12.5px', padding: '0.45rem 0.85rem' }}
                      >
                        Facturar CFDI 4.0
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
            <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #0a0a0a', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>
                  Vista Pública Compartida: "{sharedPreview.name}" (Token: {sharedPreview.share_token})
                </h4>
                <button onClick={() => setSharedPreview(null)} style={{ backgroundColor: '#fff', color: '#111', border: '1px solid #d4d4d4', padding: '0.25rem 0.6rem' }}>Cerrar</button>
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
                  <h4 style={{ margin: 0 }}>{w.name}</h4>
                  <span className="badge success" style={{ margin: 0 }}>Pública ({w.share_token})</span>
                </div>

                {w.items && w.items.length > 0 ? (
                  <div style={{ margin: '0.75rem 0', fontSize: '14px' }}>
                    {w.items.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <Link to={`/product/${item.product_id}`} style={{ color: '#0a0a0a', fontWeight: '500' }}>
                          {item.notes || `Producto #${item.product_id}`}
                        </Link>
                        <button
                          onClick={() => handleRemoveWishlistItem(w.id, item.product_id)}
                          style={{ backgroundColor: '#ffffff', color: '#525252', border: '1px solid #e5e5e5', padding: '0.2rem 0.5rem', fontSize: '11px' }}
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
                  style={{ marginTop: 'auto', backgroundColor: '#fafafa', color: '#0a0a0a', border: '1px solid #d4d4d4', fontSize: '12.5px' }}
                >
                  Probar Enlace Compartible ({w.share_token})
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
                  <strong style={{ color: '#0a0a0a' }}>{n.subject}</strong>
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

      {/* Tab 4: Integración SOA Hotel Paraíso (Salvador - Microservicios Usuarios y Notificaciones en GraphQL) */}
      {activeTab === 'hotel-soa' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {/* Panel de Configuración del Puente GraphQL de Salvador */}
          <div className="card" style={{ border: '1px solid var(--border-color)', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  Puente SOA: Consumiendo 2 Microservicios de Hotel Paraíso (Salvador)
                </h3>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <strong>Microservicio 1:</strong> Usuarios (<code>iniciarSesion</code> / <code>registrarUsuario</code>) &nbsp;|&nbsp;
                  <strong>Microservicio 2:</strong> Notificaciones (<code>misNotificaciones</code> / <code>limpiarNotificaciones</code>)
                </p>
              </div>
              <span
                className="badge"
                style={{
                  backgroundColor: hotelConfig.online ? '#0a0a0a' : '#f5f5f5',
                  color: hotelConfig.online ? '#fff' : '#525252',
                  margin: 0,
                }}
              >
                {hotelConfig.online ? 'CONECTADO EN VIVO (GRAPHQL)' : 'MODO RESILIENTE SOA'}
              </span>
            </div>

            <form onSubmit={handleSaveHotelUrl} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={hotelUrlInput}
                onChange={(e) => setHotelUrlInput(e.target.value)}
                placeholder="Ej. http://localhost:8000 o https://xxxx.ngrok-free.app"
                style={{ flex: 1, minWidth: '260px', backgroundColor: '#fff' }}
              />
              <button type="submit">
                Actualizar URL de Salvador
              </button>
              <button
                type="button"
                onClick={fetchPartnerHotelData}
                style={{ backgroundColor: '#fff', color: '#0a0a0a', border: '1px solid #d4d4d4' }}
              >
                Sincronizar Ahora
              </button>
            </form>
            {hotelMsg && (
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '13px', color: '#15803d', fontWeight: '500' }}>
                {hotelMsg}
              </p>
            )}
          </div>

          {/* Microservicio 1: Estado de Identidad SSO en Hotel Paraíso */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0 }}>
                  Microservicio 1 Consumido: Usuarios (Autenticación SSO GraphQL)
                </h4>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Huésped activo en Hotel Paraíso:{' '}
                  <strong>{hotelUser ? `${hotelUser.nombre} (${hotelUser.correo}) — Rol: ${hotelUser.rol}` : 'Juan Pérez (juan@cliente.com) — Sesión vinculada'}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleQuickHotelSSO('juan@cliente.com')}
                  style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#fafafa', color: '#0a0a0a', border: '1px solid #d4d4d4' }}
                >
                  Cambiar a Juan Pérez
                </button>
                <button
                  onClick={() => handleQuickHotelSSO('maria@cliente.com')}
                  style={{ fontSize: '12px', padding: '0.4rem 0.75rem', backgroundColor: '#fafafa', color: '#0a0a0a', border: '1px solid #d4d4d4' }}
                >
                  Cambiar a María López
                </button>
              </div>
            </div>
          </div>

          {/* Microservicio 2: Bandeja de Notificaciones del Hotel Paraíso */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0 }}>
                  Microservicio 2 Consumido: Bandeja de Notificaciones de Hotel Paraíso ({hotelNotifications.length})
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Origen de datos: <code>{hotelSource || 'PUENTE_SOA_GRAPHQL'}</code>
                </span>
              </div>
              {hotelNotifications.length > 0 && (
                <button
                  onClick={handleClearHotelNotifications}
                  style={{ backgroundColor: '#ffffff', color: '#991b1b', border: '1px solid #fecaca', fontSize: '12px', padding: '0.4rem 0.8rem' }}
                >
                  Limpiar Bandeja en Hotel
                </button>
              )}
            </div>

            {hotelNotifications.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {hotelNotifications.map((hn) => (
                  <div key={hn.id} style={{ padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <strong style={{ color: '#0a0a0a' }}>
                        [{hn.canal === 'SMS' ? 'SMS' : 'EMAIL'}] {hn.asunto}
                      </strong>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <span className="badge" style={{ margin: 0 }}>
                          Evento: {hn.eventoOrigen}
                        </span>
                        <span className="badge success" style={{ margin: 0 }}>
                          {hn.estado}
                        </span>
                      </div>
                    </div>
                    <p style={{ margin: '0.35rem 0', fontSize: '14px', color: '#404040' }}>{hn.mensaje}</p>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Destinatario: {hn.destinatario}</span>
                      <span>Fecha: {hn.fechaEnvio}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '1.5rem 0' }}>
                No hay notificaciones en la bandeja del Hotel Paraíso para este usuario.
              </p>
            )}
          </div>

          {/* Vista adicional de Reservaciones Asociadas del Huésped en Hotel Paraíso */}
          {hotelReservations.length > 0 && (
            <div className="card">
              <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                Reservaciones Activas del Huésped en Hotel Paraíso ({hotelReservations.length})
              </h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {hotelReservations.map((hr) => (
                  <div key={hr.id} style={{ padding: '0.9rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong>Folio #{hr.folio}</strong> — {hr.recurso?.nombre || 'Habitación Hotel Paraíso'}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Llegada: {hr.fechaInicio} | Salida: {hr.fechaFin} | Huéspedes: {hr.personas}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="badge success" style={{ margin: 0 }}>{hr.estado}</span>
                      <div style={{ fontWeight: '700', marginTop: '0.25rem' }}>
                        ${Number(hr.total || 0).toLocaleString('es-MX')} MXN
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                  <span style={{ fontWeight: '600', fontSize: '1.05rem' }}>{pm.card_brand}</span>
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


import { useState, useEffect } from 'react';
import axios from 'axios';

const FALLBACK_DATA = {
  license: {
    company_name: 'Monolito Commerce Enterprise S.A. de C.V.',
    active_tier_id: 'tier_1',
    tier_level: 1,
    system_token_balance: 350,
    total_tokens_purchased: 350,
    total_tokens_consumed: 0,
    extra_users_capacity: 0,
    extra_admins_capacity: 0,
    extra_products_capacity: 0,
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  },
  quotas: {
    current_users: 10,
    base_max_users: 100,
    extra_users_capacity: 0,
    effective_max_users: 100,
    current_admins: 1,
    base_max_admins: 1,
    extra_admins_capacity: 0,
    effective_max_admins: 1,
    base_max_products: 50,
    extra_products_capacity: 0,
    effective_max_products: 50,
  },
  tiers: [
    {
      id: 'tier_1',
      tier_level: 1,
      name: 'Tier 1 — Starter',
      tagline: 'Licencia inicial para operar la plataforma',
      token_cost: 200,
      price_mxn: 990,
      max_users: 100,
      max_admins: 1,
      max_products: 50,
      includes_shipping: false,
      includes_interactions: false,
      includes_cfdi: false,
      includes_soa_bridge: false,
      support_level: 'Soporte estándar (Email 48h)',
      description:
        'Incluye los 5 microservicios Core (Usuarios, Catálogo, Inventario, Carrito y Órdenes), hasta 100 usuarios registrados y 1 cuenta de Administrador.',
      features: [
        'Paquete de Usuarios: Hasta 100 usuarios registrados',
        'Paquete de Administradores: 1 cuenta de Administrador',
        'Capacidad de Catálogo: Hasta 50 Productos / SKUs',
        '5 Microservicios Core (Auth, Catálogo, Inventario, Carrito, Órdenes)',
        'Firma criptográfica HMAC-SHA256 en recibos',
        'Soporte técnico estándar por correo (48h)',
      ],
    },
    {
      id: 'tier_2',
      tier_level: 2,
      name: 'Tier 2 — Business Pro',
      tagline: 'Logística multi-paquetería y fidelización',
      token_cost: 500,
      price_mxn: 2290,
      max_users: 1000,
      max_admins: 5,
      max_products: 500,
      includes_shipping: true,
      includes_interactions: true,
      includes_cfdi: false,
      includes_soa_bridge: false,
      support_level: 'Soporte prioritario (12h)',
      description:
        'Amplía la capacidad hasta 1,000 usuarios y 5 Administradores. Habilita los microservicios de Logística (:8085) e Interacciones/Notificaciones (:8086).',
      features: [
        'Paquete de Usuarios: Hasta 1,000 usuarios registrados',
        'Paquete de Administradores: Hasta 5 cuentas de Administrador',
        'Capacidad de Catálogo: Hasta 500 Productos / SKUs',
        '7 Microservicios (+ Logística :8085 e Interacciones :8086)',
        'Sistema de Reseñas Verificadas, Wishlists y Notificaciones',
        'Soporte técnico prioritario (12h)',
      ],
    },
    {
      id: 'tier_3',
      tier_level: 3,
      name: 'Tier 3 — Enterprise SOA',
      tagline: 'Capacidad ilimitada, CFDI 4.0 y Puente SOA',
      token_cost: 1000,
      price_mxn: 4490,
      max_users: -1,
      max_admins: -1,
      max_products: -1,
      includes_shipping: true,
      includes_interactions: true,
      includes_cfdi: true,
      includes_soa_bridge: true,
      support_level: 'SLA 99.9% + Soporte 24/7',
      description:
        'Licencia corporativa sin límites de Usuarios, Administradores ni Productos. Incluye Facturación CFDI 4.0 con Profact (:8087) y Puente SOA GraphQL (:8080).',
      features: [
        'Paquete de Usuarios: Usuarios y clientes ilimitados',
        'Paquete de Administradores: Administradores ilimitados',
        'Capacidad de Catálogo: Productos y SKUs ilimitados',
        'Todos los Microservicios + Facturación CFDI 4.0 Profact (:8087)',
        'API Gateway + Puente Adaptador SOA GraphQL (:8080)',
        'SLA Empresarial 99.9% y soporte dedicado 24/7',
      ],
    },
  ],
  token_packages: [
    {
      id: 'sys_pack_200',
      name: 'Paquete Starter',
      tokens: 200,
      bonus_tokens: 0,
      total_tokens: 200,
      price_mxn: 990,
      badge: 'TIER 1',
      description: '200 Tokens del Sistema. Cubre 1 mes de licencia Tier 1.',
    },
    {
      id: 'sys_pack_600',
      name: 'Paquete Business Pro',
      tokens: 500,
      bonus_tokens: 100,
      total_tokens: 600,
      price_mxn: 2290,
      badge: '+100 BONUS',
      description: '500 Tokens + 100 Tokens de bonificación. Cubre Tier 2 y saldo operativo.',
    },
    {
      id: 'sys_pack_1300',
      name: 'Paquete Enterprise',
      tokens: 1000,
      bonus_tokens: 300,
      total_tokens: 1300,
      price_mxn: 4490,
      badge: '+300 BONUS',
      description: '1,000 Tokens + 300 Tokens de bonificación. Cubre Tier 3 y timbrados CFDI.',
    },
    {
      id: 'sys_pack_3500',
      name: 'Paquete Corporativo',
      tokens: 2500,
      bonus_tokens: 1000,
      total_tokens: 3500,
      price_mxn: 9990,
      badge: '+1,000 BONUS',
      description: '2,500 Tokens + 1,000 Tokens de bonificación para operación multi-mes.',
    },
  ],
  addons: [
    {
      id: 'extra_admin',
      name: '+1 Cuenta de Administrador',
      token_cost: 80,
      description: 'Amplía permanentemente el límite de Administradores del sistema en +1 plaza.',
    },
    {
      id: 'extra_users',
      name: '+250 Usuarios Registrados',
      token_cost: 60,
      description: 'Amplía la capacidad de clientes/usuarios registrados en la plataforma en +250 cuentas.',
    },
    {
      id: 'extra_products',
      name: '+100 Productos en Catálogo',
      token_cost: 40,
      description: 'Amplía el límite de SKUs y productos activos permitidos en el catálogo.',
    },
  ],
  operation_rates: [
    { operation: 'order_checkout', name: 'Procesamiento de Orden + Recibo HMAC (:8084)', token_cost: 2 },
    { operation: 'cfdi_invoice', name: 'Timbrado Factura Electrónica CFDI 4.0 Profact (:8087)', token_cost: 5 },
    { operation: 'shipping_label', name: 'Generación de Guía Logística DHL/FedEx (:8085)', token_cost: 2 },
    { operation: 'soa_sync', name: 'Transacción Puente Adaptador SOA GraphQL (:8080)', token_cost: 1 },
  ],
  logs: [],
};

// Elimina cualquier emoji proveniente de respuestas del backend
const stripEmojis = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function SystemLicense() {
  const [data, setData] = useState(FALLBACK_DATA);
  const [companyName, setCompanyName] = useState(FALLBACK_DATA.license.company_name);
  const [catalogProductCount, setCatalogProductCount] = useState(12);
  const [customTokens, setCustomTokens] = useState(400);
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [cardNumber, setCardNumber] = useState('4532 8910 4421 4242');
  const [cardHolder, setCardHolder] = useState('MONOLITO COMMERCE SA DE CV');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('884');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ text: '', type: '' });

  const [checkoutModal, setCheckoutModal] = useState(null);
  const [purchaseReceipt, setPurchaseReceipt] = useState(null);

  const fetchSystemLicense = async () => {
    try {
      const res = await axios.get('http://localhost:3002/api/users/system/license');
      if (res.data && res.data.license) {
        setData(res.data);
        setCompanyName(res.data.license.company_name);
      }
    } catch (err) {
      console.error('Usando vista local de licencia del sistema:', err);
    }

    try {
      const prodRes = await axios.get('http://localhost:8081/api/catalog/products');
      if (Array.isArray(prodRes.data)) {
        setCatalogProductCount(prodRes.data.length);
      } else if (Array.isArray(prodRes.data?.products)) {
        setCatalogProductCount(prodRes.data.products.length);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchSystemLicense();
  }, []);

  const handleActivateTier = async (tier) => {
    const currentTokens = data.license?.system_token_balance || 0;
    if (currentTokens < tier.token_cost) {
      const missing = tier.token_cost - currentTokens;
      const suggestedPack =
        data.token_packages.find((p) => p.tokens + (p.bonus_tokens || 0) >= missing) || data.token_packages[1];

      setCheckoutModal({
        mode: 'package',
        packageObj: suggestedPack,
        autoActivateTier: tier,
        reason: `Saldo insuficiente. Faltan ${missing} Tokens para activar ${stripEmojis(tier.name)} (${tier.token_cost} Tokens). Al completar la compra se acreditarán los tokens y se activará el Tier automáticamente.`,
      });
      return;
    }

    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const res = await axios.post('http://localhost:3002/api/users/system/activate-tier', {
        tier_id: tier.id,
        company_name: companyName,
      });
      setFeedback({ text: stripEmojis(res.data.message), type: 'success' });
      await fetchSystemLicense();
      window.dispatchEvent(new Event('system-license-updated'));
    } catch (err) {
      setFeedback({
        text: stripEmojis(err.response?.data?.error || 'Error al activar el Tier del Sistema'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const openTokenPurchaseModal = ({ packageObj = null, customAmount = 0, autoActivateTier = null }) => {
    if (packageObj) {
      setCheckoutModal({
        mode: 'package',
        packageObj,
        autoActivateTier,
        reason: null,
      });
    } else {
      const amt = Math.max(50, Number(customAmount) || 100);
      const bonus = amt >= 1000 ? Math.floor(amt * 0.25) : amt >= 400 ? Math.floor(amt * 0.15) : 0;
      setCheckoutModal({
        mode: 'custom',
        customTokens: amt,
        bonusTokens: bonus,
        totalTokens: amt + bonus,
        priceMXN: amt * 4.5,
        autoActivateTier,
        reason: null,
      });
    }
  };

  const handleConfirmModalPurchase = async (e) => {
    if (e) e.preventDefault();
    if (!checkoutModal) return;

    setLoading(true);
    setFeedback({ text: '', type: '' });

    const last4 = cardNumber.replace(/\D/g, '').slice(-4) || '4242';
    const paymentLabel =
      paymentMethod === 'CARD'
        ? `Tarjeta Corporativa •••• ${last4} (${cardHolder})`
        : paymentMethod === 'SPEI'
        ? 'Transferencia SPEI Empresarial'
        : 'PayPal Business Express';

    try {
      const payload =
        checkoutModal.mode === 'package'
          ? { package_id: checkoutModal.packageObj.id, payment_method: paymentLabel }
          : { custom_tokens: Number(checkoutModal.customTokens), payment_method: paymentLabel };

      const res = await axios.post('http://localhost:3002/api/users/system/tokens/purchase', payload);

      let tierActivatedMsg = '';
      if (checkoutModal.autoActivateTier) {
        try {
          const tierRes = await axios.post('http://localhost:3002/api/users/system/activate-tier', {
            tier_id: checkoutModal.autoActivateTier.id,
            company_name: companyName,
          });
          tierActivatedMsg = ` — ${stripEmojis(tierRes.data.message)}`;
        } catch (_) {}
      }

      setPurchaseReceipt({
        folio: `TOK-${Date.now().toString().slice(-6)}`,
        date: new Date().toLocaleString('es-MX'),
        company: companyName,
        paymentMethod: paymentLabel,
        tokensAdded: res.data.tokens_added,
        baseTokens: res.data.base_tokens,
        bonusTokens: res.data.bonus_tokens,
        pricePaidMXN: res.data.price_paid_mxn,
        newBalance: res.data.system_token_balance,
      });

      setCheckoutModal(null);
      setFeedback({
        text: `${stripEmojis(res.data.message)}${tierActivatedMsg}`,
        type: 'success',
      });
      await fetchSystemLicense();
      window.dispatchEvent(new Event('system-license-updated'));
    } catch (err) {
      setFeedback({
        text: stripEmojis(err.response?.data?.error || 'Error al procesar la compra de Tokens del Sistema'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPurchaseTokens = async ({ packageId = '', customAmount = 0 }) => {
    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const res = await axios.post('http://localhost:3002/api/users/system/tokens/purchase', {
        package_id: packageId,
        custom_tokens: Number(customAmount) || 0,
        payment_method: 'Compra Directa (Tarjeta Corporativa •••• 4242)',
      });
      setFeedback({
        text: `${stripEmojis(res.data.message)} (Saldo actual: ${res.data.system_token_balance} Tokens)`,
        type: 'success',
      });
      await fetchSystemLicense();
      window.dispatchEvent(new Event('system-license-updated'));
    } catch (err) {
      setFeedback({
        text: stripEmojis(err.response?.data?.error || 'Error al comprar Tokens del Sistema'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyAddon = async (addon) => {
    const currentTokens = data.license?.system_token_balance || 0;
    if (currentTokens < addon.token_cost) {
      openTokenPurchaseModal({
        packageObj: data.token_packages[0],
      });
      setFeedback({
        text: `Saldo insuficiente. Se requieren ${addon.token_cost} Tokens para "${stripEmojis(addon.name)}".`,
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const res = await axios.post('http://localhost:3002/api/users/system/tokens/addon', {
        addon_id: addon.id,
      });
      setFeedback({ text: stripEmojis(res.data.message), type: 'success' });
      await fetchSystemLicense();
      window.dispatchEvent(new Event('system-license-updated'));
    } catch (err) {
      setFeedback({
        text: stripEmojis(err.response?.data?.error || 'Error al ampliar capacidad con Tokens'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateOperation = async (op) => {
    setLoading(true);
    setFeedback({ text: '', type: '' });
    try {
      const res = await axios.post('http://localhost:3002/api/users/system/tokens/consume', {
        operation: op.operation,
        details: `Operación registrada (${companyName})`,
      });
      setFeedback({ text: stripEmojis(res.data.message), type: 'success' });
      await fetchSystemLicense();
      window.dispatchEvent(new Event('system-license-updated'));
    } catch (err) {
      setFeedback({
        text: stripEmojis(err.response?.data?.error || 'Error al consumir tokens operativos'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const { license, quotas, tiers, token_packages, addons, operation_rates, logs } = data;
  const activeTier = tiers.find((t) => t.id === license.active_tier_id) || tiers[0];

  const calcBonusForCustom = (amt) => {
    const n = Number(amt) || 0;
    if (n >= 1000) return Math.floor(n * 0.25);
    if (n >= 400) return Math.floor(n * 0.15);
    return 0;
  };

  return (
    <div style={{ maxWidth: '1060px', margin: '1rem auto 4rem auto' }}>
      {/* Encabezado Minimalista */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.75rem', marginBottom: '2.25rem' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}
        >
          Licenciamiento SaaS B2B / Infraestructura
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          Suscripción del Sistema por Tiers y Tokens
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '720px' }}>
          Administra el nivel de licencia de la plataforma, las cuotas de usuarios y administradores habilitados, y el saldo de tokens para la operación de los microservicios.
        </p>
      </div>

      {/* Notificaciones de Estado */}
      {feedback.text && (
        <div
          style={{
            padding: '0.85rem 1.15rem',
            borderRadius: '6px',
            marginBottom: '1.75rem',
            backgroundColor: feedback.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: feedback.type === 'error' ? '#991b1b' : '#166534',
            border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
            fontWeight: '500',
            fontSize: '13.5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback({ text: '', type: '' })}
            style={{ background: 'transparent', color: 'inherit', padding: '0 6px', fontSize: '13px', border: 'none' }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Comprobante Digital Minimalista */}
      {purchaseReceipt && (
        <div
          className="card"
          style={{
            marginBottom: '2rem',
            border: '1px solid #0a0a0a',
            backgroundColor: '#fafafa',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #e5e5e5', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Comprobante de Acreditación · Folio {purchaseReceipt.folio}
              </div>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '1.15rem' }}>
                +{purchaseReceipt.tokensAdded.toLocaleString('es-MX')} Tokens Acreditados
              </h3>
            </div>
            <button
              onClick={() => setPurchaseReceipt(null)}
              style={{ backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4', padding: '0.3rem 0.75rem', fontSize: '12px' }}
            >
              Cerrar
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.85rem',
              fontSize: '13px',
            }}
          >
            <div><span style={{ color: 'var(--text-muted)' }}>Empresa:</span><br /><strong>{purchaseReceipt.company}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Método de Pago:</span><br /><strong>{purchaseReceipt.paymentMethod}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Desglose:</span><br /><strong>{purchaseReceipt.baseTokens} Base + {purchaseReceipt.bonusTokens} Bonus</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Importe:</span><br /><strong>${purchaseReceipt.pricePaidMXN.toLocaleString('es-MX')} MXN</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Nuevo Saldo Pool:</span><br /><strong>{purchaseReceipt.newBalance.toLocaleString('es-MX')} Tokens</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Fecha:</span><br /><strong>{purchaseReceipt.date}</strong></div>
          </div>
        </div>
      )}

      {/* Modal de Checkout Minimalista */}
      {checkoutModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10, 10, 10, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '2rem',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e5e5',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Checkout de Tokens del Sistema
              </h3>
              <button
                onClick={() => setCheckoutModal(null)}
                style={{ backgroundColor: 'transparent', color: '#525252', border: '1px solid #e5e5e5', padding: '0.25rem 0.6rem', fontSize: '12px' }}
              >
                Cerrar
              </button>
            </div>

            {checkoutModal.reason && (
              <div
                style={{
                  backgroundColor: '#fafafa',
                  border: '1px solid #d4d4d4',
                  color: '#262626',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '6px',
                  fontSize: '12.5px',
                  marginBottom: '1rem',
                }}
              >
                {checkoutModal.reason}
              </div>
            )}

            <div
              style={{
                backgroundColor: '#fafafa',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>
                  {checkoutModal.mode === 'package'
                    ? stripEmojis(checkoutModal.packageObj.name)
                    : `Recarga Personalizada (${checkoutModal.customTokens} Tokens)`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {checkoutModal.mode === 'package'
                    ? `Total a acreditar: ${(checkoutModal.packageObj.tokens + (checkoutModal.packageObj.bonus_tokens || 0)).toLocaleString('es-MX')} Tokens`
                    : `Total a acreditar: ${checkoutModal.totalTokens.toLocaleString('es-MX')} Tokens`}
                </div>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                $
                {(checkoutModal.mode === 'package'
                  ? checkoutModal.packageObj.price_mxn
                  : checkoutModal.priceMXN
                ).toLocaleString('es-MX')}{' '}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MXN</span>
              </div>
            </div>

            <form onSubmit={handleConfirmModalPurchase}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Método de Pago</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'CARD', label: 'Tarjeta' },
                    { id: 'SPEI', label: 'SPEI' },
                    { id: 'PAYPAL', label: 'PayPal' },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      style={{
                        backgroundColor: paymentMethod === m.id ? '#0a0a0a' : '#ffffff',
                        color: paymentMethod === m.id ? '#ffffff' : '#525252',
                        border: '1px solid #d4d4d4',
                        fontWeight: '500',
                        fontSize: '12.5px',
                        padding: '0.5rem',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'CARD' && (
                <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Titular / Razón Social</label>
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Número de Tarjeta</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Vencimiento</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>CVV</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'SPEI' && (
                <div
                  style={{
                    backgroundColor: '#fafafa',
                    border: '1px solid #e5e5e5',
                    padding: '0.9rem',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    color: '#262626',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div><strong>Banco:</strong> STP / Monolito Corporate</div>
                  <div><strong>CLABE:</strong> 646180157042891042</div>
                  <div><strong>Acreditación:</strong> Automática al confirmar</div>
                </div>
              )}

              {paymentMethod === 'PAYPAL' && (
                <div
                  style={{
                    backgroundColor: '#fafafa',
                    border: '1px solid #e5e5e5',
                    padding: '0.9rem',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    color: '#262626',
                    marginBottom: '1.25rem',
                  }}
                >
                  Cargo corporativo autorizado a la cuenta empresarial de <strong>{companyName}</strong>.
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setCheckoutModal(null)}
                  style={{ flex: 1, backgroundColor: '#ffffff', color: '#525252', border: '1px solid #d4d4d4' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ flex: 2, backgroundColor: '#0a0a0a', color: '#ffffff', fontWeight: '600' }}
                >
                  {loading
                    ? 'Procesando...'
                    : checkoutModal.autoActivateTier
                    ? `Pagar y Activar ${stripEmojis(checkoutModal.autoActivateTier.name)}`
                    : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resumen Superior: Estado de Licencia y Pool de Tokens */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2.75rem',
        }}
      >
        {/* Licencia Actual */}
        <div className="card" style={{ padding: '1.75rem', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Licencia Activa
              </span>
              <span className="badge success" style={{ margin: 0 }}>
                Operativo
              </span>
            </div>

            <h2 style={{ fontSize: '1.45rem', marginBottom: '0.35rem' }}>
              {stripEmojis(activeTier?.name)}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {stripEmojis(activeTier?.description)}
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Organización Licenciataria
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '0.75rem',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '1rem',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Admins</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginTop: '2px' }}>
                {quotas.current_admins} / {quotas.effective_max_admins === -1 ? 'Ilimitados' : quotas.effective_max_admins}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Usuarios</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginTop: '2px' }}>
                {quotas.current_users} / {quotas.effective_max_users === -1 ? 'Ilimitados' : quotas.effective_max_users}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Catálogo</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginTop: '2px' }}>
                {catalogProductCount} / {quotas.effective_max_products === -1 ? 'Ilimitados' : quotas.effective_max_products}
              </div>
            </div>
          </div>
        </div>

        {/* Pool de Tokens */}
        <div className="card" style={{ padding: '1.75rem', backgroundColor: '#0a0a0a', color: '#ffffff', border: '1px solid #0a0a0a', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a3a3a3' }}>
                Billetera Operativa del Sistema
              </span>
              <span style={{ fontSize: '11px', color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pool de Tokens
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '0.5rem 0 0.75rem 0' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: '600', letterSpacing: '-0.03em' }}>
                {(license.system_token_balance || 0).toLocaleString('es-MX')}
              </span>
              <span style={{ fontSize: '14px', color: '#a3a3a3' }}>Tokens disponibles</span>
            </div>

            <p style={{ fontSize: '13px', color: '#a3a3a3', lineHeight: '1.55', marginBottom: '1.25rem' }}>
              Los tokens permiten activar o escalar el Tier del sistema, desbloquear paquetes adicionales de usuarios o administradores y cubrir el consumo de los microservicios.
            </p>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#d4d4d4',
                borderTop: '1px solid #262626',
                paddingTop: '0.85rem',
                marginBottom: '1.1rem',
              }}
            >
              <span>Adquiridos: <strong>{(license.total_tokens_purchased || 0).toLocaleString('es-MX')}</strong></span>
              <span>Consumidos: <strong>{(license.total_tokens_consumed || 0).toLocaleString('es-MX')}</strong></span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => openTokenPurchaseModal({ packageObj: token_packages[1] || token_packages[0] })}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#0a0a0a',
                  fontWeight: '600',
                  flex: 1,
                }}
              >
                Comprar Tokens
              </button>
              <a
                href="#addons-capacidad"
                style={{
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                  border: '1px solid #404040',
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  textAlign: 'center',
                }}
              >
                Ampliar Cupos
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: TIERS DE SUSCRIPCIÓN DEL SISTEMA */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            1. Tiers de Licencia del Sistema
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px' }}>
            Cada Tier establece las cuotas máximas de usuarios, administradores y microservicios activos. Se activan descontando Tokens del Pool.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {tiers.map((tier) => {
            const isCurrent = license.active_tier_id === tier.id;
            const hasEnough = (license.system_token_balance || 0) >= tier.token_cost;
            const missing = Math.max(0, tier.token_cost - (license.system_token_balance || 0));

            return (
              <div
                key={tier.id}
                className="card"
                style={{
                  padding: '1.75rem',
                  justifyContent: 'space-between',
                  border: isCurrent ? '1.5px solid #0a0a0a' : '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      Nivel {tier.tier_level}
                    </span>
                    {isCurrent && (
                      <span className="badge" style={{ margin: 0, backgroundColor: '#0a0a0a', color: '#ffffff', borderColor: '#0a0a0a' }}>
                        Activo
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem' }}>{stripEmojis(tier.name)}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1.25rem', minHeight: '40px' }}>
                    {stripEmojis(tier.description)}
                  </p>

                  <div
                    style={{
                      padding: '0.9rem 0',
                      borderTop: '1px solid var(--border-color)',
                      borderBottom: '1px solid var(--border-color)',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '1.6rem', fontWeight: '600' }}>
                          {tier.token_cost.toLocaleString('es-MX')} Tokens
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}> / mes</span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Ref. ${tier.price_mxn.toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        marginTop: '4px',
                        color: hasEnough ? '#15803d' : '#737373',
                      }}
                    >
                      {hasEnough
                        ? `Saldo disponible suficiente (${license.system_token_balance} Tokens)`
                        : `Requiere ${missing} Tokens adicionales`}
                    </div>
                  </div>

                  {/* Cuotas */}
                  <div style={{ display: 'grid', gap: '6px', fontSize: '12.5px', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cuentas Administrador</span>
                      <strong>{tier.max_admins === -1 ? 'Ilimitadas' : tier.max_admins}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Usuarios Plataforma</span>
                      <strong>{tier.max_users === -1 ? 'Ilimitados' : `Hasta ${tier.max_users.toLocaleString('es-MX')}`}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Productos Catálogo</span>
                      <strong>{tier.max_products === -1 ? 'Ilimitados' : `Hasta ${tier.max_products}`}</strong>
                    </div>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', fontSize: '12.5px', display: 'grid', gap: '0.5rem', color: '#404040' }}>
                    {(tier.features || []).map((feat, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: '#0a0a0a', fontWeight: '600' }}>—</span>
                        <span>{stripEmojis(feat)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => handleActivateTier(tier)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    backgroundColor: isCurrent ? '#ffffff' : '#0a0a0a',
                    color: isCurrent ? '#0a0a0a' : '#ffffff',
                    border: '1px solid #0a0a0a',
                    fontWeight: '500',
                    padding: '0.7rem',
                  }}
                >
                  {loading
                    ? 'Procesando...'
                    : isCurrent
                    ? `Renovar Licencia (${tier.token_cost} Tokens)`
                    : hasEnough
                    ? `Activar Tier ${tier.tier_level} (${tier.token_cost} Tokens)`
                    : `Adquirir Tokens y Activar Tier ${tier.tier_level}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECCIÓN 2: COMPRA DE PAQUETES DE TOKENS */}
      <div id="comprar-tokens-sistema" style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            2. Adquisición de Tokens del Sistema
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px' }}>
            Selecciona un paquete corporativo o ingresa una cantidad personalizada para recargar el Pool de Tokens.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
          {(token_packages || []).map((pkg) => (
            <div
              key={pkg.id}
              className="card"
              style={{
                padding: '1.5rem',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>{stripEmojis(pkg.name)}</span>
                  {pkg.badge && (
                    <span className="badge" style={{ margin: 0, fontSize: '10px' }}>
                      {stripEmojis(pkg.badge)}
                    </span>
                  )}
                </div>

                <div style={{ margin: '0.75rem 0' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: '600', letterSpacing: '-0.02em' }}>
                    {(pkg.tokens + (pkg.bonus_tokens || 0)).toLocaleString('es-MX')}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>Tokens</span>
                  {pkg.bonus_tokens > 0 && (
                    <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '2px' }}>
                      {pkg.tokens.toLocaleString('es-MX')} base + {pkg.bonus_tokens.toLocaleString('es-MX')} bonificados
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  {stripEmojis(pkg.description)}
                </p>
              </div>

              <div style={{ display: 'grid', gap: '6px' }}>
                <button
                  onClick={() => openTokenPurchaseModal({ packageObj: pkg })}
                  disabled={loading}
                  style={{ width: '100%', padding: '0.6rem' }}
                >
                  Comprar · ${pkg.price_mxn.toLocaleString('es-MX')} MXN
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPurchaseTokens({ packageId: pkg.id })}
                  disabled={loading}
                  style={{
                    width: '100%',
                    backgroundColor: '#fafafa',
                    color: '#525252',
                    border: '1px solid #e5e5e5',
                    padding: '0.45rem',
                    fontSize: '12px',
                  }}
                >
                  Recarga Directa 1-Clic
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Recarga Personalizada */}
        <div
          className="card"
          style={{
            padding: '1.25rem 1.5rem',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '2px' }}>Recarga Personalizada de Tokens</h4>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Tarifa: $4.50 MXN por Token (+15% de bonificación a partir de 400 Tokens · +25% a partir de 1,000 Tokens).
            </p>
            {calcBonusForCustom(customTokens) > 0 && (
              <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>
                Bonificación incluida: +{calcBonusForCustom(customTokens)} Tokens adicionales (Total:{' '}
                {(Number(customTokens || 0) + calcBonusForCustom(customTokens)).toLocaleString('es-MX')} Tokens)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="number"
              min={50}
              max={50000}
              step={50}
              value={customTokens}
              onChange={(e) => setCustomTokens(e.target.value)}
              style={{ width: '110px', textAlign: 'center', fontWeight: '600' }}
            />
            <button
              type="button"
              onClick={() => openTokenPurchaseModal({ customAmount: customTokens })}
              disabled={loading}
            >
              Checkout (${(Number(customTokens || 0) * 4.5).toLocaleString('es-MX')} MXN)
            </button>
            <button
              type="button"
              onClick={() => handleQuickPurchaseTokens({ customAmount: customTokens })}
              disabled={loading}
              style={{ backgroundColor: '#ffffff', color: '#0a0a0a', border: '1px solid #d4d4d4' }}
            >
              Recarga 1-Clic
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3 Y 4: PAQUETES ADICIONALES DE CAPACIDAD Y CONSUMO POR MICROSERVICIO */}
      <div
        id="addons-capacidad"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2.75rem',
        }}
      >
        {/* Ampliación de Cupos */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.3rem' }}>
            3. Ampliación de Cupos con Tokens (Add-ons)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Desbloquea cuentas adicionales de Administrador, Usuarios o Productos sin cambiar de Tier.
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {(addons || []).map((addon) => (
              <div
                key={addon.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13.5px' }}>{stripEmojis(addon.name)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {stripEmojis(addon.description)}
                  </div>
                </div>
                <button
                  onClick={() => handleBuyAddon(addon)}
                  disabled={loading}
                  style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '0.45rem 0.85rem' }}
                >
                  Canjear · {addon.token_cost} Tokens
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Consumo Operativo por Microservicio */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.3rem' }}>
            4. Consumo Operativo por Microservicio
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Cada operación transaccional del sistema descuenta tokens automáticamente del Pool activo.
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {(operation_rates || []).map((op) => (
              <div
                key={op.operation}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: '#fafafa',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: '500', fontSize: '13px' }}>{stripEmojis(op.name)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Tarifa: {op.token_cost} Token(s) por operación
                  </div>
                </div>
                <button
                  onClick={() => handleSimulateOperation(op)}
                  disabled={loading}
                  style={{
                    whiteSpace: 'nowrap',
                    backgroundColor: '#ffffff',
                    color: '#0a0a0a',
                    border: '1px solid #d4d4d4',
                    fontSize: '12px',
                    padding: '0.4rem 0.8rem',
                  }}
                >
                  Simular (-{op.token_cost} Tokens)
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECCIÓN 5: BITÁCORA DE AUDITORÍA */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
          5. Bitácora de Transacciones y Consumo de Tokens
        </h3>
        {(!logs || logs.length === 0) ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
            Sin registros en la bitácora.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <tr>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Fecha</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Tipo</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Descripción</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Tokens</th>
                  <th style={{ padding: '0.65rem 0.75rem' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString('es-MX')}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span className="badge" style={{ margin: 0, fontSize: '10px' }}>
                        {log.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>{stripEmojis(log.description)}</td>
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        fontWeight: '600',
                        color: log.amount >= 0 ? '#15803d' : '#0a0a0a',
                      }}
                    >
                      {log.amount >= 0 ? `+${log.amount}` : log.amount}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', fontWeight: '600' }}>
                      {log.balance_after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

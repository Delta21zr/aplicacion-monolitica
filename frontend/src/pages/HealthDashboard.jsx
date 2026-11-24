import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const MONITOR_API = 'http://localhost:8088/api/monitoring';

function LatencyLineChart({ timeline }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#737373', fontSize: '13px' }}>
        Esperando muestras de latencia...
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padLeft = 46;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 32;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(
    10,
    ...timeline.map((pt) => Math.max(pt.avg_latency_ms || 0, pt.p95_latency_ms || 0))
  );
  const yMax = Math.ceil(maxVal * 1.15);

  const getX = (idx) => {
    if (timeline.length === 1) return padLeft + innerW / 2;
    return padLeft + (idx / (timeline.length - 1)) * innerW;
  };

  const getY = (val) => {
    const ratio = Math.min(1, Math.max(0, (val || 0) / yMax));
    return padTop + innerH - ratio * innerH;
  };

  const avgPoints = timeline.map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.avg_latency_ms).toFixed(1)}`).join(' ');
  const p95Points = timeline.map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.p95_latency_ms).toFixed(1)}`).join(' ');

  const areaPath = (() => {
    if (timeline.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(timeline.length - 1).toFixed(1);
    const baseY = (padTop + innerH).toFixed(1);
    const lineSegs = timeline.map((pt, i) => `L ${getX(i).toFixed(1)} ${getY(pt.avg_latency_ms).toFixed(1)}`).join(' ');
    return `M ${firstX} ${baseY} ${lineSegs} L ${lastX} ${baseY} Z`;
  })();

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: Math.round(yMax * t),
    y: padTop + innerH - t * innerH,
  }));

  const labelStep = Math.max(1, Math.floor(timeline.length / 6));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              stroke="#ededed"
              strokeWidth="1"
            />
            <text
              x={padLeft - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill="#737373"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick.val}ms
            </text>
          </g>
        ))}

        <path d={areaPath} fill="rgba(10, 10, 10, 0.06)" />

        <polyline
          fill="none"
          stroke="#a3a3a3"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          points={p95Points}
        />

        <polyline
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="2"
          points={avgPoints}
        />

        {timeline.map((pt, i) => (
          <g key={i}>
            <circle
              cx={getX(i)}
              cy={getY(pt.avg_latency_ms)}
              r={timeline.length > 25 ? 2 : 3}
              fill="#0a0a0a"
            >
              <title>{`${pt.label} | Promedio: ${pt.avg_latency_ms} ms | P95: ${pt.p95_latency_ms} ms | UP: ${pt.up_count} / DOWN: ${pt.down_count}`}</title>
            </circle>
            {(i % labelStep === 0 || i === timeline.length - 1) && (
              <text
                x={getX(i)}
                y={height - 10}
                textAnchor="middle"
                fill="#737373"
                fontSize="10"
                fontFamily="monospace"
              >
                {pt.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', fontSize: '12px', color: '#525252' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '2px', backgroundColor: '#0a0a0a', display: 'inline-block' }} />
          Latencia promedio (ms)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '0px', borderTop: '2px dashed #a3a3a3', display: 'inline-block' }} />
          Latencia P95 (ms)
        </span>
      </div>
    </div>
  );
}

function HealthDashboard() {
  const [statusData, setStatusData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState('');

  // Form para emitir un request de prueba por RabbitMQ
  const [customMethod, setCustomMethod] = useState('POST');
  const [customService, setCustomService] = useState('Order & Payment Service');
  const [customPath, setCustomPath] = useState('/api/orders/checkout');

  const fetchAll = useCallback(async () => {
    try {
      const [stRes, mtRes] = await Promise.all([
        axios.get(`${MONITOR_API}/status`),
        axios.get(`${MONITOR_API}/metrics`),
      ]);
      setStatusData(stRes.data);
      setMetricsData(mtRes.data);
      setError('');
    } catch (err) {
      setError('No se pudo conectar con monitoring-service-go en http://localhost:8088. Verifica que el microservicio esté activo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      fetchAll();
    }, 4000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchAll]);

  const handleManualProbe = async () => {
    setBusyAction('probe');
    setFeedback('');
    try {
      await axios.post(`${MONITOR_API}/probe`);
      await fetchAll();
      setFeedback('Sondeo de salud ejecutado y publicado en RabbitMQ.');
    } catch (_) {
      setFeedback('Error al ejecutar el sondeo manual.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSimulateTraffic = async () => {
    setBusyAction('simulate');
    setFeedback('');
    try {
      const res = await axios.post(`${MONITOR_API}/simulate`);
      await fetchAll();
      setFeedback(`Tráfico de prueba enviado: ${res.data.events_sent} requests (${res.data.published_rabbitmq} vía RabbitMQ).`);
    } catch (_) {
      setFeedback('Error al simular tráfico en RabbitMQ.');
    } finally {
      setBusyAction('');
    }
  };

  const handleEmitCustomEvent = async (e) => {
    e.preventDefault();
    setBusyAction('custom');
    setFeedback('');
    try {
      const latency = Number((4 + Math.random() * 24).toFixed(2));
      await axios.post(`${MONITOR_API}/events`, {
        service: customService,
        method: customMethod,
        path: customPath,
        status_code: customMethod === 'POST' ? 201 : 200,
        latency_ms: latency,
      });
      await fetchAll();
      setFeedback(`Evento ${customMethod} ${customPath} (${latency} ms) publicado en RabbitMQ.`);
    } catch (_) {
      setFeedback('No se pudo publicar el evento en RabbitMQ.');
    } finally {
      setBusyAction('');
    }
  };

  const services = statusData?.services || [];
  const filteredServices = categoryFilter === 'all'
    ? services
    : services.filter((s) => s.category === categoryFilter);

  const summary = statusData?.summary || {
    total_services: 0,
    up_count: 0,
    down_count: 0,
    avg_latency_ms: 0,
    p95_latency_ms: 0,
    total_requests: 0,
  };

  const rabbitmq = statusData?.rabbitmq || {
    status: 'DOWN',
    exchange: 'monolito.telemetry',
    health_queue: 'monolito.health.events',
    request_queue: 'monolito.request.events',
    messages_published: 0,
    messages_consumed: 0,
  };

  const requestTypes = metricsData?.request_types || [];
  const timeline = metricsData?.latency_timeline || [];
  const recentRequests = metricsData?.recent_requests || [];
  const maxSvcLatency = Math.max(5, ...services.map((s) => s.latency_ms || 0));

  const formatTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString('es-MX', { hour12: false });
  };

  const statusBadgeStyle = (st) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    backgroundColor: st === 'UP' || st === 'HEALTHY' ? '#f0fdf4' : '#fef2f2',
    color: st === 'UP' || st === 'HEALTHY' ? '#15803d' : '#b91c1c',
    border: `1px solid ${st === 'UP' || st === 'HEALTHY' ? '#bbf7d0' : '#fecaca'}`,
  });

  const methodBadgeStyle = (method) => {
    const palette = {
      GET: { bg: '#fafafa', color: '#0a0a0a', border: '#d4d4d4' },
      POST: { bg: '#0a0a0a', color: '#ffffff', border: '#0a0a0a' },
      PUT: { bg: '#f5f5f5', color: '#262626', border: '#a3a3a3' },
      DELETE: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
    };
    const p = palette[method] || palette.GET;
    return {
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: '600',
      fontFamily: 'monospace',
      backgroundColor: p.bg,
      color: p.color,
      border: `1px solid ${p.border}`,
    };
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Encabezado */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1.25rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e5e5e5',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#737373', marginBottom: '4px' }}>
            Microservicio Independiente · Puerto :8088 · Broker RabbitMQ
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#0a0a0a', margin: 0 }}>
            Dashboard de Salud y Latencia
          </h1>
          <p style={{ fontSize: '13px', color: '#525252', margin: '4px 0 0 0' }}>
            Estado en tiempo real (UP / DOWN), distribución por tipo de request y gráficas de latencia procesadas vía RabbitMQ.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              backgroundColor: autoRefresh ? '#0a0a0a' : '#ffffff',
              color: autoRefresh ? '#ffffff' : '#0a0a0a',
              border: '1px solid #0a0a0a',
              padding: '0.45rem 0.85rem',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {autoRefresh ? 'Auto-actualización: ON (4s)' : 'Auto-actualización: OFF'}
          </button>

          <button
            onClick={handleManualProbe}
            disabled={busyAction !== ''}
            style={{
              backgroundColor: '#ffffff',
              color: '#0a0a0a',
              border: '1px solid #d4d4d4',
              padding: '0.45rem 0.85rem',
              fontSize: '12px',
              fontWeight: '500',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {busyAction === 'probe' ? 'Sondeando...' : 'Ejecutar Sondeo'}
          </button>

          <button
            onClick={handleSimulateTraffic}
            disabled={busyAction !== ''}
            style={{
              backgroundColor: '#fafafa',
              color: '#0a0a0a',
              border: '1px solid #0a0a0a',
              padding: '0.45rem 0.85rem',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {busyAction === 'simulate' ? 'Publicando...' : 'Simular Requests (RabbitMQ)'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.9rem 1rem',
            marginBottom: '1.25rem',
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '13px',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      {feedback && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            border: '1px solid #d4d4d4',
            backgroundColor: '#fafafa',
            color: '#0a0a0a',
            fontSize: '13px',
            borderRadius: '4px',
          }}
        >
          {feedback}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#737373', fontSize: '14px' }}>
          Cargando telemetría de servicios...
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1rem 1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#737373' }}>
                Estado General
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '22px', fontWeight: '600', color: '#0a0a0a' }}>
                  {summary.up_count} / {summary.total_services} UP
                </span>
                <span style={statusBadgeStyle(statusData?.overall_status || 'DOWN')}>
                  {statusData?.overall_status || 'OFFLINE'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#737373', marginTop: '0.4rem' }}>
                Caídos (DOWN): <strong style={{ color: summary.down_count > 0 ? '#b91c1c' : '#0a0a0a' }}>{summary.down_count}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1rem 1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#737373' }}>
                Latencia Promedio
              </div>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#0a0a0a', marginTop: '0.4rem', fontFamily: 'monospace' }}>
                {summary.avg_latency_ms} ms
              </div>
              <div style={{ fontSize: '12px', color: '#737373', marginTop: '0.35rem' }}>
                P95 actual: <strong style={{ color: '#0a0a0a' }}>{summary.p95_latency_ms} ms</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1rem 1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#737373' }}>
                Total Requests Monitoreados
              </div>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#0a0a0a', marginTop: '0.4rem', fontFamily: 'monospace' }}>
                {summary.total_requests}
              </div>
              <div style={{ fontSize: '12px', color: '#737373', marginTop: '0.35rem' }}>
                Última actualización: {formatTime(statusData?.updated_at)}
              </div>
            </div>

            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1rem 1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#737373' }}>
                RabbitMQ Broker (:5672)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '20px', fontWeight: '600', color: '#0a0a0a', fontFamily: 'monospace' }}>
                  {rabbitmq.messages_consumed} msg
                </span>
                <span style={statusBadgeStyle(rabbitmq.status)}>
                  {rabbitmq.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#737373', marginTop: '0.35rem' }}>
                Pub: {rabbitmq.messages_published} · Cons: {rabbitmq.messages_consumed}
              </div>
            </div>
          </div>

          {/* Gráficas de Latencia y Tiempo */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Gráfica 1: Serie de tiempo de latencia */}
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#0a0a0a' }}>
                    Gráfica de Latencia vs Tiempo
                  </h2>
                  <div style={{ fontSize: '12px', color: '#737373' }}>
                    Evolución de latencia promedio y P95 en milisegundos ({timeline.length} muestras)
                  </div>
                </div>
              </div>
              <LatencyLineChart timeline={timeline} />
            </div>

            {/* Gráfica 2: Comparativa de latencia actual por servicio */}
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ marginBottom: '0.85rem' }}>
                <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#0a0a0a' }}>
                  Tiempo de Respuesta por Servicio
                </h2>
                <div style={{ fontSize: '12px', color: '#737373' }}>
                  Latencia del último sondeo en ms
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                {services.map((svc) => {
                  const pct = svc.status === 'UP'
                    ? Math.max(4, Math.min(100, (svc.latency_ms / maxSvcLatency) * 100))
                    : 100;
                  return (
                    <div key={svc.id} style={{ display: 'grid', gridTemplateColumns: '165px 1fr 70px', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ fontSize: '12px', color: '#0a0a0a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {svc.name}
                      </div>
                      <div style={{ height: '8px', backgroundColor: '#f5f5f5', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            backgroundColor: svc.status === 'UP' ? '#0a0a0a' : '#dc2626',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', textAlign: 'right', color: svc.status === 'UP' ? '#525252' : '#b91c1c' }}>
                        {svc.status === 'UP' ? `${svc.latency_ms} ms` : 'DOWN'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sección Tipo de Request + Publicador RabbitMQ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Distribución por Tipo de Request */}
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1.25rem', backgroundColor: '#ffffff' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 0.25rem 0', color: '#0a0a0a' }}>
                Distribución por Tipo de Request
              </h2>
              <div style={{ fontSize: '12px', color: '#737373', marginBottom: '1rem' }}>
                Conteo, proporción y latencia promedio agrupada por método HTTP
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {requestTypes.map((rt) => (
                  <div key={rt.method} style={{ borderBottom: '1px solid #f5f5f5', paddingBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={methodBadgeStyle(rt.method)}>{rt.method}</span>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#0a0a0a', fontFamily: 'monospace' }}>
                          {rt.count} req
                        </span>
                        <span style={{ fontSize: '12px', color: '#737373' }}>({rt.share_pct}%)</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#525252', fontFamily: 'monospace' }}>
                        Prom: {rt.avg_latency_ms} ms · Max: {rt.max_latency_ms} ms
                      </div>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#f5f5f5', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, rt.share_pct || 0)}%`,
                          height: '100%',
                          backgroundColor: '#0a0a0a',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel RabbitMQ + Emisor de Eventos */}
            <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '1.25rem', backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#0a0a0a' }}>
                    Arquitectura de Mensajería RabbitMQ
                  </h2>
                  <div style={{ fontSize: '12px', color: '#737373' }}>
                    Exchange topic y colas durables de telemetría
                  </div>
                </div>
                <span style={statusBadgeStyle(rabbitmq.status)}>{rabbitmq.status}</span>
              </div>

              <div
                style={{
                  backgroundColor: '#fafafa',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  padding: '0.85rem',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#262626',
                  marginBottom: '1rem',
                  display: 'grid',
                  gap: '4px',
                }}
              >
                <div>Exchange: <strong>{rabbitmq.exchange}</strong> (topic)</div>
                <div>Cola Salud: <strong>{rabbitmq.health_queue}</strong></div>
                <div>Cola Requests: <strong>{rabbitmq.request_queue}</strong></div>
                <div>
                  Management UI:{' '}
                  <a href="http://localhost:15672" target="_blank" rel="noreferrer" style={{ color: '#0a0a0a', textDecoration: 'underline' }}>
                    http://localhost:15672
                  </a>{' '}
                  (guest / guest)
                </div>
              </div>

              <form onSubmit={handleEmitCustomEvent} style={{ display: 'grid', gap: '0.6rem' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#0a0a0a' }}>
                  Publicar evento de request en RabbitMQ
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '105px 1fr', gap: '0.5rem' }}>
                  <select
                    value={customMethod}
                    onChange={(e) => setCustomMethod(e.target.value)}
                    style={{
                      padding: '0.45rem 0.5rem',
                      border: '1px solid #d4d4d4',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <select
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                    style={{
                      padding: '0.45rem 0.5rem',
                      border: '1px solid #d4d4d4',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    {services.filter((s) => s.category === 'microservice').map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="/api/..."
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.6rem',
                      border: '1px solid #d4d4d4',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busyAction !== ''}
                    style={{
                      backgroundColor: '#0a0a0a',
                      color: '#ffffff',
                      border: '1px solid #0a0a0a',
                      padding: '0.45rem 0.9rem',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Publicar
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Tabla de Estado de Servicios (UP / DOWN) */}
          <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', backgroundColor: '#ffffff', marginBottom: '1.5rem' }}>
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e5e5e5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#0a0a0a' }}>
                  Servicios Monitoreados (UP / DOWN)
                </h2>
                <div style={{ fontSize: '12px', color: '#737373' }}>
                  Estado actual, puerto, latencia y disponibilidad acumulada
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'microservice', label: 'Microservicios' },
                  { key: 'infrastructure', label: 'Infraestructura' },
                  { key: 'frontend', label: 'Frontend' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setCategoryFilter(tab.key)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid #d4d4d4',
                      backgroundColor: categoryFilter === tab.key ? '#0a0a0a' : '#ffffff',
                      color: categoryFilter === tab.key ? '#ffffff' : '#525252',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #e5e5e5', textAlign: 'left', color: '#525252' }}>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Servicio</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Puerto</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Estado</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Latencia</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Promedio</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Uptime</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Transporte</th>
                    <th style={{ padding: '0.7rem 1rem', fontWeight: '600' }}>Último Check</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((svc) => (
                    <tr key={svc.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: '500', color: '#0a0a0a' }}>{svc.name}</div>
                        {svc.last_error && svc.status === 'DOWN' && (
                          <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>{svc.last_error}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#525252' }}>{svc.port}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={statusBadgeStyle(svc.status)}>{svc.status}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#0a0a0a' }}>
                        {svc.status === 'UP' ? `${svc.latency_ms} ms` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#525252' }}>
                        {svc.avg_latency_ms > 0 ? `${svc.avg_latency_ms} ms` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#0a0a0a' }}>
                        {svc.uptime_pct}%
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '12px', color: '#525252' }}>
                        {svc.via_rabbitmq ? 'RabbitMQ' : 'Local'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '12px', color: '#737373' }}>
                        {formatTime(svc.last_check)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Registro de Requests Recientes */}
          <div style={{ border: '1px solid #e5e5e5', borderRadius: '6px', backgroundColor: '#ffffff' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e5e5' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#0a0a0a' }}>
                Flujo Reciente de Requests (Consumido desde RabbitMQ)
              </h2>
              <div style={{ fontSize: '12px', color: '#737373' }}>
                Últimos {Math.min(15, recentRequests.length)} eventos procesados en tiempo real
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #e5e5e5', textAlign: 'left', color: '#525252' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Hora</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Tipo</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Servicio</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Ruta</th>
                    <th style={{ padding: '0.65rem 1rem' }}>HTTP</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Latencia</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Broker</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.slice(0, 15).map((req) => (
                    <tr key={req.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: '#737373' }}>{formatTime(req.timestamp)}</td>
                      <td style={{ padding: '0.6rem 1rem' }}>
                        <span style={methodBadgeStyle(req.method)}>{req.method}</span>
                      </td>
                      <td style={{ padding: '0.6rem 1rem', color: '#0a0a0a', fontWeight: '500' }}>{req.service}</td>
                      <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: '#525252' }}>{req.path}</td>
                      <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: req.status_code >= 400 || req.status_code === 0 ? '#b91c1c' : '#15803d' }}>
                        {req.status_code || 'ERR'}
                      </td>
                      <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: '#0a0a0a' }}>{req.latency_ms} ms</td>
                      <td style={{ padding: '0.6rem 1rem', color: '#525252' }}>{req.via_rabbitmq ? 'RabbitMQ' : 'Directo'}</td>
                    </tr>
                  ))}
                  {recentRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#737373' }}>
                        Sin eventos registrados todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default HealthDashboard;

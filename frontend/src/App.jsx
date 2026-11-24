import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import SystemLicense from './pages/SystemLicense';
import HealthDashboard from './pages/HealthDashboard';
import './index.css';

function Navbar() {
  const [user, setUser] = useState(null);
  const [sysLicense, setSysLicense] = useState({ tier_level: 1, system_token_balance: 350 });
  const navigate = useNavigate();

  useEffect(() => {
    const syncUser = () => {
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (token) {
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUser({ email: payload.email, id: payload.id });
          } catch (e) {
            setUser({ email: 'Usuario' });
          }
        }
      } else {
        setUser(null);
      }
    };

    const syncSystemLicense = async () => {
      try {
        const res = await axios.get('http://localhost:3002/api/users/system/license');
        if (res.data?.license) {
          setSysLicense(res.data.license);
        }
      } catch (_) {}
    };

    syncUser();
    syncSystemLicense();
    window.addEventListener('user-updated', syncUser);
    window.addEventListener('system-license-updated', syncSystemLicense);
    return () => {
      window.removeEventListener('user-updated', syncUser);
      window.removeEventListener('system-license-updated', syncSystemLicense);
    };
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await axios.post(
          'http://localhost:3002/api/auth/logout',
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        console.error('Error al hacer logout en backend', err);
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
    window.location.reload();
  };

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">MONOLITO</Link>
      <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <Link to="/">Catálogo</Link>
        <Link to="/profile">Pedidos y Cuenta</Link>
        <Link to="/health-dashboard">Salud / Monitor</Link>
        <Link
          to="/system-license"
          style={{
            backgroundColor: '#fafafa',
            border: '1px solid #d4d4d4',
            color: '#0a0a0a',
            padding: '0.3rem 0.75rem',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
          }}
        >
          <span>Licencia Tier {sysLicense.tier_level || 1}</span>
          <span style={{ color: '#a3a3a3' }}>|</span>
          <span>{(sysLicense.system_token_balance ?? 350).toLocaleString('es-MX')} Tokens</span>
        </Link>

        {user?.role === 'admin' && (
          <Link to="/profile?tab=admin" style={{ color: '#0a0a0a', fontWeight: '600' }}>
            Administración
          </Link>
        )}
        
        {user ? (
          <>
            <Link to="/profile" style={{ fontWeight: '500', color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{user.full_name || user.email || 'Mi Perfil'}</span>
              {user.role === 'admin' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    backgroundColor: '#0a0a0a',
                    color: '#ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Admin
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: 'transparent',
                color: '#525252',
                border: '1px solid #e5e5e5',
                padding: '0.35rem 0.75rem',
                fontSize: '12px',
              }}
            >
              Salir
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Iniciar Sesión</Link>
            <Link to="/register" style={{ fontWeight: '600', color: '#0a0a0a' }}>Crear Cuenta</Link>
          </>
        )}

        <Link
          to="/cart"
          style={{
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            padding: '0.4rem 0.9rem',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
          }}
        >
          Carrito
        </Link>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container">
          <Routes>
            <Route path="/" element={<Catalog />} />
            <Route path="/system-license" element={<SystemLicense />} />
            <Route path="/health-dashboard" element={<HealthDashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/recover-password" element={<ResetPassword />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;

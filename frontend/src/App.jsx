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
import './index.css';

function Navbar() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
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
      <Link to="/" className="nav-brand">M O N O L I T O .</Link>
      <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <Link to="/">Catálogo</Link>
        <Link to="/profile">📦 Pedidos y Wishlists</Link>
        
        {user ? (
          <>
            <Link to="/profile" style={{ fontWeight: '600' }}>
              👤 {user.full_name || user.email || 'Mi Perfil'}
            </Link>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: '#fee2e2',
                color: '#ef4444',
                padding: '0.4rem 0.8rem',
                fontSize: '13px',
              }}
            >
              Cerrar Sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Iniciar Sesión</Link>
            <Link to="/register" style={{ fontWeight: '600' }}>Registrarse</Link>
          </>
        )}

        <Link
          to="/cart"
          style={{
            backgroundColor: '#f3f4f6',
            padding: '0.4rem 1rem',
            borderRadius: '99px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          🛒 <span>Mi Carrito</span>
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

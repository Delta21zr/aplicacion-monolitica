import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.post('http://localhost:3002/api/auth/login', {
        email,
        password,
      });
      setMessage('Login Exitoso. Redirigiendo...');
      setIsError(false);
      localStorage.setItem('token', res.data.token);
      if (res.data.user) {
        localStorage.setItem('user', JSON.stringify(res.data.user));
      }
      
      setTimeout(() => {
        navigate('/');
        window.location.reload();
      }, 800);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error al iniciar sesión');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  // Integración SOA Microservicio 1 de Salvador: Usuarios (iniciarSesion GraphQL)
  const handleHotelSSOLogin = async (presetEmail, presetPassword) => {
    const targetEmail = presetEmail || email;
    const targetPassword = presetPassword || password;
    if (!targetEmail || !targetPassword) {
      setMessage('Ingresa tu correo y contraseña de Hotel Paraíso o usa el acceso rápido de demostración.');
      setIsError(true);
      return;
    }

    setSsoLoading(true);
    setMessage('');
    try {
      const ssoRes = await axios.post('http://localhost:8080/api/partner-hotel/login', {
        email: targetEmail,
        password: targetPassword,
      });

      if (!ssoRes.data?.exito) {
        setMessage(ssoRes.data?.mensaje || 'Credenciales rechazadas por Hotel Paraíso.');
        setIsError(true);
        setSsoLoading(false);
        return;
      }

      const hotelUser = ssoRes.data.usuario;
      const hotelToken = ssoRes.data.token;
      localStorage.setItem('hotel_token', hotelToken);
      localStorage.setItem('hotel_user', JSON.stringify(hotelUser));

      // Sincronizar con el User Service local (:3002) para emitir JWT válido de la tienda
      const localPwd = targetPassword.length >= 6 ? targetPassword : targetPassword + '123456';
      let localAuth = null;
      try {
        const loginLocal = await axios.post('http://localhost:3002/api/auth/login', {
          email: hotelUser.correo,
          password: localPwd,
        });
        localAuth = loginLocal.data;
      } catch (_) {
        try {
          const regLocal = await axios.post('http://localhost:3002/api/auth/register', {
            full_name: hotelUser.nombre,
            email: hotelUser.correo,
            password: localPwd,
          });
          localAuth = regLocal.data;
        } catch (__) {}
      }

      if (localAuth?.token) {
        localStorage.setItem('token', localAuth.token);
        localStorage.setItem('user', JSON.stringify({
          ...localAuth.user,
          hotel_id: hotelUser.id,
          hotel_rol: hotelUser.rol,
          sso_provider: 'Hotel Paraíso (Salvador GraphQL)',
        }));
      } else {
        localStorage.setItem('token', hotelToken);
        localStorage.setItem('user', JSON.stringify({
          id: hotelUser.id,
          email: hotelUser.correo,
          full_name: hotelUser.nombre,
          role: hotelUser.rol,
          sso_provider: 'Hotel Paraíso (Salvador GraphQL)',
        }));
      }

      setIsError(false);
      setMessage(`✅ Autenticado en Hotel Paraíso como ${hotelUser.nombre} (${ssoRes.data.origen_servicio}). Redirigiendo...`);
      setTimeout(() => {
        navigate('/profile');
        window.location.reload();
      }, 900);
    } catch (err) {
      setMessage(err.response?.data?.mensaje || 'Error al autenticar con el Microservicio de Usuarios del Hotel.');
      setIsError(true);
    } finally {
      setSsoLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>Bienvenido de vuelta</h2>
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label>Correo Electrónico</label>
          <input 
            type="email" 
            placeholder="ejemplo@correo.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
        </div>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Contraseña</label>
            <Link to="/recover-password" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
        </div>
        <button type="submit" disabled={loading || ssoLoading} style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Iniciando sesión...' : 'Iniciar Sesión (Tienda Local)'}
        </button>
      </form>

      {/* Integración SOA Microservicio 1: Usuarios Hotel Paraíso (Salvador) */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px dashed var(--border-color)' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', textAlign: 'center', marginBottom: '0.6rem' }}>
          🏨 INTEGRACIÓN SOA — MICROSERVICIO DE USUARIOS (HOTEL PARAÍSO)
        </div>
        <button
          type="button"
          disabled={ssoLoading || loading}
          onClick={() => handleHotelSSOLogin()}
          style={{
            width: '100%',
            backgroundColor: '#1e40af',
            color: '#fff',
            fontWeight: '600',
            marginBottom: '0.5rem',
          }}
        >
          {ssoLoading ? 'Validando en GraphQL de Hotel Paraíso...' : '🔑 Iniciar Sesión con Cuenta Hotel Paraíso (SSO)'}
        </button>
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={ssoLoading}
            onClick={() => {
              setEmail('juan@cliente.com');
              setPassword('123');
              handleHotelSSOLogin('juan@cliente.com', '123');
            }}
            style={{ fontSize: '11px', padding: '0.3rem 0.6rem', backgroundColor: '#eff6ff', color: '#1d4ed8' }}
          >
            Demo Huésped: juan@cliente.com
          </button>
          <button
            type="button"
            disabled={ssoLoading}
            onClick={() => {
              setEmail('maria@cliente.com');
              setPassword('123');
              handleHotelSSOLogin('maria@cliente.com', '123');
            }}
            style={{ fontSize: '11px', padding: '0.3rem 0.6rem', backgroundColor: '#eff6ff', color: '#1d4ed8' }}
          >
            Demo Huésped: maria@cliente.com
          </button>
        </div>
      </div>

      {message && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: isError ? 'var(--error-color)' : 'var(--success-color)' }}>
          {message}
        </div>
      )}

      <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
        ¿No tienes cuenta? <Link to="/register" style={{ fontWeight: '600' }}>Regístrate gratis</Link>
      </p>
    </div>
  );
}

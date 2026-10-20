import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
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
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
        </button>
      </form>

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

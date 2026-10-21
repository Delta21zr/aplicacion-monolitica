import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [syncWithHotel, setSyncWithHotel] = useState(true);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.post('http://localhost:3002/api/auth/register', {
        full_name: fullName,
        email,
        password,
      });

      let hotelSyncMsg = '';
      if (syncWithHotel) {
        try {
          const hotelRes = await axios.post('http://localhost:8080/api/partner-hotel/register', {
            nombre: fullName,
            correo: email,
            password: password,
          });
          if (hotelRes.data?.token) {
            localStorage.setItem('hotel_token', hotelRes.data.token);
            localStorage.setItem('hotel_user', JSON.stringify(hotelRes.data.usuario));
            hotelSyncMsg = ' + Cuenta sincronizada en Hotel Paraíso (GraphQL)';
          }
        } catch (_) {}
      }

      setMessage(`¡Registro exitoso${hotelSyncMsg}! Iniciando sesión...`);
      setIsError(false);
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
      }
      if (res.data.user) {
        localStorage.setItem('user', JSON.stringify({
          ...res.data.user,
          sso_provider: syncWithHotel ? 'Sincronizado con Hotel Paraíso' : 'Local',
        }));
      }
      setTimeout(() => {
        navigate('/profile');
        window.location.reload();
      }, 1200);
    } catch (err) {
      setMessage(err.response?.data?.message || err.response?.data?.error || 'Error al registrar usuario');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Crear Cuenta</h2>
      <form onSubmit={handleRegister}>
        <div className="form-group">
          <label>Nombre Completo</label>
          <input 
            type="text" 
            placeholder="Juan Pérez" 
            value={fullName} 
            onChange={(e) => setFullName(e.target.value)} 
            required 
          />
        </div>
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
          <label>Contraseña</label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
          />
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>
            <input
              type="checkbox"
              checked={syncWithHotel}
              onChange={(e) => setSyncWithHotel(e.target.checked)}
              style={{ width: 'auto' }}
            />
            🏨 Crear y vincular automáticamente mi cuenta en Hotel Paraíso (Microservicio Usuarios de Salvador)
          </label>
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
          {loading ? 'Registrando...' : 'Registrarse'}
        </button>
      </form>

      {message && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: isError ? 'var(--error-color)' : 'var(--success-color)' }}>
          {message}
        </div>
      )}

      <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
        ¿Ya tienes cuenta? <Link to="/login" style={{ fontWeight: '600' }}>Inicia sesión aquí</Link>
      </p>
    </div>
  );
}

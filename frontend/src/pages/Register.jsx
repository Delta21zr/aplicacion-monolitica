import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      setMessage('¡Registro exitoso! Iniciando sesión...');
      setIsError(false);
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
      }
      setTimeout(() => {
        navigate('/');
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

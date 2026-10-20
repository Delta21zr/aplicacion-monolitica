import { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function ResetPassword() {
  const [step, setStep] = useState(1); // 1 = solicitar token, 2 = cambiar contrasena
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [debugToken, setDebugToken] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequestToken = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.post('http://localhost:3002/api/auth/recover', { email });
      setMessage(res.data.message || 'Se ha generado la solicitud de recuperación.');
      setIsError(false);
      if (res.data.debug_token) {
        setDebugToken(res.data.debug_token);
        setToken(res.data.debug_token);
      }
      setStep(2);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Error al procesar solicitud');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.post('http://localhost:3002/api/auth/reset', {
        token,
        new_password: newPassword,
      });
      setMessage(res.data.message || '¡Contraseña actualizada con éxito!');
      setIsError(false);
      setStep(3);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Token inválido o expirado');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Recuperar Contraseña</h2>

      {step === 1 && (
        <form onSubmit={handleRequestToken}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Ingresa tu correo y te enviaremos las instrucciones con un token para restablecer tu contraseña.
          </p>
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
          <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Enviando...' : 'Solicitar Enlace'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleResetPassword}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Ingresa el token de recuperación recibido y tu nueva contraseña.
          </p>
          {debugToken && (
            <div style={{ padding: '0.75rem', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '13px', marginBottom: '1rem', border: '1px solid #bfdbfe' }}>
              <strong>Token de prueba generado:</strong> <br />
              <code>{debugToken}</code>
            </div>
          )}
          <div className="form-group">
            <label>Token de Recuperación</label>
            <input 
              type="text" 
              placeholder="mock-reset-token-..." 
              value={token} 
              onChange={(e) => setToken(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>Nueva Contraseña (mín. 6 caracteres)</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              required 
              minLength={6}
            />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Actualizando...' : 'Restablecer Contraseña'}
          </button>
        </form>
      )}

      {step === 3 && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--success-color)', fontWeight: '600', marginBottom: '1.5rem' }}>
            Tu contraseña ha sido actualizada exitosamente.
          </p>
          <Link to="/login">
            <button style={{ width: '100%' }}>Iniciar Sesión</button>
          </Link>
        </div>
      )}

      {message && step !== 3 && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: isError ? 'var(--error-color)' : 'var(--success-color)' }}>
          {message}
        </div>
      )}

      <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
        <Link to="/login" style={{ fontWeight: '500' }}>← Volver al inicio de sesión</Link>
      </p>
    </div>
  );
}

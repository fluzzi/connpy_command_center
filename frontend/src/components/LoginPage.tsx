import React, { useState } from 'react';
import { Terminal, Shield, Lock, User, AlertCircle, Cpu } from 'lucide-react';
import { api } from '../api';

interface LoginPageProps {
  onLoginSuccess: (username: string, token: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await api.login(username, password);
      if (res.token) {
        localStorage.setItem('connpy_session_token', res.token);
        localStorage.setItem('connpy_username', res.username);
        onLoginSuccess(res.username, res.token);
      } else {
        setError('Authentication failed: No token received.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    paddingLeft: '2.5rem',
    paddingRight: '1rem',
    paddingTop: '0.75rem',
    paddingBottom: '0.75rem',
    background: 'rgba(46,52,64,0.6)',
    border: '1px solid rgba(76,86,106,0.6)',
    borderRadius: '0.5rem',
    outline: 'none',
    color: '#d8dee9',
    fontSize: '0.875rem',
    fontWeight: '600',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#2e3440',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, #88c0d0 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.65,
        background: 'radial-gradient(circle at center, transparent 20%, #1a1f29 90%)',
      }} />

      {/* Glow orbs */}
      <div style={{
        position: 'absolute', top: '25%', left: '25%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'rgba(136,192,208,0.05)', filter: 'blur(100px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '25%', right: '25%',
        width: 450, height: 450, borderRadius: '50%',
        background: 'rgba(129,161,193,0.05)', filter: 'blur(120px)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 360,
        margin: '0 1rem',
        padding: '2rem',
        background: 'rgba(59,66,82,0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '1rem',
        border: '1px solid rgba(76,86,106,0.6)',
        borderTop: '2px solid #88c0d0',
        boxShadow: '0 25px 60px rgba(0,0,0,0.45), 0 0 30px rgba(136,192,208,0.05)',
        boxSizing: 'border-box',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48,
            background: '#434c5e',
            border: '1px solid rgba(136,192,208,0.3)',
            borderRadius: '0.75rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1rem',
            boxShadow: '0 0 15px rgba(136,192,208,0.1)',
          }}>
            <Cpu color="#88c0d0" size={24} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#d8dee9', fontStyle: 'italic' }}>
            Command Center
          </h1>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.625rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#81a1c1' }}>
            Secure Operator Terminal
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '1.25rem', padding: '0.75rem 1rem',
            background: 'rgba(191,97,106,0.15)',
            border: '1px solid rgba(191,97,106,0.5)',
            borderRadius: '0.5rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
            color: '#bf616a', fontSize: '0.75rem', fontWeight: 700,
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#81a1c1', marginBottom: '0.4rem' }}>
              Operator Username
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(129,161,193,0.55)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <User size={15} />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                placeholder="OPERATOR_ID"
                style={inputStyle}
                autoComplete="username"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#81a1c1', marginBottom: '0.4rem' }}>
              Access Password
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(129,161,193,0.55)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <Lock size={15} />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="••••••••••••"
                style={inputStyle}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%', marginTop: '0.5rem',
              paddingTop: '0.875rem', paddingBottom: '0.875rem',
              background: isLoading ? 'rgba(94,129,172,0.5)' : '#5e81ac',
              border: '1px solid #5e81ac',
              borderRadius: '0.5rem',
              color: '#e5e9f0',
              fontWeight: 900, fontSize: '0.7rem',
              textTransform: 'uppercase', letterSpacing: '0.15em',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              transition: 'background 0.15s, box-shadow 0.15s',
              boxShadow: '0 4px 20px rgba(94,129,172,0.2)',
            }}
            onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#81a1c1'; }}
            onMouseLeave={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#5e81ac'; }}
          >
            {isLoading ? (
              <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            ) : (
              <><Shield size={14} /> Establish Neural Link</>
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.55rem', fontWeight: 900, letterSpacing: '0.15em', color: '#4c566a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Terminal size={10} /> Authorized Operators Only
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

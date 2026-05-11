import React from 'react';
const { useState } = React;
import { supabase } from '../config';

export default function LoginScreen({ onAuth }) {
    const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        if (!email.trim() || !password) { setError('Email and password are required'); return; }
        if (mode === 'signup' && password !== confirmPassword) { setError('Passwords do not match'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

        setLoading(true);
        try {
            if (mode === 'signup') {
                const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
                if (err) throw err;
                if (data.user && !data.session) {
                    setMessage('Check your email for a confirmation link.');
                } else if (data.session) {
                    onAuth(data.session);
                }
            } else {
                const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (err) throw err;
                onAuth(data.session);
            }
        } catch (err) {
            setError(err.message || 'Authentication failed');
        }
        setLoading(false);
    };

    const inputStyle = { width: '100%', padding: '12px 16px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', color: '#e7e9ea', fontSize: '15px', outline: 'none' };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', padding: '20px' }}>
            <div style={{ width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>
                        <svg width="48" height="48" viewBox="0 0 192 192" fill="none"><rect width="192" height="192" rx="40" fill="#1d9bf0"/><text x="96" y="125" textAnchor="middle" fill="white" fontSize="90" fontWeight="bold" fontFamily="system-ui">AV</text></svg>
                    </div>
                    <h1 style={{ color: '#e7e9ea', fontSize: '24px', fontWeight: '700', margin: '8px 0 4px' }}>AV Estimator</h1>
                    <p style={{ color: '#8b98a5', fontSize: '14px' }}>{mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}</p>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" style={inputStyle} autoFocus />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
                    {mode === 'signup' && (
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" style={inputStyle} />
                    )}
                    {error && <div style={{ color: '#f87171', fontSize: '13px', padding: '8px 12px', background: '#3d1a1a', borderRadius: '6px' }}>{error}</div>}
                    {message && <div style={{ color: '#00ba7c', fontSize: '13px', padding: '8px 12px', background: '#1a3d2e', borderRadius: '6px' }}>{message}</div>}
                    <button type="submit" disabled={loading} style={{ padding: '12px', background: '#1d9bf0', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                        {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }} style={{ background: 'none', border: 'none', color: '#1d9bf0', cursor: 'pointer', fontSize: '14px' }}>
                        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
}

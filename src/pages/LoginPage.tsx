/**
 * LoginPage.tsx — Supabase email+password sign-in page for MONOLITH
 *
 * Features:
 * - Email + password form
 * - Error display with retry
 * - Redirect to / on success
 * - DAPH Decor branding
 * - Accessible (aria labels, focus management)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuthSession } from '../core/auth/useAuthSession';

export interface LoginPageProps {
  /** Override redirect target after login (default: '/') */
  redirectTo?: string;
  /** Injected navigate function (for testing without react-router) */
  onNavigate?: (path: string) => void;
}

export function LoginPage({ redirectTo = '/', onNavigate }: LoginPageProps): React.ReactElement {
  const { login, isAuthenticated, isLoading } = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      onNavigate?.(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, onNavigate]);

  // Auto-focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      setSubmitting(true);
      setError(null);

      const result = await login(email.trim(), password);

      if (result.success) {
        onNavigate?.(redirectTo);
      } else {
        setError(result.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        setSubmitting(false);
      }
    },
    [email, password, login, redirectTo, onNavigate],
  );

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} aria-label="กำลังตรวจสอบ session" />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.card} aria-label="Login form">
        {/* Logo / Branding */}
        <div style={styles.header}>
          <h1 style={styles.title}>MONOLITH</h1>
          <p style={styles.subtitle}>Manufacturing OS — DAPH Decor</p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* Email */}
        <div style={styles.field}>
          <label htmlFor="login-email" style={styles.label}>
            อีเมล
          </label>
          <input
            ref={emailRef}
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@daph.co.th"
            style={styles.input}
            disabled={submitting}
            required
          />
        </div>

        {/* Password */}
        <div style={styles.field}>
          <label htmlFor="login-password" style={styles.label}>
            รหัสผ่าน
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={styles.input}
            disabled={submitting}
            required
          />
        </div>

        {/* Submit */}
        <button type="submit" style={styles.button} disabled={submitting || !email || !password}>
          {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>

        <p style={styles.footer}>
          ลืมรหัสผ่าน? ติดต่อ Admin หรือ <span style={{ color: '#4ade80' }}>support@daph.co.th</span>
        </p>
      </form>
    </div>
  );
}

// ============================================================================
// Inline Styles (no external CSS dependency)
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  card: {
    background: '#111827',
    borderRadius: '12px',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid #1f2937',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#4ade80',
    letterSpacing: '3px',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '8px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#9ca3af',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#f3f4f6',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  button: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#4ade80',
    color: '#000',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'opacity 0.2s',
  },
  errorBox: {
    background: '#7f1d1d',
    border: '1px solid #991b1b',
    borderRadius: '8px',
    padding: '12px',
    color: '#fca5a5',
    fontSize: '13px',
    marginBottom: '20px',
  },
  footer: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '20px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #374151',
    borderTopColor: '#4ade80',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

export default LoginPage;

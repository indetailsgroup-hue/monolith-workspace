/**
 * SignIn.tsx - Email/password sign-in page (S18 L7 Slice 1)
 *
 * Minimal login gate: supabase signInWithPassword via useSessionStore.
 * supabase-js persists the session under sb-<ref>-auth-token, which the
 * factory API client (authHeaders) already reads — no extra wiring needed.
 *
 * Route: /login
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../core/auth/useSessionStore';

export function SignIn(): React.ReactElement {
  const navigate = useNavigate();
  const signIn = useSessionStore((s) => s.signIn);
  const session = useSessionStore((s) => s.session);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate('/');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-surface-3 border border-oi-border rounded-lg flex items-center justify-center">
            <span className="text-green-400 font-bold">II</span>
          </div>
          <span className="text-lg font-medium">MONOLITH</span>
        </div>

        <h1 className="text-xl font-bold mb-1">Sign in</h1>
        <p className="text-gray-400 text-sm mb-6">
          เข้าสู่ระบบเพื่อทำงานกับโปรเจกต์ของคุณ
        </p>

        {session?.user?.email && (
          <p className="text-green-400 text-sm mb-4">
            signed in as {session.user.email} —{' '}
            <Link to="/" className="underline">
              ไปหน้าหลัก
            </Link>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signin-email" className="block text-xs text-gray-400 mb-1">
              Email
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#2a2a2a] text-sm text-white focus:outline-none focus:border-green-500"
            />
          </div>

          <div>
            <label htmlFor="signin-password" className="block text-xs text-gray-400 mb-1">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#111] border border-[#2a2a2a] text-sm text-white focus:outline-none focus:border-green-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-400 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
              submitting
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-400 text-black'
            }`}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-gray-500 text-xs mt-6 text-center">
          ยังไม่มีบัญชี? ติดต่อ admin เพื่อขอสิทธิ์เข้าใช้งาน
        </p>
        <p className="text-center mt-2">
          <Link to="/" className="text-green-400 hover:underline text-xs">
            ← Back to Designer
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignIn;

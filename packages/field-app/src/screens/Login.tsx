// Login แบบ magic link (office/Sale — ADR-040 มติ 2; LINE Login มากับ Wave B)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  // LINE Login (ADR-040): authorize → callback ?code → edge fn line-login → verifyOtp
  useEffect(() => {
    const u = new URL(location.href);
    const bind = u.searchParams.get('bind');
    if (bind) { localStorage.setItem('bind_token', bind); u.searchParams.delete('bind'); history.replaceState(null, '', u.toString()); }
    const code = u.searchParams.get('code');
    if (!code) return;
    u.searchParams.delete('code'); u.searchParams.delete('state');
    history.replaceState(null, '', u.toString());
    (async () => {
      setErr('');
      try {
        const base = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(base + '/functions/v1/line-login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, redirect_uri: location.origin + location.pathname, bind_token: localStorage.getItem('bind_token') || undefined }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? 'line_login_failed');
        localStorage.removeItem('bind_token');
        const { error } = await supabase().auth.verifyOtp({ type: 'magiclink', email: j.email, token_hash: j.token_hash } as never);
        if (error) throw error;
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })();
  }, []);

  function lineLogin() {
    const cid = import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID as string | undefined;
    if (!cid) { setErr('ยังไม่ได้ตั้งค่า VITE_LINE_LOGIN_CHANNEL_ID'); return; }
    const p = new URLSearchParams({
      response_type: 'code', client_id: cid,
      redirect_uri: location.origin + location.pathname,
      state: crypto.randomUUID(), scope: 'openid profile',
    });
    location.href = 'https://access.line.me/oauth2/v2.1/authorize?' + p.toString();
  }

  async function send() {
    setErr('');
    try {
      const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
      if (error) throw error;
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>เข้าสู่ระบบ</h2>
        {sent ? <p>ส่งลิงก์เข้าอีเมลแล้วครับ ✉️ เปิดอีเมลแล้วกดลิงก์ได้เลย</p> : (
          <>
            <label>อีเมลบริษัท</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@daph.co" />
            <div style={{ height: 14 }} />
            <button className="btn btn-primary" onClick={send} disabled={!email}>ส่งลิงก์เข้าอีเมล</button>
            <button className="btn" style={{ background: '#06C755', color: '#fff', marginTop: 10 }} onClick={lineLogin}>เข้าด้วย LINE</button>
            {err && <p className="err">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

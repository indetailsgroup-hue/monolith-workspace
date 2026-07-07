// Login แบบ magic link (office/Sale — ADR-040 มติ 2; LINE Login มากับ Wave B)
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

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
            {err && <p className="err">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

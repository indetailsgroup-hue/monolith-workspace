// Supabase client ตัวแรกของ frontend ทั้ง workspace (ADR-040)
// ตั้งค่า: .env → VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (GitHub Pages CI ใส่ผ่าน secrets)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  client = createClient(url, key);
  return client;
}

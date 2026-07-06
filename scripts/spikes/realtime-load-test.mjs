#!/usr/bin/env node
// Feature: installation-pm — Spike 0.4: Supabase Realtime load test (D-7)
// การใช้ Realtime "ครั้งแรกในเรโป" — ต้องพิสูจน์ก่อนผูกกับ MVP (task 1.9 ขึ้นกับผลนี้)
//
// รูปแบบโหลดจริงตาม D-7: chat channel ต่อโปรเจกต์ (บ้าน) — บ้านละ ~16 คน (3 ช่าง×5 ห้อง + หัวหน้า 1)
// สถานการณ์ทดสอบ default: 3 บ้านพร้อมกัน × 17 client = 51 subscribers, ส่งรวม 10 msg/s, 60 วิ
//
// เกณฑ์ผ่าน (บันทึกใน spike-0.4-realtime-load-test.md):
//   delivery ≥ 99.5% · p95 latency < 2000ms · ไม่มี client หลุดถาวร (reconnect ได้)
//
// วิธีรัน (ต้องมี project ก่อน — runbook Wave2 ขั้น A):
//   npm i --no-save @supabase/supabase-js
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
//     node scripts/spikes/realtime-load-test.mjs [--channels 3] [--clients 17] [--rate 10] [--duration 60]
//
// หมายเหตุ: ใช้ broadcast (ไม่ใช่ postgres_changes) — ตรงกับดีไซน์ chat D-7 และไม่ต้องมีตารางก่อน

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] ?? 'true']);
    return acc;
  }, []),
);

const CHANNELS = Number(args.channels ?? 3); // จำนวน "บ้าน" พร้อมกัน
const CLIENTS_PER_CHANNEL = Number(args.clients ?? 17); // 16 คน + เผื่อ observer 1
const RATE_TOTAL = Number(args.rate ?? 10); // msg/s รวมทุกบ้าน
const DURATION_S = Number(args.duration ?? 60);

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('ต้องตั้ง SUPABASE_URL และ SUPABASE_ANON_KEY ก่อน (ดู header ของไฟล์นี้)');
  process.exit(2);
}

let createClient;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch {
  console.error('ยังไม่มี @supabase/supabase-js — รัน: npm i --no-save @supabase/supabase-js');
  process.exit(2);
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;

console.log(`Realtime load test: ${CHANNELS} channels × ${CLIENTS_PER_CHANNEL} clients, ${RATE_TOTAL} msg/s รวม, ${DURATION_S}s`);

const stats = { sent: 0, received: 0, latencies: [], subscribeFailures: 0, drops: 0, reconnects: 0 };
const clients = [];
const channelsByName = new Map();

// (1) subscribe ทุก client — วัดเวลาที่ทั้ง fleet พร้อม
const t0 = Date.now();
for (let c = 0; c < CHANNELS; c++) {
  const name = `inst-project-${c}`;
  for (let k = 0; k < CLIENTS_PER_CHANNEL; k++) {
    const client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } });
    clients.push(client);
    const ch = client.channel(name, { config: { broadcast: { self: true } } });
    ch.on('broadcast', { event: 'chat' }, (msg) => {
      stats.received += 1;
      const sentAt = msg?.payload?.sentAt;
      if (typeof sentAt === 'number') stats.latencies.push(Date.now() - sentAt);
    });
    await new Promise((resolve) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          stats.subscribeFailures += 1;
          resolve();
        } else if (status === 'CLOSED') stats.drops += 1;
      });
    });
    if (!channelsByName.has(name)) channelsByName.set(name, ch); // ตัวแรกของแต่ละบ้านเป็น publisher
  }
}
console.log(`subscribed ${clients.length} clients ใน ${Date.now() - t0}ms (subscribe failures: ${stats.subscribeFailures})`);

// (2) ยิงข้อความกระจายทุกบ้านตาม rate รวม
const intervalMs = 1000 / RATE_TOTAL;
const publishers = [...channelsByName.values()];
let seq = 0;
const timer = setInterval(() => {
  const ch = publishers[seq % publishers.length];
  seq += 1;
  stats.sent += 1;
  ch.send({ type: 'broadcast', event: 'chat', payload: { seq, sentAt: Date.now(), text: `ข้อความทดสอบ ${seq}` } });
}, intervalMs);

await new Promise((r) => setTimeout(r, DURATION_S * 1000));
clearInterval(timer);
await new Promise((r) => setTimeout(r, 3000)); // รอ in-flight

// (3) สรุปผลเทียบเกณฑ์
const expected = stats.sent * CLIENTS_PER_CHANNEL; // ทุก client ในบ้านเดียวกันต้องได้รับ (self=true)
const deliveryPct = expected === 0 ? 0 : (stats.received / expected) * 100;
const lat = stats.latencies.sort((a, b) => a - b);
const result = {
  sent: stats.sent,
  expectedDeliveries: expected,
  received: stats.received,
  deliveryPct: Number(deliveryPct.toFixed(2)),
  latencyMs: { p50: percentile(lat, 50), p95: percentile(lat, 95), max: lat[lat.length - 1] ?? NaN },
  subscribeFailures: stats.subscribeFailures,
  channelDrops: stats.drops,
};
console.log(JSON.stringify(result, null, 2));

const pass = deliveryPct >= 99.5 && result.latencyMs.p95 < 2000 && stats.subscribeFailures === 0;
console.log(pass ? '✅ PASS — Realtime ใช้กับ chat MVP ได้ (task 1.9 เดินต่อ)' : '❌ FAIL — MVP ใช้ LINE แทน chat in-app (ตาม fallback ใน tasks 1.9)');

for (const c of clients) await c.removeAllChannels();
process.exit(pass ? 0 : 1);

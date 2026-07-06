# Spike 0.4 — Supabase Realtime Load Test (D-7) · harness พร้อม, รอ infra

> สถานะ: 🟡 **harness เสร็จ — การรันจริงถูก block ด้วย provisioning** (runbook Wave2 ขั้น A ยังไม่ทำ — เป็นงาน ops ฝั่ง owner)
> Harness: `scripts/spikes/realtime-load-test.mjs` — รันได้ทันทีที่มี project + anon key

## ทำไมต้อง load test (D-7)

Realtime เป็น**การใช้ครั้งแรกในเรโป** — ไม่มีที่ไหนพิสูจน์มาก่อน และ task 1.9 (chat in-app) ผูกกับผลนี้:
ผ่าน → ทำ chat in-app ต่อโปรเจกต์ · ไม่ผ่าน → **MVP ใช้ LINE พอ** (fallback เขียนไว้ใน tasks 1.9 แล้ว — ไม่มีทางตัน)

## สถานการณ์ทดสอบ (จำลองโหลดจริงตาม staffing model)

- บ้านละ ~16 คน (3 ช่าง × 5 ห้อง + หัวหน้า 1) → **3 บ้านพร้อมกัน × 17 clients = 51 subscribers**
- ข้อความรวม 10 msg/s กระจายทุกบ้าน, ยิงต่อเนื่อง 60 วินาที
- ใช้ `broadcast` (ตรงดีไซน์ chat D-7 — ไม่ใช่ postgres_changes จึงไม่ต้องมีตารางก่อน)
- ปรับได้: `--channels --clients --rate --duration`

## เกณฑ์ผ่าน (ตัดสิน task 1.9)

| เกณฑ์ | ค่า |
|-------|-----|
| Delivery rate | ≥ 99.5% (sent × subscribers ในบ้านเดียวกัน) |
| Latency p95 | < 2,000ms (chat หน้างานไม่ใช่ trading — 2 วิรับได้) |
| Subscribe failures | 0 (ทั้ง fleet ต้อง SUBSCRIBED) |

## วิธีรัน (หลัง runbook A เสร็จ)

```bash
npm i --no-save @supabase/supabase-js
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
  node scripts/spikes/realtime-load-test.mjs
```

Output: JSON (sent/received/deliveryPct/p50/p95/max/failures) + verdict PASS/FAIL; exit code 0/1 ใช้ใน CI ได้

## ข้อจำกัดที่รู้ล่วงหน้า (พิจารณาตอนอ่านผล)

- Hosted Supabase มี Realtime quota ตาม plan (concurrent connections/messages per second) — ถ้า FAIL ให้ดูก่อนว่าชน quota ของ plan หรือชนความสามารถจริง
- ทดสอบจากเครื่องเดียว: latency รวม network ฝั่งเรา — รันจากเน็ตบ้าน/4G ให้เหมือนหน้างานอย่างน้อยหนึ่งรอบ
- `eventsPerSecond` client-side throttle ตั้งไว้ 20 — สูงกว่าโหลดทดสอบ ไม่บัง bottleneck จริง

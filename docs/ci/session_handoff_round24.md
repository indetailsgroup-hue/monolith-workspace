# Session Handoff Prompt — Round 24
# CI Repair: Monolith / Daph Decor AI Agent Programme
# Date: 2026-09-12

---

## คำสั่งสำหรับ Agent ใหม่

สวัสดีครับ นี่คือ Session Handoff สำหรับ **Round 24** ของการแก้ CI ใน repo `indetailsgroup-hue/monolith-workspace`

โปรดอ่านให้ครบก่อนเริ่มดำเนินการ

---

## สถานะปัจจุบัน

**HEAD commit (CI-FIX-22):** `578111bd0f274081293938cc58e1f08222d3d278`  
**Branch:** `main`  
**CI Run ล่าสุดก่อน push:** Run #1005 (`07928fdd`) — `completed failure`  
**CI Run หลัง CI-FIX-22:** ยังไม่ทราบผล — รอให้ GitHub Actions ประมวลผล

---

## ไฟล์ที่ถูก push ใน CI-FIX-22 (Round 23)

1. **`supabase/migrations/0223_organizations_add_created_at.sql`** (ใหม่)
   - `ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`
   - แก้ไข: `0180_identity_reconciliation.sql` (0/17 → คาดว่า 17/17)

2. **`supabase/tests/workflow_db_invariants.sql`** (แก้ไข 253 บรรทัด)
   - เพิ่ม `SET LOCAL session_replication_role = 'replica'` ก่อน T5 และ T8
   - เพิ่ม `SET LOCAL session_replication_role = DEFAULT` ก่อน T6 และ T15
   - แทนที่ nil UUID (`00000000-...`) ด้วย Alpha org UUID (`a1a1a1a1-0000-0000-0000-000000000001`) ทั้งหมด 8 จุด
   - แก้ไข: T5-T16/T20/T22 (23/38 → คาดว่า 38/38)

---

## งาน Round 24 — ตามลำดับความสำคัญ

### P1 (แก้ก่อน — ส่งผลต่อหลาย test)

#### 1. `supabase/tests/0176_notification_preferences_rls.sql` — 8/16

**Root cause:** Line 204: DML statement อยู่ใน nested CTE  
**Error:** `WITH clause containing a data-modifying statement must be at the top level`  
**วิธีแก้:** ดึง `WITH ... INSERT/UPDATE/DELETE` ออกมาเป็น statement ระดับ top level แยกต่างหาก

#### 2. `supabase/tests/0176_secdef_medium_risk.sql` — 12/13

**Root cause:** Line 44: `like(text, unknown, unknown)` แบบ 3 arguments ไม่มีใน PostgreSQL  
**Error:** `function like(text, unknown, unknown) does not exist`  
**วิธีแก้:** เปลี่ยนเป็น `like(text, text)` 2-arg หรือใช้ `~` (regex) หรือ `text LIKE pattern`

---

### P2 (แก้ต่อ — ละ 1 test ต่อ suite)

#### 3. `supabase/tests/0177_audit_log_insert_hardening.sql` — T9 (10/11)

**Root cause:** Function `rpc_write_audit_log` ยังมี PUBLIC EXECUTE grant  
**วิธีแก้:** เพิ่มใน migration หรือ test fixture:
```sql
REVOKE EXECUTE ON FUNCTION public.rpc_write_audit_log FROM PUBLIC;
```

#### 4. `supabase/tests/0178_notification_platform_metrics_rls.sql` — T4 (9/10)

**Root cause:** Policy `digest_queue_own_user_select` USING clause ไม่มี `auth.uid()`  
**วิธีแก้:** ตรวจ policy definition ใน migration แล้วแก้ `USING` ให้มี `(user_id = auth.uid())`

#### 5. `supabase/tests/0181_revoke_sweep.sql` — T16 (17/18)

**Root cause:** Function `validate_audit_log_insert` มี 3 grants — T16 expect 0  
**วิธีแก้:** เพิ่ม `REVOKE ALL ON FUNCTION public.validate_audit_log_insert FROM PUBLIC;` ใน migration

---

### P3 (แก้ทีหลัง — ผลกระทบเล็กน้อย)

#### 6. `supabase/tests/0182_audit_logs_org_id_hardening.sql` — T12-T13 (11/13)

**Root cause:** Column `resource_type` ไม่มีใน `audit_logs`  
**วิธีแก้:** สร้าง migration เพิ่ม column:
```sql
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT;
```

#### 7. `supabase/tests/0186_critical_tables_rls.sql` — T20 (19/20)

**Root cause:** Alpha user ไม่มี row ใน `org_members`  
**วิธีแก้:** เพิ่ม fixture INSERT ใน test file:
```sql
INSERT INTO public.org_members (id, org_id, user_id, role, is_active)
VALUES (gen_random_uuid(), 'a1a1a1a1-0000-0000-0000-000000000001',
        'a1a1a1a1-0000-0000-0001-000000000002', 'ADMIN', true)
ON CONFLICT DO NOTHING;
```

#### 8. `supabase/tests/0187_installation_domain_rls.sql` — T53 (52/53)

**Root cause:** Alpha user ไม่มี row ใน `org_members` (เหมือนกับ 0186)  
**วิธีแก้:** เพิ่ม fixture INSERT เดียวกัน

#### 9. `supabase/tests/0189_line_oa_domain_rls.sql` — T49 (48/49)

**Root cause:** Beta user ไม่มี row ใน `org_members`  
**วิธีแก้:** เพิ่ม fixture INSERT สำหรับ Beta user:
```sql
INSERT INTO public.org_members (id, org_id, user_id, role, is_active)
VALUES (gen_random_uuid(), 'b2b2b2b2-0000-0000-0000-000000000001',
        'b2b2b2b2-0000-0000-0001-000000000002', 'ADMIN', true)
ON CONFLICT DO NOTHING;
```

---

## Key References

### GitHub
- **Repo:** `https://github.com/indetailsgroup-hue/monolith-workspace` — branch `main`
- **PAT (ใช้งานได้):** `[PAT_REDACTED — see repo Secrets or team lead]`
- **PAT หมดอายุ (ห้ามใช้):** `[OLD_PAT_EXPIRED]` → "Bad credentials"
- **Workflow id:** `344662565`

### Commits
| Commit | คำอธิบาย |
|---|---|
| `578111bd` | CI-FIX-22 (HEAD) — 0223 migration + workflow_db_invariants fix |
| `07928fdd` | CI-FIX-21b — org_members Beta fixture |
| `8ff9b3a2` | CI-FIX-21 — 5 files: 0221/0222 migration + 0179/0183/0188 tests |

### Suites ที่ PASS แล้ว (อย่าแตะ)
- `0179_not_null_sentinel_backfill.sql` ✅ 26/26
- `0183_baseline_schema.sql` ✅ 13/13
- `0183_rollback_verification.sql` ✅ 12/12
- `0188_factory_domain_rls.sql` ✅ 25/25

---

## Sentinel UUIDs (อ้างอิงเสมอ)

| ชื่อ | UUID |
|---|---|
| Alpha org | `a1a1a1a1-0000-0000-0000-000000000001` |
| Alpha user | `a1a1a1a1-0000-0000-0001-000000000002` |
| Beta org | `b2b2b2b2-0000-0000-0000-000000000001` |
| Beta user | `b2b2b2b2-0000-0000-0001-000000000002` |

---

## Schema Facts ที่ยืนยันแล้ว

- `organizations`: columns = `id, name, plan, max_jobs_per_month (INT NOT NULL DEFAULT 10), max_users (INT NOT NULL DEFAULT 2), created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW() — เพิ่งสร้างโดย 0223)`
- `org_members`: `id UUID PK, org_id UUID NOT NULL FK, user_id UUID (nullable), role TEXT NOT NULL DEFAULT 'VIEWER', is_active BOOLEAN NOT NULL DEFAULT true`
- `get_user_org_id()`: `SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1`
- `receipts_tenant_isolation` policy: `USING (org_id = public.get_user_org_id())` — สร้างโดย migration 0190
- pgTAP ไม่มี: `policy_exists()`, `hasnt_policy()`, `has_policy()`, `has_row_level_security()`, `relrowsecurity()`
- `session_replication_role = replica` → bypass FK triggers และ DEFAULT user triggers (CHECK constraints ยังทำงาน)
- Migration number ถัดไปที่ว่าง: **0224**

---

## ขั้นตอนเริ่มต้น Round 24

1. ดึงผล CI Run ล่าสุด (หลัง CI-FIX-22 commit `578111bd`) เพื่อยืนยันว่า 0180 และ workflow_db_invariants ผ่านแล้ว
2. ระบุ suites ที่ยังล้มเหลว
3. แก้ตามลำดับ P1 → P2 → P3 ข้างบน
4. Push commit `CI-FIX-23` พร้อม message อธิบาย suite ที่แก้

---

*Generated by CI Repair Agent — Round 23 — 2026-09-12*

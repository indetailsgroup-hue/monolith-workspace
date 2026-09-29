# Security Review — RLS Policies
## `20260828_multi_tenant_schema.sql` · MONOLITH v16.0

> Reviewed: 2026-08-28  
> Scope: Row-Level Security policies, helper functions, tenant isolation

---

## สรุป Severity

| # | Issue | Severity | บรรทัด |
|---|-------|----------|--------|
| 1 | `org_invitations` ไม่มี RLS เลย | 🔴 Critical | — |
| 2 | `get_user_org_id()` คืนค่า LIMIT 1 — พัง multi-org | 🔴 Critical | 116 |
| 3 | `organizations` ขาด INSERT + DELETE policy | 🟠 High | 120–130 |
| 4 | ADMIN สามารถลบ OWNER ออกจาก org ได้ | 🟠 High | 140–144 |
| 5 | Write ops บน jobs/quotations ไม่ตรวจ role | 🟡 Medium | 148–179 |
| 6 | ไม่มี Audit trail บน sensitive tables | 🟡 Medium | — |
| 7 | Trial expiry ไม่ enforce ที่ DB level | 🟡 Medium | — |
| 8 | `_tenant_insert` policies ซ้ำซ้อน | 🔵 Low | 151–179 |
| 9 | Policy บาง table ไม่ใช้ helper function | 🔵 Low | 123–141 |

---

## 🔴 Critical

### Issue 1 — `org_invitations` ไม่มี RLS

```sql
-- สร้าง table แต่ไม่มี:
-- ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;
-- และไม่มี policy ใดเลย
```

**ผลกระทบ:** ทุก authenticated user สามารถ `SELECT`, `INSERT`, `UPDATE`, `DELETE` ใน `org_invitations` ของทุก org ได้ โดยไม่มีข้อจำกัด เป็นช่องโหว่ร้ายแรงที่สุดในไฟล์นี้

**แก้ไข:**
```sql
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- ดู invitation ของ org ตัวเอง (ADMIN ขึ้นไป)
CREATE POLICY "invitations_select_own_org" ON public.org_invitations
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- สร้าง invitation ได้เฉพาะ ADMIN/OWNER
CREATE POLICY "invitations_insert_admin" ON public.org_invitations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );

-- ยกเลิก invitation ได้เฉพาะ ADMIN/OWNER
CREATE POLICY "invitations_update_admin" ON public.org_invitations
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );

-- Accept invitation: เฉพาะ invitee คนนั้นเอง (email match)
CREATE POLICY "invitations_accept_invitee" ON public.org_invitations
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND status = 'PENDING'
  );
```

---

### Issue 2 — `get_user_org_id()` คืนค่า `LIMIT 1` พังสำหรับ multi-org users

```sql
-- บรรทัด 112–117
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;   -- ⚠️ ปัญหา: user ใน 2 orgs จะได้ org แรกที่ค้นเจอเสมอ
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**ผลกระทบ:**
- User ที่อยู่ใน 2 org ขึ้นไป เมื่อ switch org ใน UI แต่ฟังก์ชันนี้จะยังคืน org เดิม (ตาม physical order ของ index)
- ทำให้ RLS ไม่สอดคล้องกับ org ที่ user กำลัง active อยู่จริง
- อาจนำไปสู่การเห็นข้อมูลข้าม org หรือ write ไปยัง org ผิดได้

**แก้ไข — ใช้ `app.current_org_id` session variable:**
```sql
-- ฟังก์ชันใหม่อ่านจาก session variable
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- อ่านค่าที่ app set ไว้ใน session
  v_org_id := current_setting('app.current_org_id', true)::UUID;

  -- ตรวจว่า user จริงๆ เป็นสมาชิก org นั้น (ป้องกัน session tampering)
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id = v_org_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'TENANT_ISOLATION: user is not a member of org %', v_org_id;
  END IF;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**ฝั่ง Application (TypeScript) — set session variable เมื่อ switch org:**
```typescript
// tenantStore.ts → setCurrentOrg / switchOrg
async function setOrgSession(orgId: string) {
  await supabase.rpc('set_config', {
    setting_name: 'app.current_org_id',
    new_value: orgId,
    is_local: true,   // scoped to current transaction
  });
}
```

---

## 🟠 High

### Issue 3 — `organizations` ขาด INSERT และ DELETE policy

```sql
-- มีแค่ SELECT และ UPDATE
CREATE POLICY "org_select_own" ON public.organizations FOR SELECT ...
CREATE POLICY "org_update_admin" ON public.organizations FOR UPDATE ...

-- ❌ ไม่มี FOR INSERT → ถ้า RLS enabled + ไม่มี INSERT policy = ทุกคน insert ไม่ได้
-- ❌ ไม่มี FOR DELETE → ถ้ามี bug ใน app, OWNER อาจลบ org ตัวเองโดยไม่มี DB guard
```

**แก้ไข:**
```sql
-- INSERT: อนุญาตให้ authenticated user สร้าง org ได้ (onboarding flow)
-- org_id ต้องสอดคล้องกับ UUID ที่ generate ฝั่ง server
CREATE POLICY "org_insert_authenticated" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: ล็อก — ไม่อนุญาตลบผ่าน client โดยตรง (ต้องผ่าน Edge Function เท่านั้น)
CREATE POLICY "org_delete_deny_all" ON public.organizations
  FOR DELETE USING (false);
```

---

### Issue 4 — ADMIN สามารถลบ OWNER ออกจาก org ได้

```sql
-- บรรทัด 140–144
CREATE POLICY "members_manage_admin" ON public.org_members
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND is_active = true
    )
  );
```

**ผลกระทบ:**
- ADMIN สามารถ `DELETE` หรือ `UPDATE role` ของ OWNER ได้
- OWNER อาจ deactivate ตัวเอง ทำให้ org ไม่มี owner
- User สามารถแก้ role ของตัวเองได้ (privilege escalation)

**แก้ไข — แยก policy ให้ละเอียดขึ้น:**
```sql
-- ลบ policy เดิม
DROP POLICY IF EXISTS "members_manage_admin" ON public.org_members;

-- SELECT: ทุกคนในองค์กรเดียวกันมองเห็น
-- (ใช้ members_select_same_org ที่มีอยู่แล้ว)

-- INSERT (invite acceptance): OWNER/ADMIN เพิ่มสมาชิกได้
CREATE POLICY "members_insert_admin" ON public.org_members
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );

-- UPDATE: OWNER/ADMIN แก้ role คนอื่นได้ แต่ห้ามแตะ OWNER และห้ามแก้ตัวเอง
CREATE POLICY "members_update_admin" ON public.org_members
  FOR UPDATE USING (
    -- ผู้แก้ต้องเป็น OWNER หรือ ADMIN ในองค์กรเดียวกัน
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
    -- ห้ามแก้ record ของ OWNER (เฉพาะ OWNER แก้ตัวเองได้)
    AND (role != 'OWNER' OR user_id = auth.uid())
    -- ห้าม ADMIN แก้ตัวเองเพื่อ escalate role
    AND NOT (
      user_id = auth.uid()
      AND (SELECT role FROM public.org_members WHERE user_id = auth.uid() AND org_id = org_members.org_id) = 'ADMIN'
    )
  );

-- DELETE: OWNER เท่านั้นที่ลบสมาชิกได้ ยกเว้นลบตัวเอง (ต้องมี owner อื่นก่อน)
CREATE POLICY "members_delete_owner_only" ON public.org_members
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role = 'OWNER'
        AND is_active = true
    )
    AND user_id != auth.uid()  -- ห้าม OWNER ลบตัวเอง
  );
```

---

## 🟡 Medium

### Issue 5 — Write operations ไม่ตรวจ Role (jobs, quotations, invoices, ledger)

```sql
-- policies ปัจจุบัน: ตรวจแค่ org_id
CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  USING (org_id = public.get_user_org_id());
```

**ผลกระทบ:** VIEWER (role ต่ำสุด) สามารถ UPDATE หรือ DELETE job ได้ ตราบที่อยู่ใน org เดียวกัน

**แก้ไข — แยก policy ตาม operation:**
```sql
DROP POLICY IF EXISTS "jobs_tenant_isolation" ON public.jobs;
DROP POLICY IF EXISTS "jobs_tenant_insert" ON public.jobs;

-- SELECT: ทุกคนใน org เห็นได้
CREATE POLICY "jobs_select_org" ON public.jobs
  FOR SELECT USING (org_id = public.get_user_org_id());

-- INSERT: DESIGNER, ADMIN, OWNER เท่านั้น
CREATE POLICY "jobs_insert_role" ON public.jobs
  FOR INSERT WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND role IN ('OWNER', 'ADMIN', 'DESIGNER')
        AND is_active = true
    )
  );

-- UPDATE: DESIGNER, FACTORY, ADMIN, OWNER (ตาม permission matrix)
CREATE POLICY "jobs_update_role" ON public.jobs
  FOR UPDATE USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND role IN ('OWNER', 'ADMIN', 'DESIGNER', 'FACTORY')
        AND is_active = true
    )
  );

-- DELETE: ADMIN, OWNER เท่านั้น
CREATE POLICY "jobs_delete_admin" ON public.jobs
  FOR DELETE USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );
```

> ทำแบบเดียวกันสำหรับ `quotations`, `invoices`, `ledger_entries` โดยปรับ role ให้เหมาะสม

---

### Issue 6 — ไม่มี Audit Trail

ไม่มี trigger บันทึกว่าใครแก้ไขอะไรในตาราง sensitive (`org_members`, `jobs`, status transitions)

**แก้ไข — เพิ่ม audit log table + trigger:**
```sql
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID,
  operation TEXT NOT NULL,  -- INSERT / UPDATE / DELETE
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  org_id UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log(table_name, record_id, operation, old_data, new_data, performed_by, org_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.org_id, OLD.org_id),  -- adjust per table PK name
    TG_OP,
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::jsonb END,
    auth.uid(),
    COALESCE(NEW.org_id, OLD.org_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to sensitive tables
CREATE TRIGGER trg_audit_org_members
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER trg_audit_jobs
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
```

---

### Issue 7 — Trial Expiry ไม่ Enforce ที่ DB Level

`trial_ends_at` เก็บอยู่ใน organizations แต่ไม่มี DB constraint ที่บล็อก operation เมื่อ trial หมดอายุ

**แก้ไข — เพิ่ม helper function + ใช้ใน policies:**
```sql
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE org_id = p_org_id
      AND status IN ('ACTIVE', 'TRIAL')
      AND (status != 'TRIAL' OR trial_ends_at > now())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- เพิ่มเงื่อนไขใน insert policies
-- ตัวอย่าง jobs
CREATE POLICY "jobs_insert_role" ON public.jobs
  FOR INSERT WITH CHECK (
    org_id = public.get_user_org_id()
    AND public.is_org_active(public.get_user_org_id())
    -- ... role check ...
  );
```

---

## 🔵 Low / Maintenance

### Issue 8 — `_tenant_insert` policies ซ้ำซ้อน

```sql
-- jobs_tenant_isolation ไม่มี FOR clause = FOR ALL
-- ครอบคลุม INSERT อยู่แล้วผ่าน USING → WITH CHECK promotion
-- jobs_tenant_insert จึงซ้ำซ้อน (ไม่เป็นอันตราย แต่สับสน)
```

เมื่อแก้เป็น policy แยกตาม operation (Issue 5) ปัญหานี้จะหายไปเอง

---

### Issue 9 — ใช้ inline subquery แทน helper function ไม่สม่ำเสมอ

```sql
-- org_select_own, org_update_admin, members_select_same_org ใช้ subquery โดยตรง
-- jobs/quotations/invoices/ledger ใช้ get_user_org_id()
```

ควรใช้ `get_user_org_id()` ให้สม่ำเสมอ เพื่อให้แก้ไขได้ที่จุดเดียว

---

## Checklist สรุป

```
[ ] เพิ่ม RLS + policies ให้ org_invitations  ← Critical
[ ] แก้ get_user_org_id() ให้รองรับ multi-org ← Critical
[ ] เพิ่ม INSERT + DELETE policy ให้ organizations ← High
[ ] ป้องกัน ADMIN ลบ/แก้ OWNER ← High
[ ] แยก SELECT/INSERT/UPDATE/DELETE policy พร้อม role check ← Medium
[ ] เพิ่ม audit_log table + triggers ← Medium
[ ] เพิ่ม is_org_active() check ใน write policies ← Medium
[ ] ลบ _tenant_insert policies ที่ซ้ำซ้อน ← Low
[ ] ทำ helper function ให้สม่ำเสมอ ← Low
```

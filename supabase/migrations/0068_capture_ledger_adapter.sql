-- Migration: capture_ledger_adapter — monolith-accounting (L3 commit-target adapter #2 — 'ledger')
-- Depends on: 0063 (rpc_capture_promote + Work_Item branch), 0066 (rpc_post_journal_entry), 0067 (expense_category_map), C12
--
-- L3 adapter #2: promote ของ capture_type ที่ commit_target='ledger' (expense_document) → post journal จริง
--   ผ่าน rpc_post_journal_entry (reuse-not-fork; ไม่เขียน ledger เอง). posted ทันที (single-gate:
--   verify=approve เป็น human gate แล้ว, ไม่ double-gate — G-4 owner decision).
-- posting template (G-4):
--   Dr 5xxx expense(category)    = total − vat
--   Dr 1040 ภาษีซื้อ(VAT)         = vat            (ถ้า vat > 0)
--       Cr 2030 WHT ค้างนำส่ง      = wht            (ถ้า wht > 0)
--       Cr <credit> (2010 default / 1010 ถ้า cash) = total − wht
--   → Σdebit = total = Σcredit (balanced ทุกกรณี — บังคับซ้ำใน rpc_post_journal_entry, ACC-1).
-- fail-safe no-guess: category ไม่พบใน expense_category_map → raise → ทั้ง tx (รวม emit) rollback (atomic ACC).
-- รักษา branch 'Work_Item complete' (0063) ครบถ้วน — reuse-not-fork.

create or replace function public.rpc_capture_promote(
  p_id uuid,
  p_linked_entity_type text default null,
  p_linked_entity_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_status public.capture_status;
  v_type text;
  v_site text;
  v_payload jsonb;
  v_commit_target text;
  v_wi_version int;
  v_complete_result text;
  -- ledger adapter locals
  v_total numeric;
  v_vat numeric;
  v_wht numeric;
  v_category text;
  v_payment_method text;
  v_expense_account text;
  v_credit_account text;
  v_entry_date date;
  v_vat_amount numeric;
  v_wht_amount numeric;
  v_expense_amount numeric;
  v_credit_amount numeric;
  v_lines jsonb;
  v_journal_id uuid;
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select status, capture_type, site_code, ai_payload
    into v_status, v_type, v_site, v_payload
  from public.capture_artifact where id = p_id for update;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;

  if v_status = 'emitted' then
    return 'emitted';  -- idempotent: ไม่ commit ซ้ำ
  end if;
  if v_status <> 'approved' then
    raise exception 'capture: cannot promote status % (approve-before-promote)', v_status using errcode = 'check_violation';
  end if;
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to promote' using errcode = 'insufficient_privilege';
  end if;

  select commit_target into v_commit_target from public.capture_type_config where capture_type = v_type;

  -- mark emitted + link (no-commit-until-emitted: business-layer เปลี่ยนหลังจุดนี้)
  update public.capture_artifact
    set status = 'emitted', linked_entity_type = p_linked_entity_type, linked_entity_id = p_linked_entity_id
    where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'emit', v_principal, 'approved', 'emitted',
    jsonb_build_object('commit_target', v_commit_target, 'linked_entity_type', p_linked_entity_type, 'linked_entity_id', p_linked_entity_id));

  -- L3 commit-target adapter #1: 'Work_Item complete' → เรียก rpc_complete_work_item จริง (atomic ใน tx เดียว)
  if v_commit_target = 'Work_Item complete' then
    if p_linked_entity_type is distinct from 'work_item' or p_linked_entity_id is null then
      raise exception 'capture: Work_Item complete requires linked_entity_type=work_item + linked_entity_id'
        using errcode = 'check_violation';
    end if;
    select version into v_wi_version from public.work_item where id = p_linked_entity_id for update;
    if not found then
      raise exception 'capture: linked work_item % not found', p_linked_entity_id using errcode = 'no_data_found';
    end if;
    -- complete จริง; ถ้า work_item ยังไม่ถึงขั้นสุดท้าย/gate ค้าง → raise → ทั้ง tx (รวม emit) rollback
    v_complete_result := public.rpc_complete_work_item(p_linked_entity_id, v_wi_version);
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'work_item_id', p_linked_entity_id, 'complete_result', v_complete_result));

  -- L3 commit-target adapter #2: 'ledger' → post journal จริง (expense→double-entry)
  elsif v_commit_target = 'ledger' then
    v_total := coalesce((v_payload->>'total')::numeric, 0);
    v_vat := coalesce((v_payload->>'vat')::numeric, 0);
    v_wht := coalesce((v_payload->>'wht')::numeric, 0);
    v_category := v_payload->>'category';
    v_payment_method := v_payload->>'payment_method';

    -- fail-safe no-guess: ข้อมูลหลักต้องครบ (ไม่เดา/ไม่แต่งยอด)
    if v_total <= 0 then
      raise exception 'ledger adapter: total ต้อง > 0 (ได้ %) — fail-safe no-guess', v_total using errcode = 'check_violation';
    end if;
    if v_vat < 0 or v_wht < 0 then
      raise exception 'ledger adapter: vat/wht ต้อง >= 0' using errcode = 'check_violation';
    end if;
    if v_category is null or v_category = '' then
      raise exception 'ledger adapter: category ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;

    -- category → expense account (config-driven; ไม่พบ → raise, rollback emit)
    select account_code into v_expense_account
      from public.expense_category_map where category = v_category and active;
    if v_expense_account is null then
      raise exception 'ledger adapter: category % ไม่พบใน expense_category_map (fail-safe no-guess)', v_category
        using errcode = 'no_data_found';
    end if;

    -- credit account: cash → 1010 เงินสด; อื่น ๆ/ว่าง → 2010 เจ้าหนี้ (default)
    v_credit_account := case when v_payment_method = 'cash' then '1010' else '2010' end;

    -- entry_date = วันที่เอกสาร (doc_date) ถ้าสกัดได้ (N5 fix: ลง period ให้ถูก); ไม่มี → วันนี้.
    --   doc_date ผิดรูป → cast raise (fail-safe no-guess, rollback รวม emit).
    if v_payload ? 'doc_date' and coalesce(v_payload->>'doc_date', '') <> '' then
      v_entry_date := (v_payload->>'doc_date')::date;
    else
      v_entry_date := (timezone('utc', now()))::date;
    end if;

    -- posting template (G-4): expense=total−vat, VAT=vat, [WHT=wht].
    -- credit (payable/cash) = balancing plug = Σdebit − wht → รับประกัน Σdebit=Σcredit ถึงสตางค์
    --   (N2 fix: ไม่ปัด total−wht แยก ป้องกัน rounding mismatch ทำ legit expense ตก).
    v_vat_amount := round(v_vat, 2);
    v_wht_amount := round(v_wht, 2);
    v_expense_amount := round(v_total, 2) - v_vat_amount;
    v_credit_amount := v_expense_amount + v_vat_amount - v_wht_amount;
    if v_expense_amount < 0 then
      raise exception 'ledger adapter: vat (%) มากกว่า total (%) — ข้อมูลผิด', v_vat, v_total using errcode = 'check_violation';
    end if;
    if v_credit_amount <= 0 then
      raise exception 'ledger adapter: wht (%) >= ยอดสุทธิ — ข้อมูลผิด', v_wht using errcode = 'check_violation';
    end if;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_expense_account, 'debit', v_expense_amount, 'credit', 0)
    );
    if v_vat_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code', '1040', 'debit', v_vat_amount, 'credit', 0));
    end if;
    if v_wht_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2030', 'debit', 0, 'credit', v_wht_amount));
    end if;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_credit_account, 'debit', 0, 'credit', v_credit_amount));

    -- post journal (posted ทันที — single-gate). rpc_post_journal_entry บังคับ Σdebit=Σcredit อีกชั้น (ACC-1).
    -- หมายเหตุ: rpc_post_journal_entry ต้องการ governance/finance role → expense→ledger commit เป็น governance-gated
    --   (ถ้า role ไม่พอ → raise → rollback รวม emit; atomic).
    v_journal_id := public.rpc_post_journal_entry(
      'internal',
      v_entry_date,
      format('expense capture %s — %s', p_id, v_category),
      v_lines,
      'THB',
      'posted'::public.ledger_entry_status,
      v_site,
      jsonb_build_object('capture_artifact_id', p_id, 'capture_type', v_type)
    );

    -- link journal entry กลับเข้า artifact (provenance สองทาง)
    update public.capture_artifact
      set linked_entity_type = 'journal_entry', linked_entity_id = v_journal_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'journal_entry_id', v_journal_id,
        'total', v_total, 'vat', v_vat, 'wht', v_wht, 'category', v_category,
        'expense_account', v_expense_account, 'credit_account', v_credit_account));
  end if;

  return 'emitted';
end;
$$;

revoke all on function public.rpc_capture_promote(uuid, text, uuid) from public;

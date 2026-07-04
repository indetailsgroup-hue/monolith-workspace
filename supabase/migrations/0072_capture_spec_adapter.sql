-- Migration: capture_spec_adapter — monolith-accounting (L3 commit-target adapter #4 — 'Released_Spec')
-- Depends on: 0070 (rpc_capture_promote + Work_Item/ledger/costing), 0071 (released_spec), C12
--
-- L3 adapter #4: promote ของ spec_draft (commit_target='Released_Spec') → release spec เข้า Spec Bible:
--   บังคับ gate_confirmed=true (fail-safe: false/ว่าง → raise, ปล่อยแบบยังไม่ผ่าน gate ไม่ได้).
--   versioning ต่อ bible_code: มี released เดิม → supersede (chain) + version+1; ไม่มี → version 1.
-- รักษา branch Work_Item complete (0063) + ledger (0068) + actual_purchase_price (0070) ครบ — reuse-not-fork.

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
  -- costing adapter locals
  v_material text;
  v_qty numeric;
  v_price numeric;
  v_po_ref text;
  v_spec_match boolean;
  v_material_code text;
  v_price_id uuid;
  v_now timestamptz := timezone('utc', now());
  -- spec adapter locals
  v_bible_code text;
  v_function text;
  v_dimension jsonb;
  v_gate_confirmed boolean;
  v_prev_spec_id uuid;
  v_prev_version int;
  v_spec_id uuid;
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

    if v_total <= 0 then
      raise exception 'ledger adapter: total ต้อง > 0 (ได้ %) — fail-safe no-guess', v_total using errcode = 'check_violation';
    end if;
    if v_vat < 0 or v_wht < 0 then
      raise exception 'ledger adapter: vat/wht ต้อง >= 0' using errcode = 'check_violation';
    end if;
    if v_category is null or v_category = '' then
      raise exception 'ledger adapter: category ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;

    select account_code into v_expense_account
      from public.expense_category_map where category = v_category and active;
    if v_expense_account is null then
      raise exception 'ledger adapter: category % ไม่พบใน expense_category_map (fail-safe no-guess)', v_category
        using errcode = 'no_data_found';
    end if;

    v_credit_account := case when v_payment_method = 'cash' then '1010' else '2010' end;

    if v_payload ? 'doc_date' and coalesce(v_payload->>'doc_date', '') <> '' then
      v_entry_date := (v_payload->>'doc_date')::date;
    else
      v_entry_date := (timezone('utc', now()))::date;
    end if;

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

    update public.capture_artifact
      set linked_entity_type = 'journal_entry', linked_entity_id = v_journal_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'journal_entry_id', v_journal_id,
        'total', v_total, 'vat', v_vat, 'wht', v_wht, 'category', v_category,
        'expense_account', v_expense_account, 'credit_account', v_credit_account));

  -- L3 commit-target adapter #3: 'actual_purchase_price' → บันทึกราคาซื้อจริง + moving-avg costing
  elsif v_commit_target = 'actual_purchase_price' then
    v_material := v_payload->>'material';
    v_qty := coalesce((v_payload->>'qty')::numeric, 0);
    v_price := coalesce((v_payload->>'price')::numeric, -1);
    v_po_ref := v_payload->>'po_ref';
    v_spec_match := (v_payload->>'spec_match')::boolean;

    if v_material is null or v_material = '' then
      raise exception 'costing adapter: material ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_price < 0 then
      raise exception 'costing adapter: price ไม่ถูกต้อง/ไม่ได้ส่งมา — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_qty <= 0 then
      raise exception 'costing adapter: qty ต้อง > 0 (ได้ %) — fail-safe no-guess', v_qty using errcode = 'check_violation';
    end if;

    insert into public.material_master
      (material_code, name, unit, last_purchase_price, moving_avg_price, total_received_qty, last_purchased_at)
    values
      ('MAT-' || substr(md5(v_material), 1, 8), v_material, 'unit', v_price, v_price, v_qty, v_now)
    on conflict (name) do update set
      last_purchase_price = v_price,
      moving_avg_price = round(
        (public.material_master.total_received_qty * public.material_master.moving_avg_price + v_qty * v_price)
        / nullif(public.material_master.total_received_qty + v_qty, 0), 4),
      total_received_qty = public.material_master.total_received_qty + v_qty,
      last_purchased_at = v_now
    returning material_code into v_material_code;

    insert into public.material_purchase_price
      (material_code, unit_price, qty, total, po_ref, spec_match, source_capture_id, site_code, received_by)
    values
      (v_material_code, v_price, v_qty, round(v_price * v_qty, 2), v_po_ref, v_spec_match, p_id, v_site, v_principal)
    returning id into v_price_id;

    update public.capture_artifact
      set linked_entity_type = 'material_purchase_price', linked_entity_id = v_price_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'material_code', v_material_code, 'price_id', v_price_id,
        'unit_price', v_price, 'qty', v_qty, 'po_ref', v_po_ref, 'spec_match', v_spec_match));

  -- L3 commit-target adapter #4: 'Released_Spec' → release spec เข้า Spec Bible (gate + versioning)
  elsif v_commit_target = 'Released_Spec' then
    v_bible_code := v_payload->>'bible_code';
    v_function := v_payload->>'function';
    v_dimension := v_payload->'dimension';
    v_gate_confirmed := (v_payload->>'gate_confirmed')::boolean;

    -- fail-safe no-guess: bible_code + dimension ต้องครบ; gate ต้องยืนยัน (true) ก่อน release
    if v_bible_code is null or v_bible_code = '' then
      raise exception 'spec adapter: bible_code ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_dimension is null or jsonb_typeof(v_dimension) <> 'object' or v_dimension = '{}'::jsonb then
      raise exception 'spec adapter: dimension ว่าง/ไม่ครบ — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_gate_confirmed is distinct from true then
      raise exception 'spec adapter: gate_confirmed ต้อง = true ก่อน release (แบบยังไม่ผ่าน gate)'
        using errcode = 'check_violation';
    end if;

    -- versioning: มี released เดิมของ bible_code → supersede + version+1 (lock กัน race)
    select id, version into v_prev_spec_id, v_prev_version
      from public.released_spec where bible_code = v_bible_code and status = 'released' for update;

    -- supersede ตัวเก่าก่อน (เคลียร์ partial unique ux_released_spec_active ก่อน insert ตัวใหม่)
    if v_prev_spec_id is not null then
      update public.released_spec set status = 'superseded' where id = v_prev_spec_id;
    end if;

    insert into public.released_spec
      (bible_code, version, function, dimension, status, source_capture_id, site_code, released_by)
    values
      (v_bible_code, coalesce(v_prev_version, 0) + 1, v_function, v_dimension, 'released', p_id, v_site, v_principal)
    returning id into v_spec_id;

    -- ผูก chain: เก่า.superseded_by = ใหม่ (หลัง insert เพราะ FK อ้าง id ใหม่)
    if v_prev_spec_id is not null then
      update public.released_spec set superseded_by = v_spec_id where id = v_prev_spec_id;
    end if;

    update public.capture_artifact
      set linked_entity_type = 'released_spec', linked_entity_id = v_spec_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'released_spec_id', v_spec_id, 'bible_code', v_bible_code,
        'version', coalesce(v_prev_version, 0) + 1, 'superseded', v_prev_spec_id));
  end if;

  return 'emitted';
end;
$$;

revoke all on function public.rpc_capture_promote(uuid, text, uuid) from public;

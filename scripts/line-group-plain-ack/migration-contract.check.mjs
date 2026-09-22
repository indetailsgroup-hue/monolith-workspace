import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(root, 'supabase/migrations/20270328_line_group_plain_ack.sql');

test('port preserves the latest baseline group handler outside the acknowledgement block', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const baseline = await readFile(resolve(root, 'supabase/migrations/0177_field_purchase_line_flow.sql'), 'utf8');
  const handler = source => source.match(/create or replace function public\.fn_line_handle_group_event\([\s\S]*?\$\$;/i)?.[0].replace(/\r\n/g, '\n');
  const actual = handler(sql)?.replace(/        -- BEGIN plain-ack port[\s\S]*?        -- END plain-ack port\n/, '');
  assert.ok(actual === handler(baseline), 'non-acknowledgement handler behavior must remain byte-for-byte baseline 0177');
  assert.ok(!/create or replace function public\.fn_line_guard_customer_group/i.test(sql), 'do not replace the existing guard');
});

test('baseline migration stages one text acknowledgement and keeps a metadata-only receipt', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /tpl_inst_group_ack/);
  assert.match(sql, /RETURN 'plain_ack_staged'/i);
  assert.match(sql, /v_group_result = 'plain_ack_staged'/);
  assert.match(sql, /case\s+when\s+v_group_result = 'plain_ack_staged'\s+then '\{\}'::jsonb\s+else v_event\s+end/i);
  assert.match(sql, /insert into public\.line_oa_message_templates\s*\(org_id,\s*template_key,\s*vertical_context/i);
  assert.match(sql, /'00000000-0000-0000-0000-000000000000'::uuid/);
  assert.match(sql, /line_oa_outbound_messages\s*\(org_id,\s*send_type/i);
  assert.match(sql, /line_oa_inbound_messages\s*\(\s*org_id,\s*conversation_id/i);
  assert.match(sql, /line_oa_audit_log\s*\(\s*org_id,\s*event_type/i);
  const rpc = sql.slice(sql.indexOf('create or replace function public.rpc_ingest_line_webhook'));
  assert.match(rpc, /v_org_id\s+uuid;/i);
  assert.doesNotMatch(sql, /0163_line_org_id_function_fix/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(root, 'supabase/migrations/20270328_line_group_plain_ack.sql');

test('baseline migration stages one text acknowledgement and keeps a metadata-only receipt', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /tpl_inst_group_ack/);
  assert.match(sql, /RETURN 'plain_ack_staged'/i);
  assert.match(sql, /v_group_result = 'plain_ack_staged'/);
  assert.match(sql, /case\s+when\s+v_group_result = 'plain_ack_staged'\s+then '\{\}'::jsonb\s+else v_event\s+end/i);
  assert.doesNotMatch(sql, /0163_line_org_id_function_fix/);
  assert.doesNotMatch(sql, /org_id\s*,\s*send_type/);
});

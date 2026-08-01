/**
 * Real two-client proof for rpc_claim_line_outbound_batch.
 *
 * Requires migrations 0193 + 0194 to be pre-applied (as they are after
 * `supabase start` in CI). The shared developer stack is never migrated by this
 * script: when the RPC/columns are absent it exits 0 with a clear SKIP message.
 *
 * When available, the caller must explicitly identify an exclusive ephemeral
 * stack, and the harness refuses to run unless it has zero pre-existing eligible
 * rows. Two separate psql processes then claim one fixture batch concurrently.
 * Unique committed fixtures are necessary for cross-session visibility; a
 * finally block deletes them and a final query proves cleanup.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dsn = process.env.LINE_CLAIM_RACE_DSN ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const windowsPsql = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
const psql = process.env.PSQL_BIN ??
  (process.platform === "win32" && existsSync(windowsPsql) ? windowsPsql : "psql");
const fixtureCount = 20;

async function sql(text, timeout = 30_000) {
  const { stdout } = await execFileAsync(
    psql,
    ["-X", "-d", dsn, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", text],
    { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

function quotedUuidList(ids) {
  return ids.map((id) => `'${id}'::uuid`).join(", ");
}

function parseClaimResult(stdout, clientName) {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("RESULT:"));
  if (!line) {
    throw new Error(`${clientName} produced no RESULT marker: ${stdout}`);
  }
  const parsed = JSON.parse(line.slice("RESULT:".length));
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
    throw new Error(`${clientName} returned a malformed claim result`);
  }
  return parsed;
}

async function main() {
  const preflight = await sql(`
    select case when
      to_regprocedure('public.rpc_claim_line_outbound_batch(integer,integer)') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'line_oa_outbound_messages'
          and column_name = 'claim_token'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'line_oa_outbound_messages'
          and column_name = 'next_attempt_at'
      )
      then 'ready' else 'missing' end;
  `);

  if (preflight !== "ready") {
    console.log(
      "SKIP claim-race: requires pre-applied migrations 0193 and 0194; shared stack was not modified",
    );
    return;
  }

  if (process.env.LINE_CLAIM_RACE_EPHEMERAL !== "1") {
    console.log(
      "SKIP claim-race: set LINE_CLAIM_RACE_EPHEMERAL=1 only for an exclusive ephemeral stack",
    );
    return;
  }

  const eligibleCount = Number(await sql(`
    select count(*)
    from public.line_oa_outbound_messages
    where status = 'pending'
      and (next_attempt_at is null or next_attempt_at <= now())
      and (claimed_at is null or claimed_at < now() - interval '300 seconds');
  `));
  if (!Number.isSafeInteger(eligibleCount) || eligibleCount !== 0) {
    throw new Error(
      `claim-race requires zero pre-existing eligible rows on its ephemeral stack; found ${eligibleCount}`,
    );
  }

  const conversationId = randomUUID();
  const rowIds = Array.from({ length: fixtureCount }, () => randomUUID());
  const lineUserId = `U-A2-RACE-${conversationId.replaceAll("-", "")}`;
  const values = rowIds.map((id) =>
    `('${id}'::uuid, '${conversationId}'::uuid, 'push', 'pending', ` +
    `'tpl_a2_claim_race', '{}'::jsonb)`
  ).join(",\n");
  let setupCommitted = false;

  try {
    await sql(`
      begin;
      insert into public.line_oa_conversations (
        id, line_user_id, vertical_context, site_code, status
      ) values (
        '${conversationId}'::uuid, '${lineUserId}', 'monolith', 'A2-RACE', 'open'
      );
      insert into public.line_oa_outbound_messages (
        id, conversation_id, send_type, status, template_key, slot_values
      ) values ${values};
      commit;
    `);
    setupCommitted = true;

    const perClientLimit = fixtureCount / 2;
    const claimSql = `
      begin;
      select 'RESULT:' || coalesce(jsonb_agg(id order by id)::text, '[]')
      from public.rpc_claim_line_outbound_batch(${perClientLimit}, 300);
      select pg_sleep(0.75);
      commit;
    `;
    const [clientAOutput, clientBOutput] = await Promise.all([
      sql(claimSql, 30_000),
      sql(claimSql, 30_000),
    ]);
    const clientA = parseClaimResult(clientAOutput, "client A");
    const clientB = parseClaimResult(clientBOutput, "client B");
    const clientASet = new Set(clientA);
    const overlap = clientB.filter((id) => clientASet.has(id));
    const union = new Set([...clientA, ...clientB]);

    if (overlap.length !== 0) {
      throw new Error(`claim overlap detected: ${overlap.join(",")}`);
    }
    if (union.size !== fixtureCount || rowIds.some((id) => !union.has(id))) {
      throw new Error(
        `expected ${fixtureCount} distinct fixture claims, received ${union.size}`,
      );
    }

    console.log(
      `PASS claim-race: client_a=${clientA.length} client_b=${clientB.length} ` +
      `overlap=${overlap.length} claimed=${union.size}`,
    );
  } finally {
    if (setupCommitted) {
      const cleanup = await sql(`
        begin;
        delete from public.line_oa_outbound_messages
        where id in (${quotedUuidList(rowIds)});
        delete from public.line_oa_conversations
        where id = '${conversationId}'::uuid;
        commit;
        select
          (select count(*) from public.line_oa_outbound_messages
           where id in (${quotedUuidList(rowIds)}))
          || '|'
          ||
          (select count(*) from public.line_oa_conversations
           where id = '${conversationId}'::uuid);
      `);
      const cleanupTail = cleanup.split(/\r?\n/).at(-1);
      if (cleanupTail !== "0|0") {
        throw new Error(`claim-race cleanup verification failed: ${cleanup}`);
      }
      console.log("CLEANUP claim-race: verified 0 outbound rows | 0 conversations");
    }
  }
}

await main();

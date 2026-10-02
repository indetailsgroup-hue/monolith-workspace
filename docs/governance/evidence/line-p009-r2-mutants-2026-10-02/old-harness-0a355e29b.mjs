/**
 * Real two-client proof for rpc_line_inbound_retry_sweep (P0-9, 0200).
 *
 * Requires migration 0200 to be pre-applied. The shared developer stack is
 * never migrated by this script: when the RPC is absent it exits 0 with a clear
 * SKIP message. It uses the same opt-in as claim-race.mjs: the caller must name
 * an exclusive ephemeral stack, and the harness refuses to run unless that
 * stack has zero due retry rows.
 *
 * Fixture rows are memberJoined events for unbound groups: the handler returns
 * 'members_ignored_unbound' and writes nothing else, so no audit row (which is
 * immutable) is left behind. Two separate psql processes sweep concurrently as
 * service_role, each holding its locks for 0.75 s. Every row must be claimed by
 * exactly one client: the claim counts add up to the fixture count and every
 * fixture row ends succeeded. A finally block deletes the fixtures and a final
 * query proves cleanup.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dsn = process.env.LINE_CLAIM_RACE_DSN;
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

function parseSweepResult(stdout, clientName) {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("RESULT:"));
  if (!line) {
    throw new Error(`${clientName} produced no RESULT marker: ${stdout}`);
  }
  const parsed = JSON.parse(line.slice("RESULT:".length));
  for (const key of ["claimed", "succeeded", "rescheduled", "dead_lettered"]) {
    if (!Number.isSafeInteger(parsed[key])) {
      throw new Error(`${clientName} returned a malformed sweep result`);
    }
  }
  return parsed;
}

async function main() {
  if (!dsn) {
    console.log(
      "SKIP inbound-retry-race: set LINE_CLAIM_RACE_DSN to an explicit exclusive ephemeral stack",
    );
    return;
  }

  if (process.env.LINE_CLAIM_RACE_EPHEMERAL !== "1") {
    console.log(
      "SKIP inbound-retry-race: set LINE_CLAIM_RACE_EPHEMERAL=1 only for an exclusive ephemeral stack",
    );
    return;
  }

  const preflight = await sql(`
    select case when
      to_regprocedure('public.rpc_line_inbound_retry_sweep(integer)') is not null
      and to_regclass('public.line_oa_inbound_retry') is not null
      then 'ready' else 'missing' end;
  `);

  if (preflight !== "ready") {
    console.log(
      "SKIP inbound-retry-race: requires pre-applied migration 0200; shared stack was not modified",
    );
    return;
  }

  const dueCount = Number(await sql(`
    select count(*)
    from public.line_oa_inbound_retry
    where status = 'pending' and next_attempt_at <= now();
  `));
  if (!Number.isSafeInteger(dueCount) || dueCount !== 0) {
    throw new Error(
      `inbound-retry-race requires zero pre-existing due rows on its ephemeral stack; found ${dueCount}`,
    );
  }

  const runId = randomUUID().replaceAll("-", "");
  const eventIds = Array.from({ length: fixtureCount }, (_, i) => `p009-race-${runId}-${i}`);
  const eventList = eventIds.map((id) => `'${id}'`).join(", ");
  const values = eventIds.map((id, i) => {
    const groupId = `C-P009-RACE-${runId}-${i}`;
    const payload = JSON.stringify({
      type: "memberJoined",
      webhookEventId: id,
      timestamp: 1759300000000,
      mode: "active",
      source: { type: "group", groupId },
      joined: { members: [{ type: "user", userId: `U-P009-RACE-${i}` }] },
    });
    return `('${id}', 'p009-race', '${groupId}', '${payload}'::jsonb, now() - interval '1 second')`;
  }).join(",\n");
  let setupCommitted = false;

  try {
    await sql(`
      begin;
      insert into public.line_oa_inbound_retry (
        webhook_event_id, vertical_context, line_group_id, payload, next_attempt_at
      ) values ${values};
      commit;
    `);
    setupCommitted = true;

    const perClientLimit = fixtureCount / 2;
    const sweepSql = `
      begin;
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      set local role service_role;
      select 'RESULT:' || to_jsonb(r)::text
      from public.rpc_line_inbound_retry_sweep(${perClientLimit}) r;
      select pg_sleep(0.75);
      commit;
    `;
    const [clientAOutput, clientBOutput] = await Promise.all([
      sql(sweepSql, 30_000),
      sql(sweepSql, 30_000),
    ]);
    const clientA = parseSweepResult(clientAOutput, "client A");
    const clientB = parseSweepResult(clientBOutput, "client B");
    const claimed = clientA.claimed + clientB.claimed;

    const finalState = await sql(`
      select coalesce(string_agg(status || ':' || coalesce(last_result, '') || ':' || n, ','
                                 order by status, last_result), '')
      from (
        select status, last_result, count(*) as n
        from public.line_oa_inbound_retry
        where webhook_event_id in (${eventList})
        group by status, last_result
      ) s;
    `);
    const expectedState = `succeeded:members_ignored_unbound:${fixtureCount}`;

    if (claimed !== fixtureCount || finalState !== expectedState) {
      throw new Error(
        `sweep overlap or loss: client_a=${clientA.claimed} client_b=${clientB.claimed} ` +
        `claimed=${claimed} expected=${fixtureCount} final=${finalState} want=${expectedState}`,
      );
    }

    console.log(
      `PASS inbound-retry-race: client_a=${clientA.claimed} client_b=${clientB.claimed} ` +
      `claimed=${claimed} final=${finalState}`,
    );
  } finally {
    if (setupCommitted) {
      const cleanup = await sql(`
        begin;
        delete from public.line_oa_inbound_retry
        where webhook_event_id in (${eventList});
        commit;
        select count(*) from public.line_oa_inbound_retry
        where webhook_event_id in (${eventList});
      `);
      const cleanupTail = cleanup.split(/\r?\n/).at(-1);
      if (cleanupTail !== "0") {
        throw new Error(`inbound-retry-race cleanup verification failed: ${cleanup}`);
      }
      console.log("CLEANUP inbound-retry-race: verified 0 retry rows");
    }
  }
}

await main();

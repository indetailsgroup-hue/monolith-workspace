/**
 * Real two-client proof for rpc_line_inbound_retry_sweep (P0-9, 0200): two
 * sweeps that overlap in time claim disjoint rows without waiting on each
 * other, which is what FOR UPDATE SKIP LOCKED provides.
 *
 * Requires migration 0200 to be pre-applied. The shared developer stack is
 * never migrated by this script: when the RPC is absent it exits 0 with a clear
 * SKIP message, or exits 1 when LINE_RACE_REQUIRE=1 (CI). It uses the same
 * opt-in as claim-race.mjs: the caller must name an exclusive ephemeral stack,
 * and the harness refuses to run unless that stack has zero due retry rows.
 *
 * Fixture rows are memberJoined events for unbound groups: the handler returns
 * 'members_ignored_unbound' and writes nothing else, so no audit row (which is
 * immutable) is left behind.
 *
 * Overlap is forced, not hoped for: client A sweeps 10 rows, then takes a
 * transaction advisory lock and keeps its transaction (and its row locks) open
 * for 5 s. The harness starts client B only once it sees A's advisory lock
 * held. B runs with lock_timeout = 200 ms, so a sweep that waits for A's row
 * locks (plain FOR UPDATE, or no claim lock at all) fails instead of passing
 * late. Database timestamps prove B finished while A was still open.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const dsn = process.env.LINE_CLAIM_RACE_DSN;
const windowsPsql = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
const psql = process.env.PSQL_BIN ??
  (process.platform === "win32" && existsSync(windowsPsql) ? windowsPsql : "psql");
const fixtureCount = 20;
const perClientLimit = fixtureCount / 2;
const holdSeconds = 5;

async function sql(text, timeout = 30_000) {
  const { stdout } = await execFileAsync(
    psql,
    ["-X", "-d", dsn, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", text],
    { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

function runClient(name, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ["-X", "-d", dsn, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", text],
      { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${name} failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function marker(stdout, name, key) {
  const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  if (!line) {
    throw new Error(`${name} produced no ${key} marker: ${stdout}`);
  }
  return line.slice(key.length + 1);
}

function parseClient(stdout, name, keys) {
  const result = JSON.parse(marker(stdout, name, "RESULT"));
  for (const key of ["claimed", "succeeded", "rescheduled", "dead_lettered"]) {
    if (!Number.isSafeInteger(result[key])) {
      throw new Error(`${name} returned a malformed sweep result`);
    }
  }
  const times = Object.fromEntries(keys.map((key) => [key, Number(marker(stdout, name, key))]));
  return { result, times };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (process.env.LINE_RACE_REQUIRE === "1") {
      throw new Error("inbound-retry-race: migration 0200 is required (LINE_RACE_REQUIRE=1) but absent");
    }
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
  const lockKey = randomInt(1, 2 ** 31 - 1);
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
  const sweepAs = `
      select set_config('request.jwt.claims', '{"role":"service_role"}', true);
      set local role service_role;
      select 'T0:' || extract(epoch from clock_timestamp());
      select 'RESULT:' || to_jsonb(r)::text from public.rpc_line_inbound_retry_sweep(${perClientLimit}) r;
      select 'T1:' || extract(epoch from clock_timestamp());`;
  let setupCommitted = false;
  let failure = null;

  try {
    await sql(`
      begin;
      insert into public.line_oa_inbound_retry (
        webhook_event_id, vertical_context, line_group_id, payload, next_attempt_at
      ) values ${values};
      commit;
    `);
    setupCommitted = true;

    const clientA = runClient("client A", `
      begin;
      set local lock_timeout = '500ms';${sweepAs}
      select pg_advisory_xact_lock(${lockKey});
      select pg_sleep(${holdSeconds});
      select 'T2:' || extract(epoch from clock_timestamp());
      commit;`);

    let aHolding = false;
    for (let i = 0; i < 300 && !aHolding; i += 1) {
      aHolding = (await sql(`
        select count(*) from pg_locks
        where locktype = 'advisory' and classid = 0 and objid = ${lockKey} and objsubid = 1 and granted;
      `)) === "1";
      if (!aHolding) await sleep(50);
    }
    if (!aHolding) {
      await clientA.catch(() => {});
      throw new Error("client A never reached its hold point (advisory lock not seen within 15 s)");
    }

    const clientB = runClient("client B", `
      begin;
      set local lock_timeout = '200ms';${sweepAs}
      commit;`);
    const [aOut, bOut] = await Promise.all([clientA, clientB]);
    const a = parseClient(aOut, "client A", ["T0", "T1", "T2"]);
    const b = parseClient(bOut, "client B", ["T0", "T1"]);

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
    const overlap = a.times.T1 < b.times.T0 && b.times.T1 < a.times.T2;

    if (!overlap) {
      throw new Error(
        `clients did not overlap: A swept until ${a.times.T1}, held until ${a.times.T2}; ` +
        `B ran ${b.times.T0}..${b.times.T1}`,
      );
    }
    if (a.result.claimed !== perClientLimit || b.result.claimed !== perClientLimit ||
        finalState !== expectedState) {
      throw new Error(
        `sweep overlap or loss: client_a=${a.result.claimed} client_b=${b.result.claimed} ` +
        `final=${finalState} want=${expectedState}`,
      );
    }

    console.log(
      `PASS inbound-retry-race: client_a=${a.result.claimed} client_b=${b.result.claimed} ` +
      `final=${finalState} overlap=proven b_ran_ms=${Math.round((b.times.T1 - b.times.T0) * 1000)} ` +
      `a_held_ms_after_b=${Math.round((a.times.T2 - b.times.T1) * 1000)}`,
    );
  } catch (error) {
    failure = error;
  } finally {
    if (setupCommitted) {
      try {
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
      } catch (cleanupError) {
        if (failure) {
          console.error(`CLEANUP inbound-retry-race failed after an earlier failure: ${cleanupError.message}`);
        } else {
          failure = cleanupError;
        }
      }
    }
  }
  if (failure) throw failure;
}

await main();

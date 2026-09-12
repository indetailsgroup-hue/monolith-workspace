import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ from: vi.fn(), auth: { getUser: vi.fn() } }));
vi.mock('../../core/supabase', () => ({ supabase: client }));

import { useTpcStore } from '../teamPulseStore';
import {
  mapTpcPulseSession, type TpcPulseSessionRow, type TpcPulseConfigRow,
  type TpcPulseSummaryRow,
} from '../teamPulseTypes';
import type { OrgPlan } from '../../tenant/types';

const draft: TpcPulseSessionRow = {
  id: 'session-a', org_id: 'org-a', title: 'Weekly pulse', status: 'DRAFT',
  period_label: '2027-W12', opened_at: null, closed_at: null,
  created_at: '2027-03-01T00:00:00Z',
};

const config: TpcPulseConfigRow = {
  id: 'config-a', org_id: 'org-a', topic: 'WORKLOAD', is_active: true, scale_max: 5,
  created_at: draft.created_at, updated_at: draft.created_at,
};
const summary: TpcPulseSummaryRow = {
  org_id: 'org-a', session_id: draft.id, session_title: draft.title,
  session_status: 'ACTIVE', period_label: draft.period_label, topic: 'WORKLOAD',
  avg_score: 4, response_count: 3, health_status: 'NORMAL',
};
type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

function deferred() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>(done => { resolve = done; });
  return { promise, resolve };
}

function query(result: Result | Promise<Result>) {
  const chain = {
    update: vi.fn(() => chain), eq: vi.fn(() => chain), select: vi.fn(() => chain),
    order: vi.fn(() => chain), insert: vi.fn(() => chain), upsert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain), single: vi.fn(() => chain),
    then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  client.from.mockReturnValueOnce(chain);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  useTpcStore.getState().setContext(null, null);
  useTpcStore.getState().setContext('org-a', 'ENTERPRISE');
  useTpcStore.setState({ sessions: [mapTpcPulseSession(draft)], loading: false, error: null });
});

describe('Team Pulse session lifecycle', () => {
  it('does not report activation success when no database row matched', async () => {
    query(ok(null));
    expect(await useTpcStore.getState().activateSession(draft.id, draft.org_id, 'ENTERPRISE')).toBe(false);
    expect(useTpcStore.getState().sessions[0].status).toBe('DRAFT');
    expect(useTpcStore.getState().error).not.toBeNull();
  });

  it.each([
    ['activateSession', 'DRAFT', 'ACTIVE', 'opened_at'],
    ['closeSession', 'ACTIVE', 'CLOSED', 'closed_at'],
  ] as const)('%s applies only the expected source status and uses the returned row', async (action, source, target, timestamp) => {
    const returned = { ...draft, status: target, [timestamp]: '2027-03-22T05:12:34Z' };
    useTpcStore.setState({ sessions: [mapTpcPulseSession({ ...draft, status: source })] });
    const request = query(ok(returned));
    expect(await useTpcStore.getState()[action](draft.id, draft.org_id, 'ENTERPRISE')).toBe(true);
    expect(request.eq.mock.calls).toEqual([
      ['id', draft.id], ['org_id', draft.org_id], ['status', source],
    ]);
    expect(request.select).toHaveBeenCalled();
    expect(useTpcStore.getState().sessions[0]).toEqual(mapTpcPulseSession(returned));
  });

  it.each(['activateSession', 'closeSession'] as const)('%s preserves cached state on database failure', async action => {
    const original = useTpcStore.getState().sessions;
    query({ data: null, error: { message: 'Permission denied' } });
    expect(await useTpcStore.getState()[action](draft.id, draft.org_id, 'ENTERPRISE')).toBe(false);
    expect(useTpcStore.getState().sessions).toEqual(original);
    expect(useTpcStore.getState().error).toBe('Permission denied');
    expect(useTpcStore.getState().loading).toBe(false);
  });

  it.each(['activateSession', 'closeSession'] as const)('%s rejects zero matched rows without local success', async action => {
    query(ok(null));
    expect(await useTpcStore.getState()[action]('missing-or-foreign', 'org-a', 'ENTERPRISE')).toBe(false);
    expect(useTpcStore.getState().sessions[0]).toEqual(mapTpcPulseSession(draft));
  });
});

const reads = [
  { name: 'fetchConfigs', key: 'configs', table: 'tpc_pulse_configs', row: config },
  { name: 'fetchSessions', key: 'sessions', table: 'tpc_pulse_sessions', row: draft },
  { name: 'fetchSummary', key: 'summaries', table: 'tpc_pulse_summary_v', row: summary },
] as const;

const actions = [
  ...reads.map(({ name, row }) => ({
    name, result: [row], run: (orgId: string, plan: OrgPlan) => useTpcStore.getState()[name](orgId, plan),
  })),
  { name: 'upsertConfig', result: config, run: (orgId: string, plan: OrgPlan) =>
    useTpcStore.getState().upsertConfig({ orgId, topic: 'WORKLOAD', isActive: false }, plan) },
  { name: 'createSession', result: draft, run: (orgId: string, plan: OrgPlan) =>
    useTpcStore.getState().createSession({ orgId, title: '  Weekly pulse  ', periodLabel: '  2027-W12  ' }, plan) },
  { name: 'activateSession', result: { ...draft, status: 'ACTIVE' }, run: (orgId: string, plan: OrgPlan) =>
    useTpcStore.getState().activateSession(draft.id, orgId, plan) },
  { name: 'closeSession', result: { ...draft, status: 'CLOSED' }, run: (orgId: string, plan: OrgPlan) =>
    useTpcStore.getState().closeSession(draft.id, orgId, plan) },
] as const;

const submit = (orgId: string) => useTpcStore.getState().submitResponse({
  orgId, sessionId: draft.id, topic: 'WORKLOAD', score: 4,
});

describe.each(actions)('$name tenant and plan scope', ({ run, result }) => {
  it.each<OrgPlan>(['FREE', 'STARTER'])('keeps %s plan gated', async plan => {
    useTpcStore.getState().setContext('org-a', plan);
    expect(await run('org-a', plan)).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects a foreign org without changing the active context', async () => {
    expect(await run('org-b', 'ENTERPRISE')).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
    expect(useTpcStore.getState().contextOrgId).toBe('org-a');
    expect(useTpcStore.getState().sessions[0].orgId).toBe('org-a');
  });

  it('does not repopulate another tenant after the context changes', async () => {
    const pending = deferred();
    query(pending.promise);
    const completion = run('org-a', 'ENTERPRISE');
    useTpcStore.getState().setContext('org-b', 'ENTERPRISE');
    pending.resolve(ok(result));
    expect(await completion).toBe(false);
    expect(useTpcStore.getState()).toMatchObject({
      contextOrgId: 'org-b', configs: [], sessions: [], summaries: [], loading: false, error: null,
    });
  });
});

describe.each(reads)('$name request results', ({ name, key, table, row }) => {
  it('keeps the latest same-org response when requests complete out of order', async () => {
    const older = deferred();
    query(older.promise);
    query(ok([]));
    const first = useTpcStore.getState()[name]('org-a', 'ENTERPRISE');
    expect(await useTpcStore.getState()[name]('org-a', 'ENTERPRISE')).toBe(true);
    older.resolve(ok([row]));
    expect(await first).toBe(false);
    expect(useTpcStore.getState()[key]).toEqual([]);
  });

  it('scopes requests and rejects unexpected foreign rows', async () => {
    const request = query(ok([{ ...row, org_id: 'org-b' }]));
    expect(await useTpcStore.getState()[name]('org-a', 'ENTERPRISE')).toBe(false);
    expect(client.from).toHaveBeenCalledWith(table);
    expect(request.eq).toHaveBeenCalledWith('org_id', 'org-a');
    expect(useTpcStore.getState()[key].some(item => item.orgId === 'org-b')).toBe(false);
  });

  it('accepts empty data without inventing records', async () => {
    query(ok(null));
    expect(await useTpcStore.getState()[name]('org-a', 'ENTERPRISE')).toBe(true);
    expect(useTpcStore.getState()[key]).toEqual([]);
  });
});

describe('Team Pulse context lifecycle', () => {
  it.each([['org-b', 'ENTERPRISE'], ['org-a', 'FREE'], [null, null]] as const)(
    'clears data and selection for context %s / %s and ignores stale errors', async (orgId, plan) => {
      const pending = deferred();
      query(pending.promise);
      useTpcStore.getState().setActiveSession(draft.id);
      useTpcStore.getState().setFilters({ topic: 'WORKLOAD', sessionId: draft.id });
      const completion = useTpcStore.getState().fetchSummary('org-a', 'ENTERPRISE');
      useTpcStore.getState().setContext(orgId, plan);
      const stateAfterChange = useTpcStore.getState();
      pending.resolve({ data: null, error: { message: 'Old tenant error' } });
      expect(await completion).toBe(false);
      expect(useTpcStore.getState()).toBe(stateAfterChange);
      expect(stateAfterChange).toMatchObject({
        configs: [], sessions: [], summaries: [], activeSessionId: null, filters: {}, loading: false,
      });
    },
  );

  it('does not allow an old plan argument after downgrade', async () => {
    useTpcStore.getState().setContext('org-a', 'FREE');
    expect(await useTpcStore.getState().fetchSummary('org-a', 'ENTERPRISE')).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('keeps loading true while another current request is pending', async () => {
    const pending = deferred();
    query(pending.promise);
    query(ok([]));
    const configs = useTpcStore.getState().fetchConfigs('org-a', 'ENTERPRISE');
    await useTpcStore.getState().fetchSummary('org-a', 'ENTERPRISE');
    expect(useTpcStore.getState().loading).toBe(true);
    pending.resolve(ok([]));
    await configs;
    expect(useTpcStore.getState().loading).toBe(false);
  });

  it('clears loading and reports thrown network failures without success', async () => {
    client.from.mockImplementationOnce(() => { throw new Error('Network unavailable'); });
    expect(await useTpcStore.getState().fetchSessions('org-a', 'ENTERPRISE')).toBe(false);
    expect(useTpcStore.getState()).toMatchObject({ loading: false, error: 'Network unavailable' });
  });
});

describe('Team Pulse writes', () => {
  it('does not roll a closed session back when activation completes late', async () => {
    const activation = deferred();
    query(activation.promise);
    const opening = useTpcStore.getState().activateSession(draft.id, 'org-a', 'ENTERPRISE');
    query(ok({ ...draft, status: 'CLOSED' }));
    expect(await useTpcStore.getState().closeSession(draft.id, 'org-a', 'ENTERPRISE')).toBe(true);
    activation.resolve(ok({ ...draft, status: 'ACTIVE' }));
    expect(await opening).toBe(false);
    expect(useTpcStore.getState().sessions[0].status).toBe('CLOSED');
  });

  it('retains the latest config edit when earlier writes return late', async () => {
    const earlier = deferred();
    query(earlier.promise);
    const first = useTpcStore.getState().upsertConfig({ orgId: 'org-a', topic: 'WORKLOAD', isActive: true }, 'ENTERPRISE');
    query(ok({ ...config, is_active: false }));
    await useTpcStore.getState().upsertConfig({ orgId: 'org-a', topic: 'WORKLOAD', isActive: false }, 'ENTERPRISE');
    earlier.resolve(ok(config));
    expect(await first).toBe(false);
    expect(useTpcStore.getState().configs[0].isActive).toBe(false);
  });

  it('retains independent session creations even when responses arrive out of order', async () => {
    useTpcStore.setState({ sessions: [] });
    const earlier = deferred();
    query(earlier.promise);
    const first = useTpcStore.getState().createSession({ orgId: 'org-a', title: 'First', periodLabel: 'W1' }, 'ENTERPRISE');
    query(ok({ ...draft, id: 'session-second', title: 'Second' }));
    await useTpcStore.getState().createSession({ orgId: 'org-a', title: 'Second', periodLabel: 'W2' }, 'ENTERPRISE');
    earlier.resolve(ok(draft));
    expect(await first).toBe(true);
    expect(useTpcStore.getState().sessions.map(session => session.id).sort()).toEqual(['session-a', 'session-second']);
  });

  it('creates a session using the database row and trimmed input', async () => {
    useTpcStore.setState({ sessions: [] });
    const request = query(ok(draft));
    expect(await actions[4].run('org-a', 'ENTERPRISE')).toBe(true);
    expect(request.insert).toHaveBeenCalledWith({ org_id: 'org-a', title: 'Weekly pulse', period_label: '2027-W12' });
    expect(useTpcStore.getState().sessions).toEqual([mapTpcPulseSession(draft)]);
  });

  it('upserts a config from its confirmed row without a second unscoped read', async () => {
    query(ok({ ...config, is_active: false }));
    expect(await actions[3].run('org-a', 'ENTERPRISE')).toBe(true);
    expect(useTpcStore.getState().configs).toEqual([expect.objectContaining({ orgId: 'org-a', isActive: false })]);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('does not let a pre-write session fetch overwrite a confirmed activation', async () => {
    const pending = deferred();
    query(pending.promise);
    const fetch = useTpcStore.getState().fetchSessions('org-a', 'ENTERPRISE');
    query(ok({ ...draft, status: 'ACTIVE' }));
    expect(await useTpcStore.getState().activateSession(draft.id, 'org-a', 'ENTERPRISE')).toBe(true);
    pending.resolve(ok([draft]));
    expect(await fetch).toBe(false);
    expect(useTpcStore.getState().sessions[0].status).toBe('ACTIVE');
  });

  it.each<OrgPlan>(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'])('response submission stays exempt from %s plan gate', async plan => {
    useTpcStore.getState().setContext('org-a', plan);
    const request = query(ok(null));
    expect(await submit('org-a')).toBe(true);
    expect(request.insert).toHaveBeenCalledWith({
      org_id: 'org-a', session_id: draft.id, topic: 'WORKLOAD', score: 4, comment: null,
    });
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it.each(['foreign org', 'missing context'])('rejects a response with %s', async reason => {
    if (reason === 'missing context') useTpcStore.getState().setContext(null, null);
    expect(await submit(reason === 'foreign org' ? 'org-b' : 'org-a')).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns false on rejected response insert and preserves the database error', async () => {
    query({ data: null, error: { message: 'Session closed' } });
    expect(await submit('org-a')).toBe(false);
    expect(useTpcStore.getState().error).toBe('Session closed');
  });

  it('ignores an old response completion after switching tenant', async () => {
    const pending = deferred();
    query(pending.promise);
    const completion = submit('org-a');
    useTpcStore.getState().setContext('org-b', 'FREE');
    pending.resolve(ok(null));
    expect(await completion).toBe(false);
    expect(useTpcStore.getState()).toMatchObject({ contextOrgId: 'org-b', loading: false });
  });
});

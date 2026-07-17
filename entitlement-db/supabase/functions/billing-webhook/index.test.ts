// billing-webhook transport tests — dependency-injected, no DB/network (edge-fn-verify pattern)
import { describe, it, expect, vi } from 'vitest';
import {
  handleBillingWebhook, mapStripeEvent, mapStripeStatus, verifyStripeSignature,
  type BillingDeps, type BillingConfig,
} from './index';

const SECRET = 'whsec_test_secret';
const ORG = '00000000-0000-0000-0000-00000000000a';
const NOW_MS = 1_800_000_000_000; // fixed clock

function fakeDeps(overrides: Partial<BillingDeps> = {}): BillingDeps & {
  applied: unknown[]; resets: string[];
} {
  const applied: unknown[] = [];
  const resets: string[] = [];
  return {
    applied, resets,
    applySubscription: vi.fn(async (a) => { applied.push(a); return { error: null }; }),
    resetUsage: vi.fn(async (o) => { resets.push(o); return { error: null }; }),
    nowMs: () => NOW_MS,
    ...overrides,
  };
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function stripeRequest(body: unknown, opts: { t?: number; badSig?: boolean } = {}): Promise<Request> {
  const raw = JSON.stringify(body);
  const t = opts.t ?? Math.floor(NOW_MS / 1000);
  const v1 = opts.badSig === true ? 'f'.repeat(64) : await hmacHex(SECRET, `${t}.${raw}`);
  return new Request('http://x/billing-webhook', {
    method: 'POST', body: raw,
    headers: { 'stripe-signature': `t=${t},v1=${v1}` },
  });
}

function subEvent(type: string, objOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type,
    data: {
      object: {
        id: 'sub_123', customer: 'cus_123', status: 'active',
        current_period_start: 1_800_000_000, current_period_end: 1_802_600_000,
        metadata: { org_id: ORG, plan_code: 'plus' },
        ...objOverrides,
      },
    },
  };
}

const stripeCfg: BillingConfig = { provider: 'stripe', secret: SECRET };
const manualCfg: BillingConfig = { provider: 'manual', secret: SECRET };

describe('billing-webhook — stripe mode', () => {
  it('rejects non-POST', async () => {
    const res = await handleBillingWebhook(new Request('http://x', { method: 'GET' }), fakeDeps(), stripeCfg);
    expect(res.status).toBe(405);
  });

  it('fails closed when secret is not configured', async () => {
    const res = await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.updated')),
      fakeDeps(), { provider: 'stripe', secret: '' });
    expect(res.status).toBe(500);
  });

  it('rejects a bad signature (401), valid one passes', async () => {
    const deps = fakeDeps();
    const bad = await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.updated'), { badSig: true }), deps, stripeCfg);
    expect(bad.status).toBe(401);
    expect(deps.applied).toHaveLength(0);
    const good = await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.updated')), deps, stripeCfg);
    expect(good.status).toBe(200);
    expect(deps.applied).toHaveLength(1);
  });

  it('rejects a stale timestamp outside the 5-minute tolerance', async () => {
    const res = await handleBillingWebhook(
      await stripeRequest(subEvent('customer.subscription.updated'), { t: Math.floor(NOW_MS / 1000) - 3600 }),
      fakeDeps(), stripeCfg);
    expect(res.status).toBe(401);
  });

  it('maps subscription.updated → applySubscription with metadata org/plan + ISO periods', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.updated')), deps, stripeCfg);
    expect(res.status).toBe(200);
    expect(deps.applied[0]).toMatchObject({
      orgId: ORG, planCode: 'plus', status: 'active',
      periodStart: new Date(1_800_000_000 * 1000).toISOString(),
      provider: 'stripe', providerSubId: 'sub_123', providerCustomerId: 'cus_123',
    });
  });

  it('subscription.deleted forces status canceled', async () => {
    const deps = fakeDeps();
    await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.deleted', { status: 'active' })), deps, stripeCfg);
    expect(deps.applied[0]).toMatchObject({ status: 'canceled' });
  });

  it('invoice.paid → resetUsage only (new billing period, task 2.2)', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(await stripeRequest(subEvent('invoice.paid')), deps, stripeCfg);
    expect(res.status).toBe(200);
    expect(deps.resets).toEqual([ORG]);
    expect(deps.applied).toHaveLength(0);
  });

  it('event without metadata.org_id → 422 (no metadata, no write)', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(
      await stripeRequest(subEvent('customer.subscription.updated', { metadata: {} })), deps, stripeCfg);
    expect(res.status).toBe(422);
    expect(deps.applied).toHaveLength(0);
  });

  it('unknown event type → 200 ignored (provider retry etiquette)', async () => {
    const res = await handleBillingWebhook(await stripeRequest({ type: 'charge.refunded', data: { object: {} } }), fakeDeps(), stripeCfg);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
  });

  it('unprovisionable stripe status (incomplete) → 200 ignored, no write', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(
      await stripeRequest(subEvent('customer.subscription.created', { status: 'incomplete' })), deps, stripeCfg);
    expect(res.status).toBe(200);
    expect(deps.applied).toHaveLength(0);
  });

  it('rpc unknown_plan (foreign_key_violation) → 422', async () => {
    const deps = fakeDeps({
      applySubscription: vi.fn(async () => ({ error: { code: 'foreign_key_violation' } })),
    });
    const res = await handleBillingWebhook(await stripeRequest(subEvent('customer.subscription.updated')), deps, stripeCfg);
    expect(res.status).toBe(422);
  });
});

describe('billing-webhook — manual mode', () => {
  const manualBody = {
    org_id: ORG, plan_code: 'plus', status: 'active',
    current_period_start: '2027-01-16T00:00:00Z', current_period_end: '2027-02-16T00:00:00Z',
  };
  const manualReq = (body: unknown, token = SECRET) => new Request('http://x/billing-webhook', {
    method: 'POST', body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` },
  });

  it('rejects a wrong bearer token', async () => {
    const res = await handleBillingWebhook(manualReq(manualBody, 'wrong'), fakeDeps(), manualCfg);
    expect(res.status).toBe(401);
  });

  it('applies a valid manual body', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(manualReq(manualBody), deps, manualCfg);
    expect(res.status).toBe(200);
    expect(deps.applied[0]).toMatchObject({ orgId: ORG, planCode: 'plus', status: 'active', provider: 'manual' });
  });

  it('rejects an invalid status enum (422)', async () => {
    const res = await handleBillingWebhook(manualReq({ ...manualBody, status: 'lifetime' }), fakeDeps(), manualCfg);
    expect(res.status).toBe(422);
  });

  it('reset_usage: true also clears the current period', async () => {
    const deps = fakeDeps();
    const res = await handleBillingWebhook(manualReq({ ...manualBody, reset_usage: true }), deps, manualCfg);
    expect(res.status).toBe(200);
    expect(deps.resets).toEqual([ORG]);
  });
});

describe('pure helpers', () => {
  it('mapStripeStatus: conservative mapping', () => {
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('unpaid')).toBe('past_due');
    expect(mapStripeStatus('incomplete')).toBeNull();
    expect(mapStripeStatus('what_is_this')).toBeNull();
  });

  it('mapStripeEvent: missing plan_code → 422 error kind', () => {
    const m = mapStripeEvent(subEvent('customer.subscription.updated', { metadata: { org_id: ORG } }));
    expect(m).toMatchObject({ kind: 'error', status: 422, code: 'missing_metadata_plan_code' });
  });

  it('verifyStripeSignature: accepts any valid v1 among several', async () => {
    const raw = '{"a":1}';
    const t = Math.floor(NOW_MS / 1000);
    const good = await hmacHex(SECRET, `${t}.${raw}`);
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${good}`;
    expect(await verifyStripeSignature(raw, header, SECRET, NOW_MS)).toBe(true);
    expect(await verifyStripeSignature(raw, `t=${t},v1=${'0'.repeat(64)}`, SECRET, NOW_MS)).toBe(false);
    expect(await verifyStripeSignature(raw, null, SECRET, NOW_MS)).toBe(false);
  });
});

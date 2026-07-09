import { describe, it, expect, vi } from 'vitest';
import { buildBridgePayload, readWorkItemFromUrl, sendCutListToIimos, IIMOS_WORK_ITEM_KEY } from '../iimosBridge';
import type { FactoryPacket } from '../../factory/packet/types';

function fakePacket(): FactoryPacket {
  return {
    manifest: {
      jobId: 'JOB-1', projectId: 'P-1', createdAt: '2026-07-09T00:00:00Z',
      toolVersion: 'test', files: [], contentHash: 'hash-abc',
      schema: 'factory-packet' as never, version: '1' as never,
    },
    drillMap: {} as never,
    connectors: {} as never,
    cutList: {
      version: 'cutlist.v1',
      rows: [
        { rowNo: 1, partId: 'p1', cabinetId: 'c1', materialId: 'HMR_15_WHITE', qty: 2, finishW: 600, finishH: 720, edgeBanding: [0, 0, 0, 0], premill: [0, 0, 0, 0] },
        { rowNo: 2, partId: 'p2', cabinetId: 'c1', materialId: 'HMR_15_WHITE', qty: 3, finishW: 400, finishH: 300, edgeBanding: [0, 0, 0, 0], premill: [0, 0, 0, 0] },
        { rowNo: 3, partId: 'p3', cabinetId: 'c1', materialId: 'PLYWOOD_10', qty: 1, finishW: 800, finishH: 400, edgeBanding: [0, 0, 0, 0], premill: [0, 0, 0, 0] },
      ] as never,
      summary: { totalRows: 3, totalParts: 6, byMaterial: {} },
    } as never,
    gateResult: {} as never,
  } as FactoryPacket;
}

describe('iimosBridge (ADR-057 Phase 1)', () => {
  it('aggregate cutlist ตาม material + แนบ contentHash + clientKey deterministic', () => {
    const p = buildBridgePayload(fakePacket(), 'wi-123', 'mw-001', 'ตู้ครัว L');
    expect(p.p_package_code).toBe('MW-001');
    expect(p.p_items).toEqual([
      { name: 'HMR_15_WHITE', qty: 5, unit: 'ชิ้น(ตัด)' },
      { name: 'PLYWOOD_10', qty: 1, unit: 'ชิ้น(ตัด)' },
    ]);
    expect(p.p_content_hash).toBe('hash-abc');
    expect(p.p_client_key).toBe('JOB-1:hash-abc'); // retry ส่งซ้ำ = key เดิม = idempotent
  });

  it('readWorkItemFromUrl: อ่านจาก query + จำใน storage + fallback storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readWorkItemFromUrl('https://x.dev/app?work_item=wi-9', storage)).toBe('wi-9');
    expect(store.get(IIMOS_WORK_ITEM_KEY)).toBe('wi-9');
    expect(readWorkItemFromUrl('https://x.dev/app', storage)).toBe('wi-9');
  });

  it('sendCutListToIimos: ยิง rpc endpoint พร้อม auth header และ throw เมื่อ fail', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ imported: 2, skipped: 0, already: false }) });
    const r = await sendCutListToIimos(
      { url: 'https://demo.supabase.co', anonKey: 'anon', accessToken: 'tok' },
      buildBridgePayload(fakePacket(), 'wi-1', 'MW-001'),
      ok as unknown as typeof fetch,
    );
    expect(r.imported).toBe(2);
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe('https://demo.supabase.co/rest/v1/rpc/rpc_bridge_import_cutlist');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');

    const bad = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'insufficient permission' }) });
    await expect(sendCutListToIimos(
      { url: 'https://demo.supabase.co', anonKey: 'anon', accessToken: 'tok' },
      buildBridgePayload(fakePacket(), 'wi-1', 'MW-001'),
      bad as unknown as typeof fetch,
    )).rejects.toThrow('insufficient permission');
  });
});

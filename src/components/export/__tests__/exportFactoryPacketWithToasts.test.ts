/**
 * exportFactoryPacketWithToasts tests — S18 Slice 4
 *
 * ผล export/packet-upload ต้องเห็นบนจอ (toast) ไม่ใช่เงียบอยู่ใน console:
 * - export สำเร็จ → toast success (ชื่อไฟล์ + ขนาด)
 * - upload ล้มเหลว → toast error (เดิม console.warn เงียบ)
 * - export ล้มเหลว → toast error (เดิม alert)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCKS - must be declared before imports
// ============================================

vi.mock('../../../factory/packet', () => ({
  generateFactoryPacketFromStores: vi.fn(),
}));

vi.mock('../../../core/api/stateApi', () => ({
  uploadPacket: vi.fn(),
}));

vi.mock('../../../core/store/useProjectStore', () => {
  let mockState: any = { metadata: { id: 'job-123', name: 'Test Project' } };
  return {
    useProjectStore: {
      getState: () => mockState,
      setState: (s: any) => {
        mockState = { ...mockState, ...s };
      },
      subscribe: () => () => {},
    },
  };
});

// ============================================
// IMPORTS - after mocks
// ============================================

import { exportFactoryPacketWithToasts } from '../exportFactoryPacketWithToasts';
import { generateFactoryPacketFromStores } from '../../../factory/packet';
import { uploadPacket } from '../../../core/api/stateApi';
import { useProjectStore } from '../../../core/store/useProjectStore';
import { useToastStore } from '../../../core/store/useToastStore';

const FAKE_PACKET = {
  filename: 'packet-2026.zip',
  compressedSize: 2048, // 2.0 KB
  uncompressedSize: 8192,
  blob: {} as Blob,
};

function toasts() {
  return useToastStore.getState().toasts;
}

describe('exportFactoryPacketWithToasts', () => {
  beforeEach(() => {
    vi.mocked(generateFactoryPacketFromStores).mockReset();
    vi.mocked(uploadPacket).mockReset();
    (useProjectStore as any).setState({ metadata: { id: 'job-123', name: 'Test Project' } });
    useToastStore.getState().clearAll();
  });

  it('shows a success toast with filename and size when export succeeds', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET as any);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true, packetSha256: 'abc' } as any);

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(true);
    const success = toasts().find((t) => t.type === 'success');
    expect(success).toBeDefined();
    expect(success!.message).toContain('packet-2026.zip');
    expect(success!.message).toContain('2.0 KB');
    expect(toasts().some((t) => t.type === 'error')).toBe(false);
  });

  it('shows an error toast when packet upload fails (not a silent console.warn)', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET as any);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: false, error: 'storage unavailable' } as any);

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(false);
    const error = toasts().find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('storage unavailable');
  });

  it('shows an error toast when export itself fails (not an alert)', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockRejectedValue(new Error('no cabinets'));

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(false);
    const error = toasts().find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toContain('no cabinets');
  });

  it('skips upload (no error toast) when there is no project id', async () => {
    (useProjectStore as any).setState({ metadata: null });
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET as any);

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(false);
    expect(uploadPacket).not.toHaveBeenCalled();
    expect(toasts().some((t) => t.type === 'success')).toBe(true);
    expect(toasts().some((t) => t.type === 'error')).toBe(false);
  });
});

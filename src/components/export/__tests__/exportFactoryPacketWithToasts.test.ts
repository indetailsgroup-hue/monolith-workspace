/**
 * exportFactoryPacketWithToasts tests — S18 Slice 4
 *
 * ผล export/packet-upload ต้องเห็นบนจอ (toast) ไม่ใช่เงียบอยู่ใน console:
 * - export สำเร็จ → toast success (ชื่อไฟล์ + ขนาด)
 * - upload ล้มเหลว → toast error (เดิม console.warn เงียบ)
 * - export ล้มเหลว → toast error (เดิม alert)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ZipBundleResult } from '../../../factory/packet/zipBundle';

type MockProjectState = { metadata: { id: string; name?: string } | null };

// ============================================
// MOCKS - must be declared before imports
// ============================================

const projectSubscriptions = vi.hoisted(() => ({ active: 0 }));

vi.mock('../../../factory/packet', () => ({
  generateFactoryPacketFromStores: vi.fn(),
}));

vi.mock('../../../core/api/stateApi', () => ({
  uploadPacket: vi.fn(),
}));

vi.mock('../../../core/store/useProjectStore', () => {
  let mockState: MockProjectState = { metadata: { id: 'job-123', name: 'Test Project' } };
  const listeners = new Set<(state: MockProjectState, previous: MockProjectState) => void>();
  return {
    useProjectStore: {
      getState: () => mockState,
      setState: (s: Partial<MockProjectState>) => {
        const previous = mockState;
        mockState = { ...mockState, ...s };
        listeners.forEach((listener) => listener(mockState, previous));
      },
      subscribe: (listener: (state: MockProjectState, previous: MockProjectState) => void) => {
        listeners.add(listener);
        projectSubscriptions.active = listeners.size;
        return () => {
          listeners.delete(listener);
          projectSubscriptions.active = listeners.size;
        };
      },
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

const FAKE_PACKET: ZipBundleResult = {
  filename: 'packet-2026.zip',
  compressedSize: 2048, // 2.0 KB
  uncompressedSize: 8192,
  blob: new Blob(['synthetic packet']),
};

function selectProject(id: string | null, name = 'Test Project') {
  useProjectStore.setState({ metadata: id === null ? null : {
    id, name, version: '1.0.0', createdAt: 1, updatedAt: 1,
  } });
}

function toasts() {
  return useToastStore.getState().toasts;
}

describe('exportFactoryPacketWithToasts', () => {
  afterEach(() => {
    expect(projectSubscriptions.active).toBe(0);
  });

  beforeEach(() => {
    vi.mocked(generateFactoryPacketFromStores).mockReset();
    vi.mocked(uploadPacket).mockReset();
    selectProject('job-123');
    useToastStore.getState().clearAll();
  });

  it('shows a success toast with filename and size when export succeeds', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true, packetSha256: 'abc' });

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(true);
    expect(uploadPacket).toHaveBeenCalledWith('job-123', FAKE_PACKET.blob);
    const success = toasts().find((t) => t.type === 'success');
    expect(success).toBeDefined();
    expect(success!.message).toContain('packet-2026.zip');
    expect(success!.message).toContain('2.0 KB');
    expect(toasts().some((t) => t.type === 'error')).toBe(false);
  });

  it('shows an error toast when packet upload fails (not a silent console.warn)', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: false, error: 'storage unavailable' });

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
    selectProject(null);
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET);

    const result = await exportFactoryPacketWithToasts();

    expect(result.ok).toBe(true);
    expect(result.uploaded).toBe(false);
    expect(uploadPacket).not.toHaveBeenCalled();
    expect(toasts().some((t) => t.type === 'success')).toBe(true);
    expect(toasts().some((t) => t.type === 'error')).toBe(false);
  });

  it.each(['job-456', null, 'switch-back'])('does not upload after project changes during packet generation: %s', async (nextProject) => {
    let finish!: (packet: ZipBundleResult) => void;
    let started!: () => void;
    const generationStarted = new Promise<void>((resolve) => { started = resolve; });
    vi.mocked(generateFactoryPacketFromStores).mockImplementation(() => {
      started();
      return new Promise((resolve) => { finish = resolve; });
    });
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true });

    const pending = exportFactoryPacketWithToasts();
    await generationStarted;
    selectProject(nextProject === null ? null : 'job-456');
    if (nextProject === 'switch-back') {
      selectProject('job-123');
    }
    finish(FAKE_PACKET);

    expect(await pending).toEqual({ ok: true, uploaded: false });
    expect(uploadPacket).not.toHaveBeenCalled();
    expect(toasts().some((t) => t.type === 'error' && t.message.includes('โครงการ'))).toBe(true);
  });

  it('does not generate a packet when project changes while loading the builder', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockResolvedValue(FAKE_PACKET);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true });
    const pending = exportFactoryPacketWithToasts();
    selectProject('job-456');

    expect(await pending).toEqual({ ok: false, uploaded: false });
    expect(generateFactoryPacketFromStores).not.toHaveBeenCalled();
    expect(uploadPacket).not.toHaveBeenCalled();
  });

  it('allows metadata updates within the same project during generation', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockImplementation(async () => {
      selectProject('job-123', 'Renamed');
      return FAKE_PACKET;
    });
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true });
    expect(await exportFactoryPacketWithToasts()).toEqual({ ok: true, uploaded: true });
    expect(uploadPacket).toHaveBeenCalledWith('job-123', FAKE_PACKET.blob);
  });

  it('allows a fresh export from the selected project after a canceled export', async () => {
    vi.mocked(generateFactoryPacketFromStores).mockImplementationOnce(async () => {
      selectProject('job-456');
      return FAKE_PACKET;
    }).mockResolvedValue(FAKE_PACKET);
    vi.mocked(uploadPacket).mockResolvedValue({ ok: true });

    expect(await exportFactoryPacketWithToasts()).toEqual({ ok: true, uploaded: false });
    expect(await exportFactoryPacketWithToasts()).toEqual({ ok: true, uploaded: true });
    expect(uploadPacket).toHaveBeenCalledExactlyOnceWith('job-456', FAKE_PACKET.blob);
  });
});

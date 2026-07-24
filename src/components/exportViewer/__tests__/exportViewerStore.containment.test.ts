/**
 * exportViewerStore.containment.test.ts — Phase-Gate-C C12.
 *
 * The Export Viewer's downloadOne / downloadAllSequential write artifact BYTES to the
 * browser via downloadBytesAsFile — a THIRD client egress primitive that had NO Trust
 * Kernel containment guard. Under design §9 a human/client never receives P2 plaintext,
 * so a production-shaped (DXF/CNC/cut-list/packet) artifact must be refused before any
 * byte reaches the browser; P1 review artifacts (PDF/JSON) still download.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadBytesAsFile } from '../downloadBytesAsFile';
import { createExportViewerStore } from '../exportViewerStore';
import type { TrustChainService } from '../../../core/trustChain/trustChainService';

vi.mock('../downloadBytesAsFile', () => ({
  downloadBytesAsFile: vi.fn(),
  downloadTextAsFile: vi.fn(),
  downloadJsonAsFile: vi.fn(),
}));

const mockDownload = vi.mocked(downloadBytesAsFile);
const BYTES = new Uint8Array([1, 2, 3]);

function svcReturning(artifact: Record<string, unknown>): TrustChainService {
  return { downloadArtifact: vi.fn(async () => artifact) } as unknown as TrustChainService;
}

describe('C12 — Export Viewer download egress is contained', () => {
  beforeEach(() => mockDownload.mockClear());

  it('downloadOne refuses a production-shaped artifact (.dxf) before browser egress', async () => {
    const svc = svcReturning({ ok: true, filename: 'panel.dxf', bytes: BYTES, mime: 'application/dxf' });
    const store = createExportViewerStore({ jobId: 'J1', svc });
    await store.getState().downloadOne('art-1');
    expect(mockDownload).not.toHaveBeenCalled();
    expect(store.getState().error).toMatch(/NOT_FOR_PRODUCTION/);
  });

  it('downloadOne allows a P1 review artifact (.pdf)', async () => {
    const svc = svcReturning({ ok: true, filename: 'cost-report.pdf', bytes: BYTES, mime: 'application/pdf' });
    const store = createExportViewerStore({ jobId: 'J1', svc });
    await store.getState().downloadOne('art-1');
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(store.getState().error).toBeNull();
  });

  it('downloadAllSequential refuses when any artifact is production-shaped (.nc)', async () => {
    const svc = {
      downloadArtifact: vi.fn(async () => ({ ok: true, filename: 'job.nc', bytes: BYTES, mime: 'text/plain' })),
    } as unknown as TrustChainService;
    const store = createExportViewerStore({ jobId: 'J1', svc });
    store.setState({
      exportRec: { exportId: 'E1', artifacts: [{ artifactId: 'a1', path: 'job.nc' }] } as never,
    });
    await store.getState().downloadAllSequential();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(store.getState().error).toMatch(/NOT_FOR_PRODUCTION/);
  });
});

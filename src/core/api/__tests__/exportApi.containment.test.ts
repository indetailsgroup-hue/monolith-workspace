/**
 * exportApi.containment.test.ts — Task 12 carry-forward (a): contain the
 * src/core/api export subsystem (CUTLIST_CSV / DXF_R12 / GCODE / STEP → zipBase64).
 *
 * This subsystem decodes a base64 "gated export ZIP" and triggers a browser download
 * of production-shaped P2 manufacturing bytes. Under the Trust Kernel (design §9) a
 * human/client can never receive P2 plaintext: the egress is refused with
 * NOT_FOR_PRODUCTION before any byte reaches the browser, mirroring Task 11's
 * download primitives. P1 review formats (BOM_JSON, PDF) still pass.
 */
import { describe, it, expect } from 'vitest';
import {
  assertExportFormatNotProductionShaped,
  isProductionShapedExportFormat,
  downloadExportZip,
  exportAndDownload,
  type ExportFormat,
} from '../exportApi';

const P2_FORMATS: ExportFormat[] = ['CUTLIST_CSV', 'DXF_R12', 'GCODE', 'STEP'];
const P1_FORMATS: ExportFormat[] = ['BOM_JSON', 'PDF'];

describe('export format classification', () => {
  it('classifies manufacturing formats as production-shaped', () => {
    for (const f of P2_FORMATS) expect(isProductionShapedExportFormat(f)).toBe(true);
  });
  it('leaves P1 review formats (BOM_JSON, PDF) not production-shaped', () => {
    for (const f of P1_FORMATS) expect(isProductionShapedExportFormat(f)).toBe(false);
  });
});

describe('assertExportFormatNotProductionShaped — refuses P2 before egress', () => {
  it('throws NOT_FOR_PRODUCTION for each P2 manufacturing format', () => {
    for (const f of P2_FORMATS) {
      expect(() => assertExportFormatNotProductionShaped(f)).toThrow(/NOT_FOR_PRODUCTION/);
    }
  });
  it('does not throw for P1 review formats', () => {
    for (const f of P1_FORMATS) expect(() => assertExportFormatNotProductionShaped(f)).not.toThrow();
  });
});

describe('P2 egress functions are contained', () => {
  it('downloadExportZip refuses a P2 manufacturing format before any network/DOM egress', async () => {
    await expect(
      downloadExportZip({ bundleId: 'B-1', format: 'DXF_R12', jobName: 'job' }),
    ).rejects.toThrow(/NOT_FOR_PRODUCTION/);
    await expect(
      downloadExportZip({ bundleId: 'B-1', format: 'GCODE', jobName: 'job' }),
    ).rejects.toThrow(/NOT_FOR_PRODUCTION/);
    await expect(
      downloadExportZip({ bundleId: 'B-1', format: 'CUTLIST_CSV', jobName: 'job' }),
    ).rejects.toThrow(/NOT_FOR_PRODUCTION/);
  });

  it('exportAndDownload refuses a P2 manufacturing format', async () => {
    await expect(exportAndDownload('B-1', 'STEP', 'job')).rejects.toThrow(/NOT_FOR_PRODUCTION/);
  });
});

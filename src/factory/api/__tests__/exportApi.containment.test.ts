/**
 * exportApi.containment.test.ts — Phase-Gate-C C16.
 *
 * The second signed-URL export client (src/factory/api/exportApi.ts) GETs a signed URL,
 * fetches the packet bytes, and triggers a browser download. Mirror the Task-11
 * containment guard: a production-shaped (P2 manufacturing) filename must be refused with
 * NOT_FOR_PRODUCTION before any byte reaches the browser (design §9). P1 review artifacts
 * are unaffected.
 */
import { describe, it, expect } from 'vitest';
import { triggerBrowserDownload } from '../exportApi';

describe('C16 — factory signed-URL export client egress is contained', () => {
  it('triggerBrowserDownload refuses a production-shaped filename before egress', () => {
    const blob = new Blob(['x']);
    expect(() => triggerBrowserDownload(blob, 'panel.dxf')).toThrow(/NOT_FOR_PRODUCTION/);
    expect(() => triggerBrowserDownload(blob, 'cutlist_ab12.csv')).toThrow(/NOT_FOR_PRODUCTION/);
    expect(() => triggerBrowserDownload(blob, 'job.gcode')).toThrow(/NOT_FOR_PRODUCTION/);
    expect(() => triggerBrowserDownload(blob, 'NFP-factory-packet-1.zip')).toThrow(/NOT_FOR_PRODUCTION/);
  });
});

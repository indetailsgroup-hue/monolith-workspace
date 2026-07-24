/**
 * Browser Download Utility
 *
 * Downloads text content as a file in the browser.
 *
 * Trust Kernel containment (Task 11, design §9): production-shaped (P2
 * manufacturing) content — cut lists, CNC/DXF, packets — can never be written to a
 * human through a browser download. `assertNotProductionShaped` throws before any
 * egress; P1 review artifacts (JSON manifests, evidence, PDF) pass unchanged.
 */

import { assertNotProductionShaped } from '../../factory/packet/trustKernelProjection';

/**
 * Download text content as a file
 *
 * @param filename - Name for the downloaded file
 * @param content - Text content to download
 * @param mime - MIME type (default: text/csv)
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8'
) {
  assertNotProductionShaped(filename);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Revoke after a short delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

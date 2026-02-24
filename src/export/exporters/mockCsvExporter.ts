/**
 * Mock CSV Exporter
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Creates cut list CSV from snapshot/opgraph
 * - MVP implementation for testing
 *
 * v1.0: Initial mock CSV exporter
 */

import type { Exporter } from './exporterTypes';
import type { ArtifactFile } from '../types';
import { fnv1aHash } from '../../core/manufacturing/release/signer';

/**
 * Create artifact file from content.
 */
function mkFile(path: string, content: string): ArtifactFile {
  const bytes = new TextEncoder().encode(content).byteLength;
  const hash = fnv1aHash(content);
  return { path, content, bytes, hash };
}

/**
 * Mock cut list CSV exporter.
 * Creates a summary CSV from opgraph nodes.
 */
export const mockCutlistCsvExporter: Exporter = {
  format: 'CUTLIST_CSV',

  export: ({ bundleJson, jobName }) => {
    // Parse bundle to extract opgraph info
    let opCount = 0;
    let snapshotId = 'unknown';

    try {
      const bundle = JSON.parse(bundleJson);
      const opGraphFile = bundle?.files?.find((f: { path: string }) => f.path === 'opgraph.json');
      if (opGraphFile) {
        const opGraph = JSON.parse(opGraphFile.content);
        opCount = opGraph?.nodes?.length ?? 0;
      }

      const manifestFile = bundle?.files?.find((f: { path: string }) => f.path === 'manifest.json');
      if (manifestFile) {
        const manifest = JSON.parse(manifestFile.content);
        snapshotId = manifest?.snapshotId ?? 'unknown';
      }
    } catch {
      // Ignore parse errors, use defaults
    }

    // Generate CSV content
    const now = new Date().toISOString();
    const csv = [
      'Metric,Value',
      `JobName,${jobName}`,
      `SnapshotId,${snapshotId}`,
      `OpGraphNodes,${opCount}`,
      `GeneratedAt,${now}`,
      '',
      '# This is a mock cut list CSV.',
      '# In production, this would contain actual panel dimensions and operations.',
    ].join('\n');

    const filename = `${jobName}_cutlist.csv`;

    return {
      files: [mkFile(`exports/${filename}`, csv)],
    };
  },
};

/**
 * Artifact Bundle Converter
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Converts ReleaseBundle → ArtifactBundle for verified export
 *
 * v1.0: Initial artifact bundle converter
 */

import type { ArtifactBundle } from './types';
import type { ReleaseBundle } from '../core/manufacturing/release/types';

/**
 * Get current ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Convert ReleaseBundle to ArtifactBundle for export.
 */
export function toArtifactBundle(release: ReleaseBundle): ArtifactBundle {
  return {
    version: 'artifact-bundle.v1',
    createdAtIso: nowIso(),
    files: release.files.map((f) => ({
      path: f.path,
      bytes: f.bytes,
      hash: f.hash,
      content: f.content,
    })),
  };
}

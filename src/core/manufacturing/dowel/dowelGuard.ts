/**
 * dowelGuard.ts — Preview-only guard for Dowel hardware editor
 *
 * Uses the shared createPreviewGuard() framework from core/guards.
 * Prevents DowelPreviewState fields from leaking into manufacturing
 * config or CNC compiler.
 *
 * @version 1.0.0
 */

import { createPreviewGuard } from '../../guards/previewOnly';
import type { DowelPreviewState } from './types';
import { DOWEL_PREVIEW_ONLY_KEYS } from './types';

/**
 * Dowel preview guard instance.
 *
 * @example
 * ```typescript
 * // Sanitize before compiler
 * const clean = dowelGuard.sanitize(fullEditorState);
 *
 * // Dev-only assert at compiler boundary
 * dowelGuard.assertClean(config, 'generateDowelDrillMap');
 * ```
 */
export const dowelGuard = createPreviewGuard<DowelPreviewState>(
  DOWEL_PREVIEW_ONLY_KEYS,
  'DowelConfig',
);

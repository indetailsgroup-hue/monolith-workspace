/**
 * previewOnly.ts — Generic preview-only guard framework
 *
 * Provides type-safe guard factories for any hardware editor that has
 * "preview-only" fields (flip, rotate, move, etc.) that must never
 * leak into manufacturing config or CNC compiler.
 *
 * Usage (per hardware type):
 *
 *   const minifixGuard = createPreviewGuard<MinifixPreviewState>(
 *     MINIFIX_PREVIEW_ONLY_KEYS,
 *     'MinifixConfig'
 *   );
 *
 *   // Sanitize before Copy Config / Save / Compiler
 *   const clean = minifixGuard.sanitize(fullConfig);
 *
 *   // Dev-only assert at compiler boundary
 *   minifixGuard.assertClean(fullConfig);
 *
 * @version 1.0.0
 */

// ============================================================================
// Generic Guard Factory
// ============================================================================

/**
 * Guard instance returned by createPreviewGuard().
 * Type-safe for a specific PreviewState shape.
 */
export interface PreviewGuard<TPreview, TFull extends TPreview> {
  /** The registered preview-only keys */
  readonly keys: readonly (keyof TPreview)[];

  /** Strip preview-only fields — returns clean manufacturing config */
  sanitize(config: TFull): Omit<TFull, keyof TPreview>;

  /**
   * Dev-only runtime assert: throws if any preview key is present.
   * Place at compiler boundaries (e.g. generateDrillMap entry).
   */
  assertClean(config: Record<string, unknown>, context?: string): void;
}

/**
 * Create a type-safe preview guard for a hardware editor.
 *
 * @param keys - Array of preview-only field names (must match TPreview)
 * @param label - Human-readable label for error messages (e.g. 'MinifixConfig')
 * @returns PreviewGuard instance with sanitize() and assertClean()
 *
 * @example
 * ```typescript
 * const guard = createPreviewGuard<MinifixPreviewState>(
 *   ['flipVertical', 'flipHorizontal', 'rotationX', ...],
 *   'MinifixConfig'
 * );
 * ```
 */
export function createPreviewGuard<TPreview>(
  keys: readonly (keyof TPreview)[],
  label: string
): PreviewGuard<TPreview, any> {
  return {
    keys,

    sanitize<TFull extends TPreview>(config: TFull): Omit<TFull, keyof TPreview> {
      const clean = { ...config };
      for (const key of keys) {
        delete (clean as Record<string, unknown>)[key as string];
      }
      return clean as Omit<TFull, keyof TPreview>;
    },

    assertClean(config: Record<string, unknown>, context?: string): void {
      // Only run in development — zero cost in production
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        for (const k of keys) {
          if ((k as string) in config) {
            throw new Error(
              `[Monolith] Preview-only key "${String(k)}" leaked into ${context ?? label}. ` +
              `Use ${label} guard.sanitize() before passing config to compiler.`
            );
          }
        }
      }
    },
  };
}

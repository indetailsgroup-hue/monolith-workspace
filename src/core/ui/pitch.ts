/**
 * Pitch Mode Helper
 * Priority 5A: Clean demo/presentation mode
 *
 * Usage: Add ?pitch=1 to any ProjectHome URL
 * Effect: Hides technical noise, shows narrative + CTAs
 *
 * @version 0.12.5
 */

/**
 * Check if pitch mode is enabled via query param
 * Accepts: ?pitch=1, ?pitch=true, ?pitch=yes
 */
export function isPitchMode(search: string): boolean {
  const q = new URLSearchParams(search);
  const v = (q.get('pitch') ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Append current search params to a path (preserves pitch mode)
 */
export function withSearchParams(path: string, search: string): string {
  if (!search || search === '?') return path;
  return `${path}${search}`;
}

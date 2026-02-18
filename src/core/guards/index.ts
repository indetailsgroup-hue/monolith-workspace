/**
 * Guards Module — Shared safety guards for hardware editors
 *
 * Prevents preview-only fields from leaking into manufacturing config.
 * Each hardware editor creates its own guard instance via createPreviewGuard().
 */

export { createPreviewGuard } from './previewOnly';
export type { PreviewGuard } from './previewOnly';

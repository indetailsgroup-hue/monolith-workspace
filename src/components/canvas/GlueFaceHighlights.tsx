/**
 * Glue Face Highlights (Stub)
 *
 * Visual overlay for cabinet face selection during glue mode.
 */

interface GlueFaceHighlightsProps {
  cabinetId?: string;
  dimensions?: { width: number; height: number; depth: number };
  position?: number[];
  insideGroup?: boolean;
  [key: string]: unknown;
}

/** Glue face highlight meshes on cabinet panels */
export function GlueFaceHighlights(_props: GlueFaceHighlightsProps) {
  return null;
}

/** Glue mode status overlay (HUD) */
export function GlueModeOverlay() {
  return null;
}

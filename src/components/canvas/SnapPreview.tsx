/**
 * Snap Preview (Stub)
 *
 * Visual preview of snap targets during cabinet movement.
 */

import type { CabinetDimensions } from '../../core/types/Cabinet';

interface SnapPreviewProps {
  dimensions?: CabinetDimensions;
  currentPosition?: [number, number, number];
  [key: string]: unknown;
}

export function SnapPreview(_props: SnapPreviewProps) {
  return null;
}

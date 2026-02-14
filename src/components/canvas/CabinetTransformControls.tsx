/**
 * Cabinet Transform Controls (Stub)
 *
 * Provides move/rotate/scale handles for selected cabinet.
 */

import type { RefObject } from 'react';
import type { Group } from 'three';

interface CabinetTransformControlsProps {
  cabinetId?: string;
  targetRef?: RefObject<Group>;
  enabled?: boolean;
  [key: string]: unknown;
}

export function CabinetTransformControls(_props: CabinetTransformControlsProps) {
  return null;
}

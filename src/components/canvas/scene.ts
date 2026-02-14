/**
 * Scene Utilities (Stub)
 *
 * Scene object reference wrapper for Three.js objects.
 */

import { forwardRef, type ReactNode } from 'react';
import type { Group } from 'three';

interface SceneObjectRefProps {
  children?: ReactNode;
  id?: string;
  [key: string]: unknown;
}

/** Scene object reference - wraps children in a group */
export const SceneObjectRef = forwardRef<Group, SceneObjectRefProps>(
  function SceneObjectRef(_props, _ref) {
    return null;
  }
);

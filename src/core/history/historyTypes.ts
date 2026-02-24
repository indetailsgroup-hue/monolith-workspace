/**
 * historyTypes.ts - Feature History System Types
 *
 * ARCHITECTURE (North Star v4.0):
 * - FeatureNode represents an operation that can be undone/redone
 * - Each feature has inputs, outputs, and deterministic params
 * - Gate can validate features for manufacturing constraints
 *
 * FEATURE KINDS:
 * - CABINET_CREATE: Create a new cabinet
 * - CABINET_UPDATE: Update cabinet parameters
 * - CABINET_SNAP: Snap two cabinets together
 * - PANEL_OVERRIDE: Override panel material/dimension
 */

import { CabinetSnapParams } from '../types/SnapTypes';

// ============================================
// FEATURE KINDS
// ============================================

export type FeatureKind =
  | 'CABINET_CREATE'
  | 'CABINET_UPDATE'
  | 'CABINET_DELETE'
  | 'CABINET_SNAP'
  | 'CABINET_MOVE'
  | 'CABINET_ROTATE'
  | 'PANEL_OVERRIDE'
  | 'MATERIAL_CHANGE'
  | 'DIMENSION_CHANGE';

// ============================================
// FEATURE NODE
// ============================================

export interface FeatureMeta {
  comment?: string;
  tags?: string[];
  source?: 'user' | 'system' | 'snap' | 'import';
}

export interface FeatureNode<TParams = unknown> {
  id: string;
  jobId: string;
  kind: FeatureKind;

  // References to affected objects
  inputRefs: string[];  // IDs of objects this feature reads from
  outputRefs: string[]; // IDs of objects this feature modifies

  // Feature parameters (deterministic)
  params: TParams;

  // Timestamps
  createdAt: string;    // ISO 8601
  createdBy: string;    // User or system ID

  // Metadata
  meta?: FeatureMeta;

  // Undo state
  undone?: boolean;
}

// ============================================
// CABINET SNAP FEATURE
// ============================================

export interface CabinetSnapFeature extends FeatureNode<CabinetSnapParams> {
  kind: 'CABINET_SNAP';
}

/**
 * Create a CABINET_SNAP feature node
 */
export function makeCabinetSnapFeature(
  params: CabinetSnapParams,
  jobId: string,
  createdBy: string = 'user'
): CabinetSnapFeature {
  const nowIso = new Date().toISOString();

  return {
    id: `feat-snap-${params.bCabId}-${Date.now()}`,
    jobId,
    kind: 'CABINET_SNAP',
    inputRefs: [params.aCabId, params.bCabId],
    outputRefs: [params.bCabId],
    params,
    createdAt: nowIso,
    createdBy,
    meta: {
      comment: `Rigid snap ${params.snapType}: ${params.bCabId} → ${params.aCabId}`,
      tags: ['snap', 'cabinet', 'rigid'],
      source: 'snap',
    },
  };
}

// ============================================
// CABINET MOVE FEATURE
// ============================================

export interface CabinetMoveParams {
  cabinetId: string;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  wasSnapped: boolean;
  snapType?: string;
  snapTargetId?: string;
}

export interface CabinetMoveFeature extends FeatureNode<CabinetMoveParams> {
  kind: 'CABINET_MOVE';
}

/**
 * Create a CABINET_MOVE feature node
 */
export function makeCabinetMoveFeature(
  params: CabinetMoveParams,
  jobId: string,
  createdBy: string = 'user'
): CabinetMoveFeature {
  const nowIso = new Date().toISOString();

  return {
    id: `feat-move-${params.cabinetId}-${Date.now()}`,
    jobId,
    kind: 'CABINET_MOVE',
    inputRefs: [params.cabinetId],
    outputRefs: [params.cabinetId],
    params,
    createdAt: nowIso,
    createdBy,
    meta: {
      comment: params.wasSnapped
        ? `Move + snap (${params.snapType})`
        : 'Move cabinet',
      tags: params.wasSnapped ? ['move', 'snap'] : ['move'],
      source: params.wasSnapped ? 'snap' : 'user',
    },
  };
}

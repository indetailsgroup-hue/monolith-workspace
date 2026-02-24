/**
 * Collision Module Index
 *
 * Comprehensive collision detection system for cabinet workspace
 */

// OBB Types
export type {
  OBB,
  CabinetCollisionShape,
  ObstacleKind,
  WorldObstacleShape,
  AABB,
  CollisionResult,
} from './obbTypes';
export {
  obbToAabb,
  mergeAabb,
  obbsToAabb,
  expandAabb,
  aabbOverlap,
  translateObb,
  translateCollisionShape,
} from './obbTypes';

// Collision Engine
export type {
  CollisionContextOBB,
  CollisionHit,
} from './collisionEngine';
export {
  detectCollisionForMovedCabinet,
  detectAllCollisions,
} from './collisionEngine';

// Collision Report (Multi-Select)
export type {
  CollisionSeverity,
  CollisionReason,
  CollisionSource,
  CollisionPair,
  CollisionReport,
  CollisionSummary,
} from './collisionReport';
export {
  createEmptyCollisionReport,
  isCollisionBlocked,
  getWorstPenetration,
  getWorstGap,
  getCollidingIds,
  filterBySource,
  mergeCollisionReports,
  summarizeCollisionReport,
} from './collisionReport';

// Collision Adapter
export type {
  CabinetInstanceMinimal,
  PairTestResult,
  CollisionAdapter,
} from './collisionAdapter';
export {
  STUB_COLLISION_ADAPTER,
  createSimpleAabbAdapter,
} from './collisionAdapter';

// Selection Collision
export type {
  SelectionCollisionConfig,
  NonSelectedProvider,
} from './selectionCollision';
export {
  DEFAULT_SELECTION_COLLISION_CONFIG,
  makeNonSelectedProvider,
  checkSelectionCollision,
  hasSelectionCollision,
  checkSingleCabinetCollision,
} from './selectionCollision';

// Clamp Delta by Collision
export type {
  ClampDeltaConfig,
  ClampDeltaResult,
} from './clampDeltaByCollision';
export {
  DEFAULT_CLAMP_CONFIG,
  clampDeltaByCollision,
  clampDeltaAlongAxis,
  quickClampDelta,
} from './clampDeltaByCollision';

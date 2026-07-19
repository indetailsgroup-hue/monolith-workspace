/**
 * collisionContextBuilder.ts - Build Collision Context from Spatial Hash
 *
 * FEATURES:
 * - Queries nearby obstacles and cabinets using spatial hash
 * - Builds CollisionContextOBB for collision detection
 * - Padding ensures objects just outside AABB are included
 */

import type { OBB, CabinetCollisionShape, WorldObstacleShape, AABB } from './obbTypes';
import { obbToAabb, mergeAabb, expandAabb } from './obbTypes';
import type { CollisionContextOBB } from './collisionEngine';
import type { SpatialHash, SpatialItem } from '../spatial/spatialHash';
import type { ObstacleKind } from './obbTypes';

// ============================================
// TYPES
// ============================================

export interface SpatialRegistries {
  obstacles: SpatialHash<{ kind: ObstacleKind }>;
  // No per-cabinet payload today; `{}` would have accepted any non-nullish
  // value (including 0 and ""), which is not what "no payload" means.
  cabinets: SpatialHash<Record<string, never>>;
}

export interface ShapeRegistries {
  obstacleShapesById: Map<string, WorldObstacleShape>;
  cabinetShapesById: Map<string, CabinetCollisionShape>;
}

// ============================================
// UTILITIES
// ============================================

function obbsToAabb(obbs: OBB[]): AABB {
  if (obbs.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  let aabb = obbToAabb(obbs[0]);
  for (let i = 1; i < obbs.length; i++) {
    aabb = mergeAabb(aabb, obbToAabb(obbs[i]));
  }
  return aabb;
}

// ============================================
// COLLISION CONTEXT BUILDER
// ============================================

/**
 * Build collision context for objects near the moved shape
 *
 * @param movedShapeObbs - OBBs of the object being moved
 * @param spatial - Spatial hash grids for obstacles and cabinets
 * @param registries - Maps from IDs to full shape data
 * @param paddingMm - Extra padding for the query AABB (default 150mm)
 * @returns CollisionContextOBB with nearby obstacles and cabinets
 */
export function buildCollisionContextNear(
  movedShapeObbs: OBB[],
  spatial: SpatialRegistries,
  registries: ShapeRegistries,
  paddingMm: number = 150
): CollisionContextOBB {
  // Compute AABB of moved shape
  const aabb0 = obbsToAabb(movedShapeObbs);

  // Expand by padding
  const aabb = expandAabb(aabb0, paddingMm);

  // Query spatial hash for nearby items
  const obsItems = spatial.obstacles.queryByAabb(aabb);
  const cabItems = spatial.cabinets.queryByAabb(aabb);

  // Resolve full shapes from registries
  const obstacles: WorldObstacleShape[] = [];
  for (const item of obsItems) {
    const shape = registries.obstacleShapesById.get(item.id);
    if (shape) {
      obstacles.push(shape);
    }
  }

  const cabinets: Array<{ id: string; shape: CabinetCollisionShape }> = [];
  for (const item of cabItems) {
    const shape = registries.cabinetShapesById.get(item.id);
    if (shape) {
      cabinets.push({ id: item.id, shape });
    }
  }

  return { obstacles, cabinets };
}

/**
 * Build full collision context (all objects, no spatial filtering)
 * Use for small scenes or when spatial hash is not available
 */
export function buildFullCollisionContext(
  registries: ShapeRegistries
): CollisionContextOBB {
  const obstacles = Array.from(registries.obstacleShapesById.values());
  const cabinets = Array.from(registries.cabinetShapesById.entries())
    .map(([id, shape]) => ({ id, shape }));

  return { obstacles, cabinets };
}

/**
 * Build collision context excluding a specific cabinet
 * (used when checking collision for a moving cabinet)
 */
export function buildCollisionContextExcluding(
  excludeCabId: string,
  spatial: SpatialRegistries,
  registries: ShapeRegistries,
  queryAabb: AABB
): CollisionContextOBB {
  const obsItems = spatial.obstacles.queryByAabb(queryAabb);
  const cabItems = spatial.cabinets.queryByAabb(queryAabb);

  const obstacles: WorldObstacleShape[] = [];
  for (const item of obsItems) {
    const shape = registries.obstacleShapesById.get(item.id);
    if (shape) obstacles.push(shape);
  }

  const cabinets: Array<{ id: string; shape: CabinetCollisionShape }> = [];
  for (const item of cabItems) {
    // Exclude the moving cabinet
    if (item.id === excludeCabId) continue;

    const shape = registries.cabinetShapesById.get(item.id);
    if (shape) cabinets.push({ id: item.id, shape });
  }

  return { obstacles, cabinets };
}

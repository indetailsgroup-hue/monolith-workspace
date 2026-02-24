/**
 * Transform Utilities
 *
 * Step 10.2: Rotation and translation for DXF entities
 *
 * Supports:
 * - 0° (no rotation)
 * - 90° clockwise rotation around origin
 *
 * Coordinate system:
 * - Origin at bottom-left of part
 * - 90° CW: (x,y) -> (y, W-x) where W is original width
 */

import type { DxfEntity, DxfPoint } from './dxfTypes.js';

// ============================================================================
// Types
// ============================================================================

export type Rotation = 0 | 90;

// ============================================================================
// Point Rotation
// ============================================================================

/**
 * Rotate a point 90° clockwise around origin.
 * (x, y) -> (y, W - x) where W is original width
 */
function rotatePoint90CW(x: number, y: number, w: number): { x: number; y: number } {
  return { x: y, y: w - x };
}

/**
 * Rotate a point by specified rotation.
 */
export function rotatePoint(
  x: number,
  y: number,
  rot: Rotation,
  w: number,
  _h: number
): { x: number; y: number } {
  if (rot === 0) return { x, y };
  return rotatePoint90CW(x, y, w);
}

/**
 * Get rotated dimensions.
 * 90° rotation swaps width and height.
 */
export function rotatedDims(w: number, h: number, rot: Rotation): { w: number; h: number } {
  return rot === 0 ? { w, h } : { w: h, h: w };
}

// ============================================================================
// Entity Transformation
// ============================================================================

/**
 * Transform a single entity: rotate then translate.
 *
 * @param entity - DXF entity to transform
 * @param rot - Rotation (0 or 90 degrees CW)
 * @param w - Original part width (before rotation)
 * @param h - Original part height (before rotation)
 * @param dx - X translation after rotation
 * @param dy - Y translation after rotation
 */
export function transformEntity(
  entity: DxfEntity,
  rot: Rotation,
  w: number,
  h: number,
  dx: number,
  dy: number
): DxfEntity {
  switch (entity.type) {
    case 'LINE': {
      const p1 = rotatePoint(entity.p1.x, entity.p1.y, rot, w, h);
      const p2 = rotatePoint(entity.p2.x, entity.p2.y, rot, w, h);
      return {
        ...entity,
        p1: { x: p1.x + dx, y: p1.y + dy, z: entity.p1.z },
        p2: { x: p2.x + dx, y: p2.y + dy, z: entity.p2.z },
      };
    }

    case 'CIRCLE': {
      const c = rotatePoint(entity.center.x, entity.center.y, rot, w, h);
      return {
        ...entity,
        center: { x: c.x + dx, y: c.y + dy, z: entity.center.z },
      };
    }

    case 'ARC': {
      const c = rotatePoint(entity.center.x, entity.center.y, rot, w, h);
      // Rotate arc angles when rotating entity
      const startAngle = rot === 0 ? entity.startAngle : (entity.startAngle - 90 + 360) % 360;
      const endAngle = rot === 0 ? entity.endAngle : (entity.endAngle - 90 + 360) % 360;
      return {
        ...entity,
        center: { x: c.x + dx, y: c.y + dy, z: entity.center.z },
        startAngle,
        endAngle,
      };
    }

    case 'TEXT': {
      const p = rotatePoint(entity.position.x, entity.position.y, rot, w, h);
      // Rotate text angle
      const rotation = rot === 0 ? entity.rotation : ((entity.rotation ?? 0) + 90) % 360;
      return {
        ...entity,
        position: { x: p.x + dx, y: p.y + dy, z: entity.position.z },
        rotation,
      };
    }

    case 'POINT': {
      const p = rotatePoint(entity.position.x, entity.position.y, rot, w, h);
      return {
        ...entity,
        position: { x: p.x + dx, y: p.y + dy, z: entity.position.z },
      };
    }

    case 'POLYLINE': {
      const points = entity.points.map(pt => {
        const r = rotatePoint(pt.x, pt.y, rot, w, h);
        return { x: r.x + dx, y: r.y + dy, z: pt.z };
      });
      return {
        ...entity,
        points,
      };
    }

    default:
      return entity;
  }
}

/**
 * Transform all entities in an array.
 */
export function transformEntities(
  entities: DxfEntity[],
  rot: Rotation,
  w: number,
  h: number,
  dx: number,
  dy: number
): DxfEntity[] {
  return entities.map(e => transformEntity(e, rot, w, h, dx, dy));
}

/**
 * Simple translation without rotation.
 */
export function translateEntity(entity: DxfEntity, dx: number, dy: number): DxfEntity {
  return transformEntity(entity, 0, 0, 0, dx, dy);
}

/**
 * Simple translation for array of entities.
 */
export function translateEntitiesSimple(entities: DxfEntity[], dx: number, dy: number): DxfEntity[] {
  return entities.map(e => translateEntity(e, dx, dy));
}

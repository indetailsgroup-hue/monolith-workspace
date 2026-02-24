/**
 * spatialHash.ts - Spatial Hash Grid for Broad-phase Collision Detection
 *
 * ALGORITHM:
 * - 3D grid with configurable cell size
 * - Objects inserted into cells based on their AABB
 * - Query returns only objects in nearby cells
 *
 * PERFORMANCE:
 * - cellSize = 500mm recommended for cabinet scenes
 * - Reduces O(n²) to O(n * k) where k = objects in nearby cells
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB, AABB } from '../collision/obbTypes';
import { obbToAabb, mergeAabb } from '../collision/obbTypes';

// ============================================
// TYPES
// ============================================

export interface SpatialItem<T = unknown> {
  id: string;
  obbs: OBB[];
  payload?: T;
}

type CellKey = string;

// ============================================
// UTILITIES
// ============================================

function cellKey(ix: number, iy: number, iz: number): CellKey {
  return `${ix},${iy},${iz}`;
}

function floorDiv(v: number, s: number): number {
  return Math.floor(v / s);
}

function itemAabb(item: SpatialItem): AABB {
  if (item.obbs.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  let aabb = obbToAabb(item.obbs[0]);
  for (let i = 1; i < item.obbs.length; i++) {
    aabb = mergeAabb(aabb, obbToAabb(item.obbs[i]));
  }
  return aabb;
}

// ============================================
// SPATIAL HASH CLASS
// ============================================

export class SpatialHash<T = unknown> {
  private cellSize: number;
  private cells = new Map<CellKey, Set<string>>();
  private items = new Map<string, SpatialItem<T>>();

  // Reverse index: item -> cells (for efficient removal)
  private itemToCells = new Map<string, Set<CellKey>>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.cells.clear();
    this.items.clear();
    this.itemToCells.clear();
  }

  /**
   * Get cell size
   */
  getCellSize(): number {
    return this.cellSize;
  }

  /**
   * Get number of items
   */
  size(): number {
    return this.items.size;
  }

  /**
   * Insert or update an item
   */
  upsert(item: SpatialItem<T>): void {
    // Remove old if exists (O(1) with reverse index)
    this.remove(item.id);

    // Store item
    this.items.set(item.id, item);

    // Compute AABB and cell range
    const aabb = itemAabb(item);
    const ix0 = floorDiv(aabb.min.x, this.cellSize);
    const iy0 = floorDiv(aabb.min.y, this.cellSize);
    const iz0 = floorDiv(aabb.min.z, this.cellSize);
    const ix1 = floorDiv(aabb.max.x, this.cellSize);
    const iy1 = floorDiv(aabb.max.y, this.cellSize);
    const iz1 = floorDiv(aabb.max.z, this.cellSize);

    // Create reverse index entry
    const cellKeys = new Set<CellKey>();
    this.itemToCells.set(item.id, cellKeys);

    // Insert into cells
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = cellKey(ix, iy, iz);

          let set = this.cells.get(key);
          if (!set) {
            set = new Set();
            this.cells.set(key, set);
          }
          set.add(item.id);
          cellKeys.add(key);
        }
      }
    }
  }

  /**
   * Remove an item by ID (O(1) with reverse index)
   */
  remove(id: string): boolean {
    const cellKeys = this.itemToCells.get(id);
    if (!cellKeys) return false;

    // Remove from all cells
    for (const key of cellKeys) {
      const set = this.cells.get(key);
      if (set) {
        set.delete(id);
        // Clean up empty cells
        if (set.size === 0) {
          this.cells.delete(key);
        }
      }
    }

    // Remove from maps
    this.itemToCells.delete(id);
    this.items.delete(id);

    return true;
  }

  /**
   * Check if item exists
   */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Get item by ID
   */
  get(id: string): SpatialItem<T> | undefined {
    return this.items.get(id);
  }

  /**
   * Query items that may intersect with the given AABB
   */
  queryByAabb(aabb: AABB): SpatialItem<T>[] {
    const ix0 = floorDiv(aabb.min.x, this.cellSize);
    const iy0 = floorDiv(aabb.min.y, this.cellSize);
    const iz0 = floorDiv(aabb.min.z, this.cellSize);
    const ix1 = floorDiv(aabb.max.x, this.cellSize);
    const iy1 = floorDiv(aabb.max.y, this.cellSize);
    const iz1 = floorDiv(aabb.max.z, this.cellSize);

    const ids = new Set<string>();

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = cellKey(ix, iy, iz);
          const set = this.cells.get(key);
          if (set) {
            for (const id of set) {
              ids.add(id);
            }
          }
        }
      }
    }

    return Array.from(ids)
      .map(id => this.items.get(id))
      .filter((item): item is SpatialItem<T> => item !== undefined);
  }

  /**
   * Query items near a point within radius
   */
  queryByPoint(point: Vec3, radius: number): SpatialItem<T>[] {
    const aabb: AABB = {
      min: { x: point.x - radius, y: point.y - radius, z: point.z - radius },
      max: { x: point.x + radius, y: point.y + radius, z: point.z + radius },
    };
    return this.queryByAabb(aabb);
  }

  /**
   * Query items near OBBs (with padding)
   */
  queryByObbs(obbs: OBB[], padding: number = 0): SpatialItem<T>[] {
    if (obbs.length === 0) return [];

    let aabb = obbToAabb(obbs[0]);
    for (let i = 1; i < obbs.length; i++) {
      aabb = mergeAabb(aabb, obbToAabb(obbs[i]));
    }

    // Expand by padding
    if (padding > 0) {
      aabb = {
        min: {
          x: aabb.min.x - padding,
          y: aabb.min.y - padding,
          z: aabb.min.z - padding,
        },
        max: {
          x: aabb.max.x + padding,
          y: aabb.max.y + padding,
          z: aabb.max.z + padding,
        },
      };
    }

    return this.queryByAabb(aabb);
  }

  /**
   * Get all items
   */
  getAll(): SpatialItem<T>[] {
    return Array.from(this.items.values());
  }

  /**
   * Rebuild entire spatial hash (use after bulk changes)
   */
  rebuild(): void {
    const all = Array.from(this.items.values());
    this.clear();
    for (const item of all) {
      this.upsert(item);
    }
  }

  /**
   * Debug: get cell occupancy stats
   */
  getStats(): { itemCount: number; cellCount: number; avgItemsPerCell: number } {
    let totalItems = 0;
    for (const set of this.cells.values()) {
      totalItems += set.size;
    }
    return {
      itemCount: this.items.size,
      cellCount: this.cells.size,
      avgItemsPerCell: this.cells.size > 0 ? totalItems / this.cells.size : 0,
    };
  }
}

/**
 * spatialHashV3.ts - Spatial Hash with AABB Cache & Reverse Index
 *
 * OPTIMIZATIONS:
 * - AABB cache: No recomputation on query
 * - Reverse index: O(1) remove, delta-based updateObbs
 * - Incremental cell update: Only update changed cells
 *
 * PERFORMANCE:
 * - upsert: O(cells touched)
 * - remove: O(cells item was in)
 * - updateObbs: O(cells changed) - faster than full upsert
 * - query: O(cells in query + items in cells)
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB, AABB } from '../collision/obbTypes';
import { obbToAabb, mergeAabb } from '../collision/obbTypes';

// ============================================
// TYPES
// ============================================

export interface SpatialItemV3<T = unknown> {
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

function itemAabb(obbs: OBB[]): AABB {
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
// SPATIAL HASH V3 CLASS
// ============================================

export class SpatialHashV3<T = unknown> {
  private cellSize: number;

  // Cell key -> Set of item IDs in that cell
  private cells = new Map<CellKey, Set<string>>();

  // Item ID -> Item data
  private items = new Map<string, SpatialItemV3<T>>();

  // Item ID -> Set of cell keys (reverse index)
  private itemCells = new Map<string, Set<CellKey>>();

  // Item ID -> Cached AABB
  private itemsAabb = new Map<string, AABB>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  // ============================================
  // GETTERS
  // ============================================

  getCellSize(): number {
    return this.cellSize;
  }

  size(): number {
    return this.items.size;
  }

  get(id: string): SpatialItemV3<T> | null {
    return this.items.get(id) ?? null;
  }

  getAabb(id: string): AABB | null {
    return this.itemsAabb.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  // ============================================
  // INSERT / UPDATE
  // ============================================

  /**
   * Insert or replace an item
   */
  upsert(item: SpatialItemV3<T>): void {
    // Remove previous membership if exists
    this.remove(item.id);

    // Compute and cache AABB
    const aabb = itemAabb(item.obbs);
    this.items.set(item.id, item);
    this.itemsAabb.set(item.id, aabb);

    // Compute cell membership
    const membership = this.computeMembershipFromAabb(aabb);
    this.itemCells.set(item.id, membership);

    // Add to cells
    for (const key of membership) {
      let set = this.cells.get(key);
      if (!set) {
        set = new Set();
        this.cells.set(key, set);
      }
      set.add(item.id);
    }
  }

  /**
   * Update OBBs only (faster than full upsert when item exists)
   * Only updates cells that changed
   */
  updateObbs(id: string, obbs: OBB[]): void {
    const existing = this.items.get(id);
    if (!existing) return;

    // Compute new AABB
    const newAabb = itemAabb(obbs);
    const oldMembership = this.itemCells.get(id) ?? new Set<CellKey>();
    const newMembership = this.computeMembershipFromAabb(newAabb);

    // Remove from cells no longer in membership
    for (const key of oldMembership) {
      if (newMembership.has(key)) continue;

      const set = this.cells.get(key);
      if (!set) continue;

      set.delete(id);
      if (set.size === 0) {
        this.cells.delete(key);
      }
    }

    // Add to new cells
    for (const key of newMembership) {
      if (oldMembership.has(key)) continue;

      let set = this.cells.get(key);
      if (!set) {
        set = new Set();
        this.cells.set(key, set);
      }
      set.add(id);
    }

    // Update stored data
    this.items.set(id, { ...existing, obbs });
    this.itemsAabb.set(id, newAabb);
    this.itemCells.set(id, newMembership);
  }

  // ============================================
  // REMOVE
  // ============================================

  /**
   * Remove item by ID
   */
  remove(id: string): boolean {
    const membership = this.itemCells.get(id);
    if (!membership) return false;

    // Remove from all cells
    for (const key of membership) {
      const set = this.cells.get(key);
      if (!set) continue;

      set.delete(id);
      if (set.size === 0) {
        this.cells.delete(key);
      }
    }

    // Clean up
    this.itemCells.delete(id);
    this.items.delete(id);
    this.itemsAabb.delete(id);

    return true;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.cells.clear();
    this.items.clear();
    this.itemCells.clear();
    this.itemsAabb.clear();
  }

  // ============================================
  // QUERY
  // ============================================

  /**
   * Query items in AABB region
   */
  queryByAabb(aabb: AABB): SpatialItemV3<T>[] {
    const membership = this.computeMembershipFromAabb(aabb);

    const ids = new Set<string>();
    for (const key of membership) {
      const set = this.cells.get(key);
      if (!set) continue;

      for (const id of set) {
        ids.add(id);
      }
    }

    const result: SpatialItemV3<T>[] = [];
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) result.push(item);
    }

    return result;
  }

  /**
   * Query items near a point with radius
   */
  queryByPoint(point: Vec3, radius: number): SpatialItemV3<T>[] {
    return this.queryByAabb({
      min: { x: point.x - radius, y: point.y - radius, z: point.z - radius },
      max: { x: point.x + radius, y: point.y + radius, z: point.z + radius },
    });
  }

  /**
   * Query items near OBBs with padding
   */
  queryByObbs(obbs: OBB[], padding: number = 0): SpatialItemV3<T>[] {
    if (obbs.length === 0) return [];

    let aabb = itemAabb(obbs);

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
  getAll(): SpatialItemV3<T>[] {
    return Array.from(this.items.values());
  }

  // ============================================
  // INTERNAL
  // ============================================

  private computeMembershipFromAabb(aabb: AABB): Set<CellKey> {
    const ix0 = floorDiv(aabb.min.x, this.cellSize);
    const iy0 = floorDiv(aabb.min.y, this.cellSize);
    const iz0 = floorDiv(aabb.min.z, this.cellSize);
    const ix1 = floorDiv(aabb.max.x, this.cellSize);
    const iy1 = floorDiv(aabb.max.y, this.cellSize);
    const iz1 = floorDiv(aabb.max.z, this.cellSize);

    const membership = new Set<CellKey>();

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          membership.add(cellKey(ix, iy, iz));
        }
      }
    }

    return membership;
  }

  // ============================================
  // STATISTICS
  // ============================================

  getStats(): {
    itemCount: number;
    cellCount: number;
    avgItemsPerCell: number;
    maxItemsPerCell: number;
  } {
    let totalItems = 0;
    let maxItems = 0;

    for (const set of this.cells.values()) {
      totalItems += set.size;
      maxItems = Math.max(maxItems, set.size);
    }

    return {
      itemCount: this.items.size,
      cellCount: this.cells.size,
      avgItemsPerCell: this.cells.size > 0 ? totalItems / this.cells.size : 0,
      maxItemsPerCell: maxItems,
    };
  }
}

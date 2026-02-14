/**
 * worldCollisionRegistryV2.ts - Registry with SpatialHashV3
 *
 * OPTIMIZATIONS:
 * - Uses SpatialHashV3 with AABB cache
 * - O(1) remove via reverse index
 * - Delta-based updateObbs for incremental updates
 * - Unified query interface
 *
 * ARCHITECTURE:
 * - Obstacles: walls, columns, appliances
 * - Cabinet bodies: carcass collision shapes
 * - Cabinet use envelopes: door/drawer clearance (not in spatial hash)
 */

import type { CabinetCollisionShape, WorldObstacleShape, OBB, AABB, ObstacleKind } from '../collision/obbTypes';
import { SpatialHashV3, type SpatialItemV3 } from '../spatial/spatialHashV3';
import { SPATIAL_CONFIG } from '../config/snapClearanceConfig';

// ============================================
// TYPES
// ============================================

export interface ObstaclePayload {
  kind: ObstacleKind;
}

export interface CabinetPayload {
  // Cabinet-specific data if needed
}

export interface QueryResult<T> {
  id: string;
  obbs: OBB[];
  payload?: T;
}

// ============================================
// WORLD COLLISION REGISTRY V2 CLASS
// ============================================

export class WorldCollisionRegistryV2 {
  // ============================================
  // SPATIAL HASH GRIDS (V3)
  // ============================================

  /** Spatial hash for obstacles */
  private spatialObstacles = new SpatialHashV3<ObstaclePayload>(SPATIAL_CONFIG.cellSizeMm);

  /** Spatial hash for cabinet bodies */
  private spatialCabinets = new SpatialHashV3<CabinetPayload>(SPATIAL_CONFIG.cellSizeMm);

  // ============================================
  // NON-SPATIAL STORAGE
  // ============================================

  /** Cabinet use envelope shapes by ID (not in spatial hash) */
  private cabinetUseEnvById = new Map<string, CabinetCollisionShape>();

  /** Full obstacle data (for kind lookup) */
  private obstacleDataById = new Map<string, WorldObstacleShape>();

  // ============================================
  // OBSTACLE OPERATIONS
  // ============================================

  /**
   * Add or update an obstacle
   */
  upsertObstacle(shape: WorldObstacleShape): void {
    this.obstacleDataById.set(shape.id, shape);
    this.spatialObstacles.upsert({
      id: shape.id,
      obbs: shape.obbs,
      payload: { kind: shape.kind },
    });
  }

  /**
   * Update obstacle OBBs only (faster than full upsert)
   */
  updateObstacleObbs(id: string, obbs: OBB[]): void {
    const existing = this.obstacleDataById.get(id);
    if (!existing) return;

    existing.obbs = obbs;
    this.spatialObstacles.updateObbs(id, obbs);
  }

  /**
   * Remove an obstacle
   */
  removeObstacle(id: string): boolean {
    this.obstacleDataById.delete(id);
    return this.spatialObstacles.remove(id);
  }

  /**
   * Get obstacle by ID
   */
  getObstacle(id: string): WorldObstacleShape | undefined {
    return this.obstacleDataById.get(id);
  }

  /**
   * Get obstacle AABB (cached)
   */
  getObstacleAabb(id: string): AABB | null {
    return this.spatialObstacles.getAabb(id);
  }

  /**
   * Get all obstacles
   */
  getAllObstacles(): WorldObstacleShape[] {
    return Array.from(this.obstacleDataById.values());
  }

  // ============================================
  // CABINET BODY OPERATIONS
  // ============================================

  /**
   * Add or update cabinet body shape
   */
  upsertCabinetBody(id: string, body: CabinetCollisionShape): void {
    this.spatialCabinets.upsert({
      id,
      obbs: body.obbs,
    });
  }

  /**
   * Update cabinet body OBBs only (faster for drag operations)
   */
  updateCabinetBodyObbs(id: string, obbs: OBB[]): void {
    this.spatialCabinets.updateObbs(id, obbs);
  }

  /**
   * Remove cabinet body
   */
  removeCabinetBody(id: string): boolean {
    return this.spatialCabinets.remove(id);
  }

  /**
   * Get cabinet body shape
   */
  getCabinetBody(id: string): CabinetCollisionShape | undefined {
    const item = this.spatialCabinets.get(id);
    if (!item) return undefined;
    return { obbs: item.obbs };
  }

  /**
   * Get cabinet body AABB (cached)
   */
  getCabinetBodyAabb(id: string): AABB | null {
    return this.spatialCabinets.getAabb(id);
  }

  /**
   * Get all cabinet bodies
   */
  getAllCabinetBodies(): Array<{ id: string; shape: CabinetCollisionShape }> {
    return this.spatialCabinets.getAll().map(item => ({
      id: item.id,
      shape: { obbs: item.obbs },
    }));
  }

  // ============================================
  // CABINET USE ENVELOPE OPERATIONS
  // ============================================

  /**
   * Add or update cabinet use envelope (not in spatial hash)
   */
  upsertCabinetUseEnvelope(id: string, env: CabinetCollisionShape): void {
    this.cabinetUseEnvById.set(id, env);
    // NOTE: Use envelope is NOT inserted into spatial hash
    // It's only used in Gate validation post-commit
  }

  /**
   * Remove cabinet use envelope
   */
  removeCabinetUseEnvelope(id: string): boolean {
    return this.cabinetUseEnvById.delete(id);
  }

  /**
   * Get cabinet use envelope by ID
   */
  getCabinetUseEnvelope(id: string): CabinetCollisionShape | undefined {
    return this.cabinetUseEnvById.get(id);
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Query obstacles near AABB
   */
  queryObstaclesNear(aabb: AABB): QueryResult<ObstaclePayload>[] {
    return this.spatialObstacles.queryByAabb(aabb).map(item => ({
      id: item.id,
      obbs: item.obbs,
      payload: item.payload,
    }));
  }

  /**
   * Query cabinets near AABB
   */
  queryCabinetsNear(aabb: AABB): QueryResult<CabinetPayload>[] {
    return this.spatialCabinets.queryByAabb(aabb).map(item => ({
      id: item.id,
      obbs: item.obbs,
      payload: item.payload,
    }));
  }

  /**
   * Query obstacles near OBBs with padding
   */
  queryObstaclesNearObbs(obbs: OBB[], padding: number = 0): QueryResult<ObstaclePayload>[] {
    return this.spatialObstacles.queryByObbs(obbs, padding).map(item => ({
      id: item.id,
      obbs: item.obbs,
      payload: item.payload,
    }));
  }

  /**
   * Query cabinets near OBBs with padding
   */
  queryCabinetsNearObbs(obbs: OBB[], padding: number = 0): QueryResult<CabinetPayload>[] {
    return this.spatialCabinets.queryByObbs(obbs, padding).map(item => ({
      id: item.id,
      obbs: item.obbs,
      payload: item.payload,
    }));
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Remove cabinet completely (body + use envelope)
   */
  removeCabinet(id: string): void {
    this.removeCabinetBody(id);
    this.removeCabinetUseEnvelope(id);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.obstacleDataById.clear();
    this.cabinetUseEnvById.clear();
    this.spatialObstacles.clear();
    this.spatialCabinets.clear();
  }

  // ============================================
  // COLLISION CONTEXT INTERFACE
  // ============================================

  /**
   * Build collision context for a cabinet at new position
   *
   * @param cabId - Cabinet ID being moved (excluded from results)
   * @param queryObbs - OBBs to query around (typically cabinet at new position)
   * @param padding - Query padding in mm
   */
  buildCollisionContext(
    cabId: string,
    queryObbs: OBB[],
    padding: number = SPATIAL_CONFIG.nearPaddingMm
  ): {
    nearObstacles: Array<{ id: string; obbs: OBB[]; kind: ObstacleKind }>;
    nearCabinets: Array<{ id: string; obbs: OBB[] }>;
  } {
    // Query obstacles near cabinet
    const nearObstacleItems = this.spatialObstacles.queryByObbs(queryObbs, padding);
    const nearObstacles = nearObstacleItems.map(item => ({
      id: item.id,
      obbs: item.obbs,
      kind: item.payload?.kind ?? 'unknown',
    }));

    // Query cabinets near (excluding self)
    const nearCabinetItems = this.spatialCabinets.queryByObbs(queryObbs, padding);
    const nearCabinets = nearCabinetItems
      .filter(item => item.id !== cabId)
      .map(item => ({
        id: item.id,
        obbs: item.obbs,
      }));

    return { nearObstacles, nearCabinets };
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get registry statistics
   */
  getStats(): {
    obstacleCount: number;
    cabinetBodyCount: number;
    cabinetEnvCount: number;
    spatialObstacleStats: ReturnType<SpatialHashV3['getStats']>;
    spatialCabinetStats: ReturnType<SpatialHashV3['getStats']>;
  } {
    return {
      obstacleCount: this.obstacleDataById.size,
      cabinetBodyCount: this.spatialCabinets.size(),
      cabinetEnvCount: this.cabinetUseEnvById.size,
      spatialObstacleStats: this.spatialObstacles.getStats(),
      spatialCabinetStats: this.spatialCabinets.getStats(),
    };
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let globalRegistryV2: WorldCollisionRegistryV2 | null = null;

/**
 * Get global collision registry V2 instance
 */
export function getWorldCollisionRegistryV2(): WorldCollisionRegistryV2 {
  if (!globalRegistryV2) {
    globalRegistryV2 = new WorldCollisionRegistryV2();
  }
  return globalRegistryV2;
}

/**
 * Reset global registry V2 (for testing)
 */
export function resetWorldCollisionRegistryV2(): void {
  globalRegistryV2 = null;
}

/**
 * worldCollisionRegistry.ts - Registry for World Collision Shapes
 *
 * ARCHITECTURE:
 * - Stores collision shapes for obstacles and cabinets
 * - Maintains spatial hash grids for broad-phase queries
 * - Provides methods for upsert/remove/query operations
 *
 * USAGE:
 * - Obstacles: walls, columns, appliances, etc.
 * - Cabinet bodies: carcass collision shapes
 * - Cabinet use envelopes: door/drawer clearance (not in spatial hash)
 */

import type { CabinetCollisionShape, WorldObstacleShape, OBB, ObstacleKind } from '../collision/obbTypes';
import { SpatialHash } from '../spatial/spatialHash';
import { SPATIAL_CONFIG } from '../config/snapClearanceConfig';
import type { SpatialRegistries, ShapeRegistries } from '../collision/collisionContextBuilder';

// ============================================
// TYPES
// ============================================

export interface ObstaclePayload {
  kind: ObstacleKind;
}

// Extension point: cabinet-specific data can be added here later. Declared as
// an empty record rather than an empty interface — an empty interface would
// accept any non-nullish value, including 0 and "".
export type CabinetPayload = Record<string, never>;

// ============================================
// WORLD COLLISION REGISTRY CLASS
// ============================================

export class WorldCollisionRegistry {
  // ============================================
  // SHAPE STORAGE
  // ============================================

  /** Obstacle shapes by ID */
  obstacleShapesById = new Map<string, WorldObstacleShape>();

  /** Cabinet body shapes by ID */
  cabinetBodyById = new Map<string, CabinetCollisionShape>();

  /** Cabinet use envelope shapes by ID (not in spatial hash for performance) */
  cabinetUseEnvById = new Map<string, CabinetCollisionShape>();

  // ============================================
  // SPATIAL HASH GRIDS
  // ============================================

  /** Spatial hash for obstacles */
  spatialObstacles = new SpatialHash<ObstaclePayload>(SPATIAL_CONFIG.cellSizeMm);

  /** Spatial hash for cabinet bodies */
  spatialCabinets = new SpatialHash<CabinetPayload>(SPATIAL_CONFIG.cellSizeMm);

  // ============================================
  // OBSTACLE OPERATIONS
  // ============================================

  /**
   * Add or update an obstacle
   */
  upsertObstacle(shape: WorldObstacleShape): void {
    this.obstacleShapesById.set(shape.id, shape);
    this.spatialObstacles.upsert({
      id: shape.id,
      obbs: shape.obbs,
      payload: { kind: shape.kind },
    });
  }

  /**
   * Remove an obstacle
   */
  removeObstacle(id: string): boolean {
    const existed = this.obstacleShapesById.delete(id);
    this.spatialObstacles.remove(id);
    return existed;
  }

  /**
   * Get obstacle by ID
   */
  getObstacle(id: string): WorldObstacleShape | undefined {
    return this.obstacleShapesById.get(id);
  }

  /**
   * Get all obstacles
   */
  getAllObstacles(): WorldObstacleShape[] {
    return Array.from(this.obstacleShapesById.values());
  }

  // ============================================
  // CABINET BODY OPERATIONS
  // ============================================

  /**
   * Add or update cabinet body shape
   */
  upsertCabinetBody(id: string, body: CabinetCollisionShape): void {
    this.cabinetBodyById.set(id, body);
    this.spatialCabinets.upsert({
      id,
      obbs: body.obbs,
    });
  }

  /**
   * Remove cabinet body
   */
  removeCabinetBody(id: string): boolean {
    const existed = this.cabinetBodyById.delete(id);
    this.spatialCabinets.remove(id);
    return existed;
  }

  /**
   * Get cabinet body by ID
   */
  getCabinetBody(id: string): CabinetCollisionShape | undefined {
    return this.cabinetBodyById.get(id);
  }

  /**
   * Get all cabinet bodies
   */
  getAllCabinetBodies(): Array<{ id: string; shape: CabinetCollisionShape }> {
    return Array.from(this.cabinetBodyById.entries())
      .map(([id, shape]) => ({ id, shape }));
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
    this.obstacleShapesById.clear();
    this.cabinetBodyById.clear();
    this.cabinetUseEnvById.clear();
    this.spatialObstacles.clear();
    this.spatialCabinets.clear();
  }

  /**
   * Rebuild spatial hash grids from stored shapes
   */
  rebuildSpatial(): void {
    this.spatialObstacles.clear();
    this.spatialCabinets.clear();

    for (const [id, obs] of this.obstacleShapesById) {
      this.spatialObstacles.upsert({
        id,
        obbs: obs.obbs,
        payload: { kind: obs.kind },
      });
    }

    for (const [id, body] of this.cabinetBodyById) {
      this.spatialCabinets.upsert({
        id,
        obbs: body.obbs,
      });
    }
  }

  // ============================================
  // INTERFACE GETTERS (for collision context builder)
  // ============================================

  /**
   * Get spatial registries for collision context builder
   */
  getSpatialRegistries(): SpatialRegistries {
    return {
      obstacles: this.spatialObstacles,
      cabinets: this.spatialCabinets,
    };
  }

  /**
   * Get shape registries for collision context builder
   */
  getShapeRegistries(): ShapeRegistries {
    return {
      obstacleShapesById: this.obstacleShapesById,
      cabinetShapesById: this.cabinetBodyById,
    };
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
    spatialObstacleStats: ReturnType<SpatialHash['getStats']>;
    spatialCabinetStats: ReturnType<SpatialHash['getStats']>;
  } {
    return {
      obstacleCount: this.obstacleShapesById.size,
      cabinetBodyCount: this.cabinetBodyById.size,
      cabinetEnvCount: this.cabinetUseEnvById.size,
      spatialObstacleStats: this.spatialObstacles.getStats(),
      spatialCabinetStats: this.spatialCabinets.getStats(),
    };
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let globalRegistry: WorldCollisionRegistry | null = null;

/**
 * Get global collision registry instance
 */
export function getWorldCollisionRegistry(): WorldCollisionRegistry {
  if (!globalRegistry) {
    globalRegistry = new WorldCollisionRegistry();
  }
  return globalRegistry;
}

/**
 * Reset global registry (for testing)
 */
export function resetWorldCollisionRegistry(): void {
  globalRegistry = null;
}

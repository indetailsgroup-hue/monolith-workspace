/**
 * Build Factory Packet - B2 MVP
 *
 * Main orchestrator that builds a complete factory packet from:
 * - DrillMap store
 * - Cabinet store
 * - Gate store
 *
 * DETERMINISM:
 * - Same input → same packet
 * - Content hash verifies determinism
 * - All files use deterministic JSON serialization
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import type { Cabinet } from '../../core/types/Cabinet';
import type { DrillMap } from '../../core/manufacturing/drillMap/types';
import type { GateResult } from '../../gate/ui/gateTypes';
import type {
  FactoryPacket,
  BuildFactoryPacketInput,
  BuildFactoryPacketOutput,
  PacketManifest,
  ManifestFileEntry,
  FACTORY_PACKET_SCHEMA,
  FACTORY_PACKET_VERSION,
} from './types';
import {
  buildDrillMapData,
  buildConnectorsData,
  buildCutListData,
  buildGateResultData,
} from './builders';
import {
  serializeDeterministicPretty,
  computeFileEntry,
  computeContentHash,
} from './manifestHash';

// ============================================
// CONSTANTS
// ============================================

const PACKET_SCHEMA = 'monolith.factory.packet@1.0' as const;
const PACKET_VERSION = '1.0.0' as const;

// ============================================
// BUILD CONTEXT
// ============================================

/**
 * Context with all data needed to build a packet
 */
export interface FactoryPacketContext {
  /** Cabinets to include */
  cabinets: Cabinet[];
  /** Drill map (optional - will be empty if not provided) */
  drillMap: DrillMap | null;
  /** Gate result (optional - will be empty if not provided) */
  gateResult: GateResult | null;
}

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build a complete factory packet
 *
 * @param input - Build parameters (jobId, projectId, toolVersion)
 * @param context - Data context (cabinets, drillMap, gateResult)
 * @returns Complete packet with all files
 */
export async function buildFactoryPacket(
  input: BuildFactoryPacketInput,
  context: FactoryPacketContext
): Promise<BuildFactoryPacketOutput> {
  const { jobId, projectId, toolVersion } = input;
  const { cabinets, drillMap, gateResult } = context;

  // G9: Defensive check - cabinets must be an array
  // (Primary validation happens at store entry point)
  if (!Array.isArray(cabinets)) {
    throw new Error('[G9] buildFactoryPacket: cabinets must be an array');
  }
  if (cabinets.length === 0) {
    throw new Error('[G9] buildFactoryPacket: cabinets array is empty');
  }

  // 1. Build all data sections
  const drillMapData = buildDrillMapData(drillMap);
  const connectorsData = buildConnectorsData(drillMap);
  const cutListData = buildCutListData(cabinets);
  const gateResultData = buildGateResultData(gateResult);

  // 2. Serialize to JSON strings
  const drillMapJson = serializeDeterministicPretty(drillMapData);
  const connectorsJson = serializeDeterministicPretty(connectorsData);
  const cutListJson = serializeDeterministicPretty(cutListData);
  const gateResultJson = serializeDeterministicPretty(gateResultData);

  // 3. Compute file entries with hashes
  const fileEntries: ManifestFileEntry[] = await Promise.all([
    computeFileEntry('drillmap.json', drillMapJson),
    computeFileEntry('connectors.minifix.json', connectorsJson),
    computeFileEntry('cutlist.json', cutListJson),
    computeFileEntry('gate-result.json', gateResultJson),
  ]);

  // 4. Compute content hash from all file hashes
  const fileHashes = fileEntries.map(f => f.sha256);
  const contentHash = await computeContentHash(fileHashes);

  // 5. Build manifest
  const manifest: PacketManifest = {
    schema: PACKET_SCHEMA,
    version: PACKET_VERSION,
    jobId,
    projectId,
    createdAt: new Date().toISOString(),
    toolVersion,
    files: fileEntries.sort((a, b) => a.path.localeCompare(b.path)),
    contentHash,
  };

  // 6. Serialize manifest
  const manifestJson = serializeDeterministicPretty(manifest);

  // 7. Assemble packet
  const packet: FactoryPacket = {
    manifest,
    drillMap: drillMapData,
    connectors: connectorsData,
    cutList: cutListData,
    gateResult: gateResultData,
  };

  return {
    packet,
    files: {
      'manifest.json': manifestJson,
      'drillmap.json': drillMapJson,
      'connectors.minifix.json': connectorsJson,
      'cutlist.json': cutListJson,
      'gate-result.json': gateResultJson,
    },
    contentHash,
  };
}

// ============================================
// STORE-BASED BUILDER
// ============================================

/**
 * Build factory packet from current store state
 *
 * Convenience function that reads from Zustand stores.
 * Import stores dynamically to avoid circular dependencies.
 */
export async function buildFactoryPacketFromStores(
  input: BuildFactoryPacketInput
): Promise<BuildFactoryPacketOutput> {
  // Dynamic imports to avoid circular dependencies
  const { useCabinetStore } = await import('../../core/store/useCabinetStore');
  const { useDrillMapStore } = await import('../../core/store/useDrillMapStore');
  const { useGateStore } = await import('../../gate/ui/gateStore');

  const cabinetState = useCabinetStore.getState();
  const drillMapState = useDrillMapStore.getState();
  const gateState = useGateStore.getState();

  const context: FactoryPacketContext = {
    cabinets: cabinetState.cabinets,
    drillMap: drillMapState.drillMap,
    gateResult: gateState.lastResult,
  };

  return buildFactoryPacket(input, context);
}

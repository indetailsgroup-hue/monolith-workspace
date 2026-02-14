/**
 * bootstrapTrustChain.ts - Trust Chain Bootstrap & Wiring
 *
 * Initializes and wires together all trust chain components:
 * - Manifest store (IndexedDB)
 * - Keyring (public keys)
 * - Checklist loader
 * - Export pipeline
 * - Commit function
 *
 * USAGE:
 * ```typescript
 * const trustChain = bootstrapTrustChain();
 *
 * // Use in components
 * await trustChain.loadChecklist('job-001');
 * await trustChain.guardedExport({ ... });
 * ```
 */

import { IndexedDbManifestStore } from '../infra/idb/indexedDbManifestStore';
import { pinnedKeyring, emptyKeyring, type Keyring } from '../crypto/keyring';
import {
  generateFactoryChecklist,
  type FactoryAcceptanceChecklist,
} from '../factory/generateFactoryChecklist';
import {
  guardedExport,
  canExportJob,
  type ExportArtifact,
  type ExportPipelineResult,
} from '../export/exportPipeline';
import {
  commitApprovedState,
  createGenesisManifest,
  type CabinetForGate,
  type CommitResult,
} from '../export/commitApprovedState';
import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { CollisionReport } from '../collision/collisionReport';
import type { RunGatePerCabinetFn } from '../gate/runGateBundle';
import { configureChecklistStore } from '../store/useChecklistStore';

// ============================================
// TYPES
// ============================================

export interface TrustChainConfig {
  /** Use development keyring with generated keys (for dev only) */
  useDevelopmentKeys?: boolean;

  /** Custom keyring (production) */
  keyring?: Keyring;

  /** Custom manifest store */
  store?: ManifestStore;
}

export interface TrustChainContext {
  /** Manifest store instance */
  store: ManifestStore;

  /** Keyring instance */
  keyring: Keyring;

  /** Load checklist for job */
  loadChecklist: (jobId: string) => Promise<FactoryAcceptanceChecklist>;

  /** Check if export is allowed */
  canExport: (jobId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;

  /** Execute guarded export */
  guardedExport: (args: GuardedExportArgs) => Promise<ExportPipelineResult>;

  /** Commit approved state */
  commit: (args: CommitArgs) => Promise<CommitResult>;

  /** Create genesis manifest for new job */
  createGenesis: (args: GenesisArgs) => Promise<{ ok: true; headHash: string } | { ok: false; reason: string }>;

  /** Get signing keys (for commit/export) */
  getSigningKeys: () => SigningKeys | null;

  /** Set signing keys */
  setSigningKeys: (keys: SigningKeys) => void;
}

export interface SigningKeys {
  approvalKeyId: string;
  approvalPrivateKeyHex: string;
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
}

export interface GuardedExportArgs {
  jobId: string;
  generate: () => Promise<ExportArtifact[]>;
  persist: (artifacts: ExportArtifact[]) => Promise<void>;
  createdBy?: string;
}

export interface CommitArgs {
  jobId: string;
  selectionPreview: CabinetForGate[];
  selectionIds: string[];
  activeId: string | null;
  collision: CollisionReport | null;
  minGapMm: number;
  runGatePerCabinet: RunGatePerCabinetFn;
  commitAll: (cabs: CabinetForGate[]) => void;
  allowGenesis?: boolean;
  createdBy?: string;
}

export interface GenesisArgs {
  jobId: string;
  createdBy?: string;
}

// ============================================
// BOOTSTRAP
// ============================================

let _signingKeys: SigningKeys | null = null;

/**
 * Bootstrap trust chain components
 *
 * @param config - Configuration options
 * @returns Trust chain context with all wired components
 *
 * @example
 * // Development
 * const trustChain = bootstrapTrustChain({ useDevelopmentKeys: true });
 *
 * // Production
 * const trustChain = bootstrapTrustChain({
 *   keyring: myProductionKeyring,
 * });
 */
export function bootstrapTrustChain(config: TrustChainConfig = {}): TrustChainContext {
  // 1. Initialize store
  const store = config.store ?? new IndexedDbManifestStore();

  // 2. Initialize keyring
  // Note: useDevelopmentKeys requires async bootstrap via bootstrapDevTrustChain
  let keyring: Keyring;
  if (config.keyring) {
    keyring = config.keyring;
  } else if (config.useDevelopmentKeys) {
    // For dev, use empty keyring initially - will be populated by bootstrapDevTrustChain
    keyring = emptyKeyring();
  } else {
    keyring = pinnedKeyring;
  }

  // 3. Create context
  const context: TrustChainContext = {
    store,
    keyring,

    loadChecklist: async (jobId: string) => {
      const result = await generateFactoryChecklist({
        jobId,
        store,
        keyring,
        maxDepth: 25,
      });

      if (!result.ok) {
        throw new Error(result.reason);
      }

      return result.checklist;
    },

    canExport: (jobId: string) => canExportJob({ jobId, store, keyring }),

    guardedExport: async (args: GuardedExportArgs) => {
      const keys = _signingKeys;
      if (!keys) {
        return { ok: false, reason: 'Signing keys not configured' };
      }

      return guardedExport({
        jobId: args.jobId,
        store,
        keyring,
        manifestKeyId: keys.manifestKeyId,
        manifestPrivateKeyHex: keys.manifestPrivateKeyHex,
        generate: args.generate,
        persist: args.persist,
        createdBy: args.createdBy,
      });
    },

    commit: async (args: CommitArgs) => {
      const keys = _signingKeys;
      if (!keys) {
        return { ok: false, reason: 'Signing keys not configured' };
      }

      return commitApprovedState({
        jobId: args.jobId,
        selectionPreview: args.selectionPreview,
        selectionIds: args.selectionIds,
        activeId: args.activeId,
        collision: args.collision,
        minGapMm: args.minGapMm,
        runGatePerCabinet: args.runGatePerCabinet,
        commitAll: args.commitAll,
        store,
        approvalKeyId: keys.approvalKeyId,
        approvalPrivateKeyHex: keys.approvalPrivateKeyHex,
        manifestKeyId: keys.manifestKeyId,
        manifestPrivateKeyHex: keys.manifestPrivateKeyHex,
        allowGenesis: args.allowGenesis,
        createdBy: args.createdBy,
      });
    },

    createGenesis: async (args: GenesisArgs) => {
      const keys = _signingKeys;
      if (!keys) {
        return { ok: false, reason: 'Signing keys not configured' };
      }

      return createGenesisManifest({
        jobId: args.jobId,
        store,
        approvalKeyId: keys.approvalKeyId,
        approvalPrivateKeyHex: keys.approvalPrivateKeyHex,
        manifestKeyId: keys.manifestKeyId,
        manifestPrivateKeyHex: keys.manifestPrivateKeyHex,
        createdBy: args.createdBy,
      });
    },

    getSigningKeys: () => _signingKeys,

    setSigningKeys: (keys: SigningKeys) => {
      _signingKeys = keys;
    },
  };

  // 4. Configure checklist store
  configureChecklistStore({
    loadChecklist: context.loadChecklist,
  });

  return context;
}

// ============================================
// SINGLETON
// ============================================

let _instance: TrustChainContext | null = null;

/**
 * Get or create trust chain singleton
 */
export function getTrustChain(config?: TrustChainConfig): TrustChainContext {
  if (!_instance) {
    _instance = bootstrapTrustChain(config);
  }
  return _instance;
}

/**
 * Reset trust chain singleton (for testing)
 */
export function resetTrustChain(): void {
  _instance = null;
  _signingKeys = null;
}

// ============================================
// DEVELOPMENT HELPERS
// ============================================

/**
 * Generate development signing keys
 *
 * WARNING: For development only. Never use in production.
 */
export async function generateDevSigningKeys(): Promise<SigningKeys> {
  const { generateKeypair } = await import('../crypto/ed25519');

  const approvalKeypair = await generateKeypair();
  const manifestKeypair = await generateKeypair();

  return {
    approvalKeyId: 'dev-approval',
    approvalPrivateKeyHex: approvalKeypair.privateKeyHex,
    manifestKeyId: 'dev-manifest',
    manifestPrivateKeyHex: manifestKeypair.privateKeyHex,
  };
}

/**
 * Bootstrap with development keys (one-liner for dev)
 *
 * Creates a complete dev trust chain with:
 * - Auto-generated signing keys
 * - Keyring populated with dev public keys
 */
export async function bootstrapDevTrustChain(): Promise<TrustChainContext> {
  const { generateKeypair } = await import('../crypto/ed25519');
  const { createPinnedKeyring } = await import('../crypto/keyring');

  // Generate keypairs
  const approvalKeypair = await generateKeypair();
  const manifestKeypair = await generateKeypair();

  // Create keyring with dev public keys
  const devKeyring = createPinnedKeyring([
    {
      keyId: 'dev-approval',
      publicKeyHex: approvalKeypair.publicKeyHex,
      purpose: 'APPROVAL',
      description: 'Development approval key',
      active: true,
    },
    {
      keyId: 'dev-manifest',
      publicKeyHex: manifestKeypair.publicKeyHex,
      purpose: 'EXPORT',
      description: 'Development manifest key',
      active: true,
    },
  ]);

  // Bootstrap with the dev keyring
  const context = bootstrapTrustChain({ keyring: devKeyring });

  // Set signing keys
  context.setSigningKeys({
    approvalKeyId: 'dev-approval',
    approvalPrivateKeyHex: approvalKeypair.privateKeyHex,
    manifestKeyId: 'dev-manifest',
    manifestPrivateKeyHex: manifestKeypair.privateKeyHex,
  });

  return context;
}

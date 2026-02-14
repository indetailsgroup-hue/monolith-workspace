/**
 * Kernel Truth Service - Frontend Client
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 * Deliverable B: Frontend Client with Caching
 *
 * This client communicates with the Python/PyOCC backend service.
 * It handles:
 * - Request/response serialization
 * - Delta chain management
 * - Response caching
 * - Error handling
 */

import type {
  KernelOpRequest,
  KernelOpResponse,
  KernelDeltaV1,
  KernelError,
  CreateSolidFromProfilePayload,
  CreateSolidFromProfileResult,
  BooleanCutPayload,
  BooleanCutResult,
  FilletEdgesPayload,
  FilletEdgesResult,
  ExtractPlanarLoopsPayload,
  ExtractPlanarLoopsResult,
  ValidateLoopsPayload,
  ValidateLoopsResult,
  GetSolidInfoPayload,
  GetSolidInfoResult,
  GetSolidMeshPayload,
  GetSolidMeshResult,
} from './types';

import { canonicalize, computeHash, isKernelError, isKernelSuccess } from './types';

// ============================================================================
// TOLERANCE POLICY (must match server)
// ============================================================================

/**
 * Tolerance policy string - MUST match server's tolerance.py
 */
const TOLERANCE_POLICY = 'tol:1e-06:0.001:1e-06';

/**
 * Compute commandFp matching server's canonical fingerprint calculation.
 *
 * This MUST produce identical results to server's compute_command_fp()
 * in dispatcher.py, otherwise requests will be rejected.
 *
 * @param commandId - Command identifier (e.g., "panel.create")
 * @param commandVersion - Command version number
 * @param commandInputs - User-provided inputs
 * @param selectionKernelIds - Selected solid IDs
 * @returns SHA-256 hex string
 */
export async function computeCommandFp(
  commandId: string,
  commandVersion: number,
  commandInputs: unknown,
  selectionKernelIds: string[]
): Promise<string> {
  const fpObj = {
    commandId,
    commandVersion,
    commandInputs,
    selectionKernelIds,
    tolPolicy: TOLERANCE_POLICY,
  };
  return computeHash(fpObj);
}

// ============================================================================
// V1 API REQUEST TYPES (match server models.py)
// ============================================================================

export type KernelOpKind =
  | 'createSolidFromProfile'
  | 'transformSolid'
  | 'mirrorSolid'
  | 'booleanCut'
  | 'filletEdges'
  | 'extractPlanarLoops'
  | 'projectFeaturesToPlane'
  | 'validateLoops';

export interface KernelOpRequestV1 {
  schema: 'monolith.kernel-op-request.v1';
  requestId: string;
  jobId: string;
  opKind: KernelOpKind;
  commandId: string;
  commandVersion: number;
  commandInputs: unknown;
  selectionKernelIds: string[];
  payload: unknown;
  fingerprints: {
    commandFp: string;
    designFp?: string;
  };
}

export interface KernelOpResponseV1 {
  schema: 'monolith.kernel-op-response.v1';
  requestId: string;
  ok: boolean;
  tolerance: {
    internalEps: number;
    exportEps: number;
    angleEpsDeg: number;
  };
  responseFp: string;
  created?: { solidIds: string[] };
  delta?: unknown;
  loops?: unknown;
  issues?: Array<{
    code: string;
    severity: 'INFO' | 'WARN' | 'BLOCK';
    message: string;
    refs?: string[];
    data?: unknown;
  }>;
  meta?: {
    kernelVersion: string;
    impl: string;
  };
}

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

export interface KernelClientConfig {
  /** Base URL of kernel service */
  baseUrl: string;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Enable response caching */
  enableCache?: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;

  /** Session ID for delta tracking */
  sessionId?: string;
}

const DEFAULT_CONFIG: Required<KernelClientConfig> = {
  baseUrl: 'http://localhost:3002',
  timeoutMs: 30000,
  enableCache: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  sessionId: crypto.randomUUID(),
};

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry<T> {
  response: KernelOpResponse<T>;
  expiresAt: number;
  inputHash: string;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  async get<T>(op: string, payload: unknown): Promise<KernelOpResponse<T> | null> {
    const hash = await computeHash({ op, payload });
    const entry = this.cache.get(hash);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      return null;
    }

    return entry.response as KernelOpResponse<T>;
  }

  async set<T>(op: string, payload: unknown, response: KernelOpResponse<T>): Promise<void> {
    const hash = await computeHash({ op, payload });
    this.cache.set(hash, {
      response,
      expiresAt: Date.now() + this.ttlMs,
      inputHash: hash,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// DELTA CHAIN MANAGER
// ============================================================================

class DeltaChainManager {
  private deltas: KernelDeltaV1[] = [];
  private lastDeltaId: string | null = null;

  async recordDelta(op: string, payload: unknown, outputHash: string, sessionId?: string): Promise<KernelDeltaV1> {
    const inputJson = canonicalize(payload);
    const inputHash = await computeHash(payload);

    const delta: KernelDeltaV1 = {
      version: 'v1',
      deltaId: crypto.randomUUID(),
      op,
      inputPayloadJson: inputJson,
      inputHash,
      outputHash,
      previousDeltaId: this.lastDeltaId,
      createdAtIso: new Date().toISOString(),
      sessionId,
    };

    this.deltas.push(delta);
    this.lastDeltaId = delta.deltaId;

    return delta;
  }

  getDeltas(): KernelDeltaV1[] {
    return [...this.deltas];
  }

  getLastDeltaId(): string | null {
    return this.lastDeltaId;
  }

  clear(): void {
    this.deltas = [];
    this.lastDeltaId = null;
  }
}

// ============================================================================
// KERNEL CLIENT
// ============================================================================

export class KernelClient {
  private config: Required<KernelClientConfig>;
  private cache: ResponseCache;
  private deltaManager: DeltaChainManager;

  constructor(config: Partial<KernelClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new ResponseCache(this.config.cacheTtlMs);
    this.deltaManager = new DeltaChainManager();
  }

  // --------------------------------------------------------------------------
  // INTERNAL REQUEST HANDLER
  // --------------------------------------------------------------------------

  private async request<P, R>(
    op: string,
    payload: P,
    options: { cacheable?: boolean; recordDelta?: boolean } = {}
  ): Promise<KernelOpResponse<R>> {
    const { cacheable = true, recordDelta = true } = options;

    // Check cache first
    if (this.config.enableCache && cacheable) {
      const cached = await this.cache.get<R>(op, payload);
      if (cached) {
        console.log(`[Kernel] Cache hit for ${op}`);
        return cached;
      }
    }

    // Build request
    const request: KernelOpRequest<P> = {
      apiVersion: 'v1',
      op,
      payload,
      correlationId: crypto.randomUUID(),
      createdAtIso: new Date().toISOString(),
    };

    // Make HTTP request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/kernel/v1/op`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: errorBody,
          },
          processingTimeMs: 0,
          correlationId: request.correlationId,
        };
      }

      const result: KernelOpResponse<R> = await response.json();

      // Cache successful responses
      if (result.ok && this.config.enableCache && cacheable) {
        await this.cache.set(op, payload, result);
      }

      // Record delta for geometry-modifying operations
      if (result.ok && recordDelta && result.result) {
        const outputHash = await computeHash(result.result);
        await this.deltaManager.recordDelta(op, payload, outputHash, this.config.sessionId);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Request timeout',
          },
          processingTimeMs: this.config.timeoutMs,
          correlationId: request.correlationId,
        };
      }

      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
        processingTimeMs: 0,
        correlationId: request.correlationId,
      };
    }
  }

  // --------------------------------------------------------------------------
  // GEOMETRY OPERATIONS
  // --------------------------------------------------------------------------

  async createSolidFromProfile(
    payload: CreateSolidFromProfilePayload
  ): Promise<KernelOpResponse<CreateSolidFromProfileResult>> {
    return this.request('createSolidFromProfile', payload, {
      cacheable: true,
      recordDelta: true,
    });
  }

  async booleanCut(
    payload: BooleanCutPayload
  ): Promise<KernelOpResponse<BooleanCutResult>> {
    return this.request('booleanCut', payload, {
      cacheable: false, // Boolean ops depend on mutable solid state
      recordDelta: true,
    });
  }

  async filletEdges(
    payload: FilletEdgesPayload
  ): Promise<KernelOpResponse<FilletEdgesResult>> {
    return this.request('filletEdges', payload, {
      cacheable: false,
      recordDelta: true,
    });
  }

  async extractPlanarLoops(
    payload: ExtractPlanarLoopsPayload
  ): Promise<KernelOpResponse<ExtractPlanarLoopsResult>> {
    return this.request('extractPlanarLoops', payload, {
      cacheable: true,
      recordDelta: false, // Query operation, no geometry change
    });
  }

  async validateLoops(
    payload: ValidateLoopsPayload
  ): Promise<KernelOpResponse<ValidateLoopsResult>> {
    return this.request('validateLoops', payload, {
      cacheable: true,
      recordDelta: false,
    });
  }

  // --------------------------------------------------------------------------
  // QUERY OPERATIONS
  // --------------------------------------------------------------------------

  async getSolidInfo(
    payload: GetSolidInfoPayload
  ): Promise<KernelOpResponse<GetSolidInfoResult>> {
    return this.request('getSolidInfo', payload, {
      cacheable: true,
      recordDelta: false,
    });
  }

  async getSolidMesh(
    payload: GetSolidMeshPayload
  ): Promise<KernelOpResponse<GetSolidMeshResult>> {
    return this.request('getSolidMesh', payload, {
      cacheable: true,
      recordDelta: false,
    });
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Get all recorded deltas for Gate chain
   */
  getDeltas(): KernelDeltaV1[] {
    return this.deltaManager.getDeltas();
  }

  /**
   * Clear delta history (e.g., on new project)
   */
  clearDeltas(): void {
    this.deltaManager.clear();
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.config.cacheTtlMs,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/kernel/v1/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { ok: true, version: data.version };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  // --------------------------------------------------------------------------
  // V1 API (with commandFp verification)
  // --------------------------------------------------------------------------

  /**
   * Execute kernel operation using V1 API with fingerprint verification.
   *
   * This method builds the full request including commandFp that
   * matches the server's canonical fingerprint calculation.
   *
   * @param params - Operation parameters
   * @returns KernelOpResponseV1
   */
  async opV1(params: {
    opKind: KernelOpKind;
    commandId: string;
    commandVersion: number;
    commandInputs: unknown;
    selectionKernelIds?: string[];
    payload: unknown;
    jobId?: string;
  }): Promise<KernelOpResponseV1> {
    const {
      opKind,
      commandId,
      commandVersion,
      commandInputs,
      selectionKernelIds = [],
      payload,
      jobId = crypto.randomUUID(),
    } = params;

    // Compute commandFp matching server's calculation
    const commandFp = await computeCommandFp(
      commandId,
      commandVersion,
      commandInputs,
      selectionKernelIds
    );

    const request: KernelOpRequestV1 = {
      schema: 'monolith.kernel-op-request.v1',
      requestId: crypto.randomUUID(),
      jobId,
      opKind,
      commandId,
      commandVersion,
      commandInputs,
      selectionKernelIds,
      payload,
      fingerprints: { commandFp },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/kernel/v1/op`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorBody)}`);
      }

      const result: KernelOpResponseV1 = await response.json();

      // Record delta for geometry-modifying operations
      if (result.ok && result.created) {
        const outputHash = await computeHash(result);
        await this.deltaManager.recordDelta(opKind, payload, outputHash, this.config.sessionId);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Create solid from profile using V1 API
   */
  async createSolidV1(params: {
    profile2d: { closed: boolean; segs: unknown[] };
    thickness: number;
    commandInputs?: Record<string, unknown>;
  }): Promise<KernelOpResponseV1> {
    return this.opV1({
      opKind: 'createSolidFromProfile',
      commandId: 'panel.create',
      commandVersion: 1,
      commandInputs: params.commandInputs || {
        thickness: params.thickness,
      },
      payload: {
        profile2d: params.profile2d,
        thickness: params.thickness,
      },
    });
  }

  /**
   * Extract planar loops using V1 API
   */
  async extractLoopsV1(params: {
    solidId: string;
    faceId?: string;
  }): Promise<KernelOpResponseV1> {
    return this.opV1({
      opKind: 'extractPlanarLoops',
      commandId: 'panel.flatten',
      commandVersion: 1,
      commandInputs: { solidId: params.solidId },
      selectionKernelIds: [params.solidId],
      payload: {
        solidId: params.solidId,
        faceId: params.faceId || 'FACE_TOP',
      },
    });
  }

  /**
   * Validate loops using V1 API
   */
  async validateLoopsV1(params: {
    loops: unknown;
    minInnerRadius?: number;
  }): Promise<KernelOpResponseV1> {
    return this.opV1({
      opKind: 'validateLoops',
      commandId: 'loops.validate',
      commandVersion: 1,
      commandInputs: {
        minInnerRadius: params.minInnerRadius || 3.0,
      },
      payload: { loops: params.loops },
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultClient: KernelClient | null = null;

export function getKernelClient(config?: Partial<KernelClientConfig>): KernelClient {
  if (!defaultClient || config) {
    defaultClient = new KernelClient(config);
  }
  return defaultClient;
}

export function resetKernelClient(): void {
  defaultClient = null;
}

/**
 * Kernel Client - Fetch wrapper for Kernel Truth Service
 *
 * SPEC-08 v8.2: Plasticity-DNA Design Engine
 */

import type {
  KernelOpRequestV1,
  KernelOpResponseV1,
  KernelBatchRequestV1,
  KernelBatchResponseV1,
  KernelHealthResponse,
} from './kernelTypes';

// ============================================================================
// CLIENT OPTIONS
// ============================================================================

export interface KernelClientOptions {
  /** Base URL of kernel service (e.g., http://localhost:8080) */
  baseUrl: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

// ============================================================================
// CLIENT CLASS
// ============================================================================

export class KernelClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: KernelClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // --------------------------------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------------------------------

  /**
   * Check kernel service health.
   *
   * @returns Health response with version and tolerance
   * @throws Error if request fails
   */
  async health(): Promise<KernelHealthResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/kernel/v1/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Health check failed: HTTP ${response.status}`);
      }

      return response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Health check timeout');
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // SINGLE OPERATION
  // --------------------------------------------------------------------------

  /**
   * Execute single kernel operation.
   *
   * @param req - Operation request (with commandFp already computed)
   * @returns Operation response
   * @throws Error if request fails
   */
  async op(req: KernelOpRequestV1): Promise<KernelOpResponseV1> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/kernel/v1/op`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.json();

      if (!response.ok) {
        throw new Error(`Op failed: HTTP ${response.status} - ${JSON.stringify(body)}`);
      }

      return body as KernelOpResponseV1;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Op request timeout');
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // BATCH OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Execute batch of kernel operations.
   *
   * @param req - Batch request
   * @returns Batch response with all individual responses
   * @throws Error if request fails
   */
  async batch(req: KernelBatchRequestV1): Promise<KernelBatchResponseV1> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/kernel/v1/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.json();

      if (!response.ok) {
        throw new Error(`Batch failed: HTTP ${response.status} - ${JSON.stringify(body)}`);
      }

      return body as KernelBatchResponseV1;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Batch request timeout');
      }
      throw err;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultClient: KernelClient | null = null;

export function getKernelClient(options?: KernelClientOptions): KernelClient {
  if (!defaultClient && options) {
    defaultClient = new KernelClient(options);
  }
  if (!defaultClient) {
    throw new Error('KernelClient not initialized. Call getKernelClient with options first.');
  }
  return defaultClient;
}

export function initKernelClient(options: KernelClientOptions): KernelClient {
  defaultClient = new KernelClient(options);
  return defaultClient;
}

export function resetKernelClient(): void {
  defaultClient = null;
}

/**
 * receiptIngestStore.ts - Receipt Ingest State Management
 *
 * Zustand store for uploading, verifying, and appending factory receipts:
 * - Upload/paste JSON receipt
 * - Parse and validate structure
 * - Verify signature
 * - Append to manifest chain
 * - Refresh timeline
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { TrustChainService, ForkRevisionResult } from '../trustChain/trustChainService';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { ReceiptVerificationResult } from '../receipt/verifyFactoryReceipt';
import type { ApprovalSigner } from '../trust/approvalSigner';

// ============================================
// STORE STATE
// ============================================

export interface ReceiptIngestState {
  // ---- Identity ----
  /** Job ID */
  jobId: string;

  // ---- Loading State ----
  /** Loading indicator */
  loading: boolean;

  /** Error message */
  error: string | null;

  // ---- Input ----
  /** Raw JSON text (pasted or loaded from file) */
  rawText: string;

  /** Parsed receipt (null if not parsed or invalid) */
  parsed: SignedFactoryReceipt | null;

  /** Parse error (if parsing failed) */
  parseError: string | null;

  // ---- Verification ----
  /** Verification result */
  verification: ReceiptVerificationResult | null;

  // ---- Append Result ----
  /** New HEAD hash after append */
  appendedHeadHash: string | null;

  // ---- Fork Result (for REJECTED receipts) ----
  /** Fork result if forked */
  forkResult: ForkRevisionResult | null;

  // ---- Actions ----
  /** Set raw text */
  setRawText: (text: string) => void;

  /** Set error */
  setError: (error: string | null) => void;

  /** Parse raw text as JSON */
  parse: () => void;

  /** Verify parsed receipt signature */
  verify: () => Promise<void>;

  /** Append verified receipt to chain */
  append: () => Promise<void>;

  /** Fork revision from REJECTED receipt (requires ApprovalSigner) */
  forkRevision: (args: { approvalSigner: ApprovalSigner }) => Promise<void>;

  /** Reset to initial state */
  reset: () => void;
}

// ============================================
// STORE FACTORY
// ============================================

export interface CreateReceiptIngestStoreArgs {
  /** Job ID */
  jobId: string;

  /** Trust chain service */
  svc: TrustChainService;
}

/**
 * Create receipt ingest store
 */
export function createReceiptIngestStore(
  args: CreateReceiptIngestStoreArgs
): UseBoundStore<StoreApi<ReceiptIngestState>> {
  const { jobId, svc } = args;

  return create<ReceiptIngestState>((set, get) => ({
    // Initial state
    jobId,
    loading: false,
    error: null,
    rawText: '',
    parsed: null,
    parseError: null,
    verification: null,
    appendedHeadHash: null,
    forkResult: null,

    // Actions
    setRawText: (text) => {
      set({ rawText: text });
    },

    setError: (error) => {
      set({ error });
    },

    parse: () => {
      set({
        error: null,
        parseError: null,
        verification: null,
        appendedHeadHash: null,
      });

      const { rawText } = get();

      if (!rawText.trim()) {
        set({ parsed: null, parseError: 'No input provided' });
        return;
      }

      try {
        const obj = JSON.parse(rawText);

        // Basic structure validation
        const validationError = validateReceiptStructure(obj);
        if (validationError) {
          set({ parsed: null, parseError: validationError });
          return;
        }

        set({ parsed: obj as SignedFactoryReceipt, parseError: null });
      } catch (e) {
        set({
          parsed: null,
          parseError: e instanceof Error ? e.message : 'Invalid JSON',
        });
      }
    },

    verify: async () => {
      const { parsed } = get();

      if (!parsed) {
        set({ error: 'Nothing parsed to verify. Please parse first.' });
        return;
      }

      set({ loading: true, error: null, verification: null });

      try {
        const result = await svc.verifyReceipt(parsed);
        set({ loading: false, verification: result });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Verification failed',
        });
      }
    },

    append: async () => {
      const { parsed, verification } = get();

      if (!parsed) {
        set({ error: 'Nothing parsed to append. Please parse first.' });
        return;
      }

      if (!verification?.ok) {
        set({ error: 'Please verify receipt signature first.' });
        return;
      }

      set({ loading: true, error: null, appendedHeadHash: null });

      try {
        const result = await svc.appendReceipt({
          jobId,
          signedReceipt: parsed,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason ?? 'Append failed' });
          return;
        }

        set({
          loading: false,
          appendedHeadHash: result.newHeadHash ?? null,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Append failed',
        });
      }
    },

    forkRevision: async ({ approvalSigner }) => {
      const { parsed, verification } = get();

      if (!parsed) {
        set({ error: 'Nothing parsed to fork from. Please parse first.' });
        return;
      }

      if (!verification?.ok) {
        set({ error: 'Please verify receipt signature first.' });
        return;
      }

      // Must be REJECTED to fork
      if (parsed.receipt.verdict !== 'REJECTED') {
        set({ error: 'Can only fork from REJECTED receipts.' });
        return;
      }

      set({ loading: true, error: null, forkResult: null });

      try {
        const result = await svc.forkRevisionFromRejectedReceipt({
          jobId,
          rejectedReceipt: parsed,
          approvalSigner,
        });

        if (!result.ok) {
          set({ loading: false, error: result.reason ?? 'Fork failed' });
          return;
        }

        set({
          loading: false,
          forkResult: result,
        });
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Fork failed',
        });
      }
    },

    reset: () => {
      set({
        rawText: '',
        parsed: null,
        parseError: null,
        verification: null,
        error: null,
        appendedHeadHash: null,
        forkResult: null,
      });
    },
  }));
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate receipt structure (basic checks)
 *
 * @returns Error message if invalid, null if valid
 */
function validateReceiptStructure(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') {
    return 'Receipt must be an object';
  }

  const r = obj as Record<string, unknown>;

  // Check required fields
  if (!r.receipt || typeof r.receipt !== 'object') {
    return 'Missing or invalid "receipt" field';
  }

  if (typeof r.receiptHashHex !== 'string' || r.receiptHashHex.length !== 64) {
    return 'Missing or invalid "receiptHashHex" (expected 64-char hex)';
  }

  if (typeof r.signatureHex !== 'string' || r.signatureHex.length !== 128) {
    return 'Missing or invalid "signatureHex" (expected 128-char hex)';
  }

  if (typeof r.keyId !== 'string' || r.keyId.length === 0) {
    return 'Missing or invalid "keyId"';
  }

  if (r.algo !== 'Ed25519') {
    return 'Invalid "algo" (expected "Ed25519")';
  }

  // Check receipt inner structure
  const receipt = r.receipt as Record<string, unknown>;

  if (receipt.version !== '1.0') {
    return 'Invalid receipt version (expected "1.0")';
  }

  if (typeof receipt.jobId !== 'string') {
    return 'Missing "receipt.jobId"';
  }

  if (typeof receipt.headManifestHashHex !== 'string') {
    return 'Missing "receipt.headManifestHashHex"';
  }

  if (typeof receipt.verdict !== 'string') {
    return 'Missing "receipt.verdict"';
  }

  if (receipt.verdict !== 'ACCEPTED' && receipt.verdict !== 'REJECTED') {
    return 'Invalid "receipt.verdict" (expected "ACCEPTED" or "REJECTED")';
  }

  return null;
}

// ============================================
// SELECTORS
// ============================================

/**
 * Check if receipt is ready to verify
 */
export function selectCanVerify(state: ReceiptIngestState): boolean {
  return !!state.parsed && !state.loading;
}

/**
 * Check if receipt is ready to append
 */
export function selectCanAppend(state: ReceiptIngestState): boolean {
  return !!state.parsed && !!state.verification?.ok && !state.loading;
}

/**
 * Check if process is complete
 */
export function selectIsComplete(state: ReceiptIngestState): boolean {
  return !!state.appendedHeadHash;
}

/**
 * Check if receipt can be forked (is REJECTED and verified)
 */
export function selectCanFork(state: ReceiptIngestState): boolean {
  return (
    !!state.parsed &&
    !!state.verification?.ok &&
    state.parsed.receipt.verdict === 'REJECTED' &&
    !state.loading
  );
}

/**
 * Check if fork was successful
 */
export function selectForkComplete(state: ReceiptIngestState): boolean {
  return !!state.forkResult?.ok;
}

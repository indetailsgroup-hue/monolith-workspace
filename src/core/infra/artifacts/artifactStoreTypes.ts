/**
 * artifactStoreTypes.ts - Artifact Storage Interface
 *
 * ARCHITECTURE:
 * - Generic interface for storing binary artifacts
 * - Implementations: Memory (dev), IndexedDB (production)
 * - Each artifact gets deterministic ID from content hash
 *
 * USAGE:
 * - Export pipeline stores artifacts before appending to chain
 * - Download uses get() to retrieve artifacts by ID
 */

// ============================================
// INPUT/OUTPUT TYPES
// ============================================

/**
 * Input for storing an artifact
 */
export interface PutArtifactInput {
  /** Binary content */
  bytes: Uint8Array;

  /** MIME type (e.g., "application/dxf") */
  mime: string;

  /** Original filename (for download UX) */
  filename: string;
}

/**
 * Output from storing an artifact
 */
export interface PutArtifactOutput {
  /** Deterministic artifact ID (ART_{hash.slice(0,16)}) */
  artifactId: string;

  /** Size in bytes */
  bytes: number;

  /** SHA-256 hash of content */
  sha256Hex: string;
}

/**
 * Stored artifact with metadata
 */
export interface StoredArtifact {
  /** Artifact ID */
  artifactId: string;

  /** Binary content */
  bytes: Uint8Array;

  /** MIME type */
  mime: string;

  /** Original filename */
  filename: string;

  /** SHA-256 hash of content */
  sha256Hex: string;

  /** Storage timestamp */
  storedIso: string;
}

// ============================================
// ARTIFACT STORE INTERFACE
// ============================================

/**
 * Interface for artifact storage
 *
 * Implementations:
 * - createMemoryArtifactStore() - In-memory (dev/test)
 * - createIndexedDbArtifactStore() - IndexedDB (production)
 */
export interface ArtifactStore {
  /**
   * Store an artifact
   *
   * @param input - Artifact data to store
   * @returns Output with artifactId and hash
   */
  put(input: PutArtifactInput): Promise<PutArtifactOutput>;

  /**
   * Retrieve an artifact by ID
   *
   * @param artifactId - Artifact ID
   * @returns Stored artifact or null if not found
   */
  get(artifactId: string): Promise<StoredArtifact | null>;

  /**
   * Check if artifact exists
   *
   * @param artifactId - Artifact ID
   * @returns True if artifact exists
   */
  has(artifactId: string): Promise<boolean>;

  /**
   * Delete an artifact
   *
   * @param artifactId - Artifact ID
   * @returns True if artifact was deleted
   */
  delete(artifactId: string): Promise<boolean>;

  /**
   * List all artifact IDs
   *
   * @returns Array of artifact IDs
   */
  listIds(): Promise<string[]>;

  /**
   * Clear all artifacts
   */
  clear(): Promise<void>;
}

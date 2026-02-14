/**
 * useFactoryPacket Hook - B3 Enhanced
 *
 * React hook for building and downloading factory packets.
 * Integrates with stores and provides loading/error states.
 *
 * B3 Enhancement: Added generatePreview() for in-memory packet preview
 * without ZIP download, enabling the Export Viewer UI.
 *
 * @version 1.1.0 - Phase B3: Export Viewer / Packet Preview UI
 */

import { useState, useCallback } from 'react';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { useGateStore } from '../../gate/ui/gateStore';
import { useProjectStore } from '../../core/store/useProjectStore';
import { buildFactoryPacket } from './buildFactoryPacket';
import { createAndDownloadZipBundle } from './zipBundle';
import type { FactoryPacketContext } from './buildFactoryPacket';
import type { ZipBundleResult } from './zipBundle';
import type {
  BuildFactoryPacketInput,
  PacketDrillMap,
  PacketConnectors,
  PacketCutList,
  PacketGateResult,
  PacketManifest,
} from './types';

// ============================================
// PREVIEW TYPES (B3)
// ============================================

/**
 * File entry in preview (includes raw bytes for display)
 */
export interface PacketPreviewFile {
  /** Relative path in packet */
  path: string;
  /** Raw content as bytes */
  bytes: Uint8Array;
  /** MIME type */
  mime: string;
  /** SHA-256 hash */
  sha256: string;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Parsed packet data for UI display
 */
export interface PacketPreviewParsed {
  drillmap?: PacketDrillMap;
  connectorsMinifix?: PacketConnectors;
  cutlist?: PacketCutList;
  gateResult?: PacketGateResult;
}

/**
 * Complete preview of a factory packet (no ZIP download)
 *
 * Used by the Export Viewer UI to display packet contents
 * before the user commits to download.
 */
export interface PacketPreview {
  /** Job ID */
  jobId: string;
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
  /** Manifest data */
  manifest: PacketManifest;
  /** All files with raw content */
  files: PacketPreviewFile[];
  /** Parsed data objects for UI widgets */
  parsed: PacketPreviewParsed;
  /** Content hash for verification */
  contentHash: string;
  /** Total uncompressed size */
  totalBytes: number;
}

// ============================================
// HOOK STATE TYPES
// ============================================

export interface UseFactoryPacketState {
  /** Is packet generation in progress */
  isGenerating: boolean;
  /** Is preview generation in progress */
  isPreviewing: boolean;
  /** Last error message */
  error: string | null;
  /** Last generated ZIP result */
  lastResult: ZipBundleResult | null;
  /** Last generated preview */
  lastPreview: PacketPreview | null;
}

export interface UseFactoryPacketActions {
  /** Generate and download factory packet */
  generateAndDownload: () => Promise<ZipBundleResult | null>;
  /** Generate preview without download (B3) */
  generatePreview: () => Promise<PacketPreview | null>;
  /** Download the last preview as ZIP */
  downloadPreview: () => Promise<ZipBundleResult | null>;
  /** Clear error state */
  clearError: () => void;
  /** Clear preview state */
  clearPreview: () => void;
}

export type UseFactoryPacketReturn = UseFactoryPacketState & UseFactoryPacketActions;

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for generating and downloading factory packets
 *
 * Usage:
 * ```tsx
 * const { isGenerating, isPreviewing, error, generateAndDownload, generatePreview } = useFactoryPacket();
 *
 * // Preview first, then download
 * <button onClick={generatePreview} disabled={isPreviewing}>
 *   {isPreviewing ? 'Loading...' : 'Preview Export'}
 * </button>
 *
 * // Direct download
 * <button onClick={generateAndDownload} disabled={isGenerating}>
 *   {isGenerating ? 'Generating...' : 'Download Factory Packet'}
 * </button>
 * ```
 */
export function useFactoryPacket(): UseFactoryPacketReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ZipBundleResult | null>(null);
  const [lastPreview, setLastPreview] = useState<PacketPreview | null>(null);
  // Store the packet output for downloadPreview
  const [cachedPacketOutput, setCachedPacketOutput] = useState<Awaited<ReturnType<typeof buildFactoryPacket>> | null>(null);

  // Get data from stores
  const cabinets = useCabinetStore((s) => s.cabinets);
  const drillMap = useDrillMapStore((s) => s.drillMap);
  const gateResult = useGateStore((s) => s.lastResult);
  const projectId = useProjectStore((s) => s.metadata?.id);

  /**
   * Generate preview without downloading (B3)
   *
   * Builds the packet in-memory and returns parsed data for UI display.
   */
  const generatePreview = useCallback(async (): Promise<PacketPreview | null> => {
    // Validate preconditions
    if (cabinets.length === 0) {
      setError('No cabinets to export');
      return null;
    }

    setIsPreviewing(true);
    setError(null);

    try {
      // Build input with stable job ID
      const input: BuildFactoryPacketInput = {
        jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: projectId || 'default-project',
        toolVersion: 'MONOLITH Designer 1.0.0',
      };

      // Build context
      const context: FactoryPacketContext = {
        cabinets,
        drillMap,
        gateResult,
      };

      // Build packet
      const packetOutput = await buildFactoryPacket(input, context);
      setCachedPacketOutput(packetOutput);

      // Convert files to preview format
      const encoder = new TextEncoder();
      const previewFiles: PacketPreviewFile[] = Object.entries(packetOutput.files).map(
        ([path, content]) => {
          const bytes = encoder.encode(content);
          // Find the file entry for hash
          const fileEntry = packetOutput.packet.manifest.files.find(f => f.path === path);
          return {
            path,
            bytes,
            mime: 'application/json',
            sha256: fileEntry?.sha256 || '',
            sizeBytes: bytes.length,
          };
        }
      );

      // Calculate total bytes
      const totalBytes = previewFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

      // Build preview object
      const preview: PacketPreview = {
        jobId: packetOutput.packet.manifest.jobId,
        createdAt: new Date(packetOutput.packet.manifest.createdAt).getTime(),
        manifest: packetOutput.packet.manifest,
        files: previewFiles,
        parsed: {
          drillmap: packetOutput.packet.drillMap,
          connectorsMinifix: packetOutput.packet.connectors,
          cutlist: packetOutput.packet.cutList,
          gateResult: packetOutput.packet.gateResult,
        },
        contentHash: packetOutput.contentHash,
        totalBytes,
      };

      setLastPreview(preview);
      return preview;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate preview';
      setError(message);
      console.error('[useFactoryPacket] Preview error:', err);
      return null;
    } finally {
      setIsPreviewing(false);
    }
  }, [cabinets, drillMap, gateResult, projectId]);

  /**
   * Download the last preview as ZIP
   *
   * Uses the cached packet output to avoid regenerating.
   */
  const downloadPreview = useCallback(async (): Promise<ZipBundleResult | null> => {
    if (!cachedPacketOutput) {
      setError('No preview to download. Generate a preview first.');
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await createAndDownloadZipBundle(cachedPacketOutput);
      setLastResult(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download packet';
      setError(message);
      console.error('[useFactoryPacket] Download error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [cachedPacketOutput]);

  /**
   * Generate and download factory packet in one step
   */
  const generateAndDownload = useCallback(async (): Promise<ZipBundleResult | null> => {
    // Validate preconditions
    if (cabinets.length === 0) {
      setError('No cabinets to export');
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Build input
      const input: BuildFactoryPacketInput = {
        jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: projectId || 'default-project',
        toolVersion: 'MONOLITH Designer 1.0.0',
      };

      // Build context
      const context: FactoryPacketContext = {
        cabinets,
        drillMap,
        gateResult,
      };

      // Build packet
      const packetOutput = await buildFactoryPacket(input, context);

      // Create and download ZIP
      const result = await createAndDownloadZipBundle(packetOutput);

      setLastResult(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate packet';
      setError(message);
      console.error('[useFactoryPacket] Error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [cabinets, drillMap, gateResult, projectId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearPreview = useCallback(() => {
    setLastPreview(null);
    setCachedPacketOutput(null);
  }, []);

  return {
    isGenerating,
    isPreviewing,
    error,
    lastResult,
    lastPreview,
    generateAndDownload,
    generatePreview,
    downloadPreview,
    clearError,
    clearPreview,
  };
}

// ============================================
// NON-REACT UTILITIES
// ============================================

/**
 * Generate factory packet without React hooks
 *
 * For use in non-component code (e.g., services, workers).
 */
export async function generateFactoryPacketFromStores(): Promise<ZipBundleResult> {
  const cabinets = useCabinetStore.getState().cabinets;
  const drillMap = useDrillMapStore.getState().drillMap;
  const gateResult = useGateStore.getState().lastResult;
  const projectId = useProjectStore.getState().metadata?.id;

  if (cabinets.length === 0) {
    throw new Error('No cabinets to export');
  }

  const input: BuildFactoryPacketInput = {
    jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: projectId || 'default-project',
    toolVersion: 'MONOLITH Designer 1.0.0',
  };

  const context: FactoryPacketContext = {
    cabinets,
    drillMap,
    gateResult,
  };

  const packetOutput = await buildFactoryPacket(input, context);
  return createAndDownloadZipBundle(packetOutput);
}

/**
 * Generate preview without React hooks (B3)
 *
 * For use in non-component code (e.g., services, workers).
 */
export async function generateFactoryPacketPreviewFromStores(): Promise<PacketPreview> {
  const cabinets = useCabinetStore.getState().cabinets;
  const drillMap = useDrillMapStore.getState().drillMap;
  const gateResult = useGateStore.getState().lastResult;
  const projectId = useProjectStore.getState().metadata?.id;

  if (cabinets.length === 0) {
    throw new Error('No cabinets to export');
  }

  const input: BuildFactoryPacketInput = {
    jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: projectId || 'default-project',
    toolVersion: 'MONOLITH Designer 1.0.0',
  };

  const context: FactoryPacketContext = {
    cabinets,
    drillMap,
    gateResult,
  };

  const packetOutput = await buildFactoryPacket(input, context);

  // Convert files to preview format
  const encoder = new TextEncoder();
  const previewFiles: PacketPreviewFile[] = Object.entries(packetOutput.files).map(
    ([path, content]) => {
      const bytes = encoder.encode(content);
      const fileEntry = packetOutput.packet.manifest.files.find(f => f.path === path);
      return {
        path,
        bytes,
        mime: 'application/json',
        sha256: fileEntry?.sha256 || '',
        sizeBytes: bytes.length,
      };
    }
  );

  const totalBytes = previewFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

  return {
    jobId: packetOutput.packet.manifest.jobId,
    createdAt: new Date(packetOutput.packet.manifest.createdAt).getTime(),
    manifest: packetOutput.packet.manifest,
    files: previewFiles,
    parsed: {
      drillmap: packetOutput.packet.drillMap,
      connectorsMinifix: packetOutput.packet.connectors,
      cutlist: packetOutput.packet.cutList,
      gateResult: packetOutput.packet.gateResult,
    },
    contentHash: packetOutput.contentHash,
    totalBytes,
  };
}

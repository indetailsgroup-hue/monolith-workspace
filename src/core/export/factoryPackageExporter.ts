/**
 * factoryPackageExporter.ts - Factory Package Exporter Interface
 *
 * ARCHITECTURE:
 * - Interface for generating factory export files
 * - Implementation plugged into TrustChainService
 * - Generates DXF, CSV, JSON reports, etc.
 *
 * USAGE:
 * - TrustChainService calls exporter.exportFactoryPackage()
 * - Exporter returns array of output files
 * - Service stores files in ArtifactStore
 * - Service appends ExportRecord to manifest chain
 */

// ============================================
// OUTPUT FILE
// ============================================

/**
 * Output file from factory package generation
 */
export interface FactoryPackageOutputFile {
  /** Logical path in bundle (e.g., "sheets/A01.dxf", "cutlist/cutlist.csv") */
  path: string;

  /** MIME type */
  mime: string;

  /** Filename for download UX */
  filename: string;

  /** Binary content */
  bytes: Uint8Array;
}

// ============================================
// EXPORTER INTERFACE
// ============================================

/**
 * Factory package exporter interface
 *
 * Implementations generate export files from job state.
 * The service handles storage and chain append.
 */
export interface FactoryPackageExporter {
  /**
   * Export factory package
   *
   * Called by TrustChainService when "Re-Export" or "Export" is requested.
   * Should generate all required files for factory.
   *
   * @param args.jobId - Job ID
   * @param args.headManifestHashHex - Current HEAD manifest hash
   * @returns Array of output files
   */
  exportFactoryPackage(args: {
    jobId: string;
    headManifestHashHex: string;
  }): Promise<FactoryPackageOutputFile[]>;
}

// ============================================
// STUB EXPORTER (for development)
// ============================================

/**
 * Create stub factory package exporter
 *
 * Returns minimal files for testing the pipeline.
 * Replace with real exporter in production.
 */
export function createStubFactoryPackageExporter(): FactoryPackageExporter {
  return {
    async exportFactoryPackage(args): Promise<FactoryPackageOutputFile[]> {
      const { jobId, headManifestHashHex } = args;

      // Create stub manifest JSON
      const manifest = {
        jobId,
        headManifestHashHex,
        exportedAt: new Date().toISOString(),
        type: 'FACTORY_PACKAGE',
        version: '1.0',
      };

      const manifestBytes = new TextEncoder().encode(
        JSON.stringify(manifest, null, 2)
      );

      return [
        {
          path: 'manifest.json',
          mime: 'application/json',
          filename: 'manifest.json',
          bytes: manifestBytes,
        },
      ];
    },
  };
}

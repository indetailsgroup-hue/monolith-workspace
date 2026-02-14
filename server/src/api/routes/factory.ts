/**
 * Factory API Routes
 *
 * Factory-specific endpoints for export options and job exports.
 *
 * Endpoints:
 * - GET  /factory/export/options                     - Get available export options
 * - POST /factory/jobs/:jobId/export                 - Trigger export for a specific job
 * - GET  /factory/jobs/:jobId/export/:exportId/download - Download export file
 * - GET  /factory/jobs/:jobId/export/history         - Get export history for job
 *
 * @version 1.1.0
 */

import { Router, Request, Response } from 'express';
import { CAS } from '../../storage/cas.js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export interface FactoryRouterDeps {
  cas: CAS;
}

// ============================================================================
// Types (matching frontend exportTypes.ts)
// ============================================================================

type ExportDialect = 'KDT' | 'BIESSE' | 'HOMAG';

type ExportProfileId =
  | 'kdt_mvp_v1'
  | 'kdt_pro_v1'
  | 'biesse_iso_v1'
  | 'homag_iso_v1'
  | 'homag_weeke_v1';

interface ExportProfile {
  id: ExportProfileId;
  name: string;
  dialect: ExportDialect;
  description?: string;
  enabled: boolean;
}

type ExportTarget = 'GCODE' | 'DXF' | 'BUNDLE' | 'MANIFEST';
type ExportMode = 'PER_SHEET' | 'PER_JOB';

interface ExportOptionsResponse {
  dialects: {
    id: ExportDialect;
    name: string;
    profiles: ExportProfile[];
  }[];
  modes: {
    id: ExportMode;
    name: string;
    description: string;
  }[];
  targets: {
    id: ExportTarget;
    name: string;
    description: string;
    enabled: boolean;
  }[];
}

interface ExportRequest {
  target: ExportTarget;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  mode: ExportMode;
  include?: {
    manifest?: boolean;
    packet?: boolean;
    dxf?: boolean;
  };
}

// ============================================================================
// Static Export Options Configuration
// ============================================================================

const EXPORT_OPTIONS: ExportOptionsResponse = {
  dialects: [
    {
      id: 'KDT',
      name: 'KDT',
      profiles: [
        {
          id: 'kdt_mvp_v1',
          name: 'KDT MVP v1',
          dialect: 'KDT',
          description: 'Basic KDT G-code output',
          enabled: true,
        },
        {
          id: 'kdt_pro_v1',
          name: 'KDT Pro v1',
          dialect: 'KDT',
          description: 'Advanced KDT G-code with optimizations',
          enabled: true,
        },
      ],
    },
    {
      id: 'BIESSE',
      name: 'Biesse',
      profiles: [
        {
          id: 'biesse_iso_v1',
          name: 'Biesse ISO v1',
          dialect: 'BIESSE',
          description: 'Biesse ISO G-code format',
          enabled: true,
        },
      ],
    },
    {
      id: 'HOMAG',
      name: 'Homag',
      profiles: [
        {
          id: 'homag_iso_v1',
          name: 'Homag ISO v1',
          dialect: 'HOMAG',
          description: 'Homag ISO G-code format',
          enabled: true,
        },
        {
          id: 'homag_weeke_v1',
          name: 'Homag Weeke v1',
          dialect: 'HOMAG',
          description: 'Homag Weeke format',
          enabled: false,
        },
      ],
    },
  ],
  modes: [
    {
      id: 'PER_SHEET',
      name: 'Per Sheet',
      description: 'Generate separate files for each sheet',
    },
    {
      id: 'PER_JOB',
      name: 'Per Job',
      description: 'Generate a single combined file for the entire job',
    },
  ],
  targets: [
    {
      id: 'GCODE',
      name: 'G-Code',
      description: 'CNC machine G-code output',
      enabled: true,
    },
    {
      id: 'DXF',
      name: 'DXF',
      description: 'AutoCAD DXF format for CAD software',
      enabled: true,
    },
    {
      id: 'BUNDLE',
      name: 'Bundle',
      description: 'Complete export bundle with all files',
      enabled: true,
    },
    {
      id: 'MANIFEST',
      name: 'Manifest Only',
      description: 'Export manifest JSON only',
      enabled: true,
    },
  ],
};

// ============================================================================
// Router Factory
// ============================================================================

export function factoryRouter(deps: FactoryRouterDeps): Router {
  const router = Router();
  const { cas } = deps;

  /**
   * GET /factory/export/options - Get available export options
   */
  router.get('/export/options', async (req: Request, res: Response) => {
    try {
      res.json(EXPORT_OPTIONS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Factory] Export options error:', message);
      res.status(500).json({
        ok: false,
        code: 'E_EXPORT_INTERNAL',
        message,
      });
    }
  });

  /**
   * POST /factory/jobs/:jobId/export - Trigger export for a specific job
   */
  router.post('/jobs/:jobId/export', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const exportReq = req.body as ExportRequest;

      // Validate required fields
      if (!exportReq.target || !exportReq.dialect || !exportReq.profileId || !exportReq.mode) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_DIALECT_INVALID',
          message: 'Missing required fields: target, dialect, profileId, mode',
        });
      }

      // Validate dialect
      const validDialects: ExportDialect[] = ['KDT', 'BIESSE', 'HOMAG'];
      if (!validDialects.includes(exportReq.dialect)) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_DIALECT_INVALID',
          message: `Invalid dialect. Must be one of: ${validDialects.join(', ')}`,
        });
      }

      // Validate profile exists and matches dialect
      const dialectConfig = EXPORT_OPTIONS.dialects.find(d => d.id === exportReq.dialect);
      const profileConfig = dialectConfig?.profiles.find(p => p.id === exportReq.profileId);

      if (!profileConfig) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_PROFILE_INVALID',
          message: `Invalid profile "${exportReq.profileId}" for dialect "${exportReq.dialect}"`,
        });
      }

      if (!profileConfig.enabled) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_PROFILE_INVALID',
          message: `Profile "${exportReq.profileId}" is not enabled`,
        });
      }

      // Generate export
      const exportId = uuidv4();
      const exportedAt = new Date().toISOString();

      // Create export content (placeholder - in production this would generate actual files)
      const exportContent = JSON.stringify({
        exportId,
        jobId,
        dialect: exportReq.dialect,
        profileId: exportReq.profileId,
        target: exportReq.target,
        mode: exportReq.mode,
        include: exportReq.include,
        exportedAt,
      }, null, 2);

      // Calculate SHA256 of export content
      const sha256 = createHash('sha256').update(exportContent).digest('hex');

      // Store export in CAS
      const exportPath = `exports/${jobId}/${exportId}.json`;
      await cas.putJson(exportPath, JSON.parse(exportContent));

      // Build response
      const filename = `export-${jobId}-${exportReq.dialect.toLowerCase()}.zip`;
      const downloadPath = `/api/exports/${exportId}/download`;
      const sizeBytes = Buffer.byteLength(exportContent, 'utf-8');

      // Set SHA256 header (frontend expects this)
      res.setHeader('X-MONOLITH-ZIP-SHA256', sha256);

      res.json({
        ok: true,
        exportId,
        sha256,
        sizeBytes,
        filename,
        downloadPath,
        exportedAt,
        dialect: exportReq.dialect,
        profileId: exportReq.profileId,
        contents: {
          sheets: 1, // Placeholder - would be calculated from actual job data
          files: 1,
          hasManifest: exportReq.include?.manifest ?? false,
          hasPacket: exportReq.include?.packet ?? false,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Factory] Job export error:', message);
      res.status(500).json({
        ok: false,
        code: 'E_EXPORT_INTERNAL',
        message,
      });
    }
  });

  /**
   * GET /factory/jobs/:jobId/export/:exportId/download - Download export file
   */
  router.get('/jobs/:jobId/export/:exportId/download', async (req: Request, res: Response) => {
    try {
      const { jobId, exportId } = req.params;

      // Validate job ID format
      if (!isValidJobId(jobId)) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_JOB_NOT_FOUND',
          message: 'Invalid job ID format',
        });
      }

      // Try to read export data from CAS
      const exportPath = `exports/${jobId}/${exportId}.json`;
      const exportData = await cas.readJsonSafe<ExportRecord>(exportPath);

      if (!exportData) {
        return res.status(404).json({
          ok: false,
          code: 'E_EXPORT_NOT_FOUND',
          message: 'Export not found or has expired',
        });
      }

      // Verify export belongs to this job
      if (exportData.jobId !== jobId) {
        return res.status(403).json({
          ok: false,
          code: 'E_EXPORT_ACCESS_DENIED',
          message: 'Export does not belong to this job',
        });
      }

      // Generate mock G-code content for download
      const gcodeContent = generateMockGcode(exportData);
      const filename = `${jobId}_${exportData.dialect.toLowerCase()}_export.nc`;

      // Set response headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-MONOLITH-ZIP-SHA256', exportData.sha256 || createHash('sha256').update(gcodeContent).digest('hex'));
      res.setHeader('X-MONOLITH-Export-Id', exportId);

      res.send(gcodeContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Factory] Download error:', message);
      res.status(500).json({
        ok: false,
        code: 'E_EXPORT_INTERNAL',
        message,
      });
    }
  });

  /**
   * GET /factory/jobs/:jobId/export/history - Get export history for job
   */
  router.get('/jobs/:jobId/export/history', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      // Validate job ID format
      if (!isValidJobId(jobId)) {
        return res.status(400).json({
          ok: false,
          code: 'E_EXPORT_JOB_NOT_FOUND',
          message: 'Invalid job ID format',
        });
      }

      // List exports for this job from CAS
      const exportDir = `exports/${jobId}`;
      const exportFiles = await cas.list(exportDir);

      const exports: ExportHistoryEntry[] = [];

      for (const file of exportFiles) {
        if (file.endsWith('.json')) {
          const exportData = await cas.readJsonSafe<ExportRecord>(`${exportDir}/${file}`);
          if (exportData) {
            exports.push({
              exportId: exportData.exportId,
              dialect: exportData.dialect,
              profileId: exportData.profileId,
              target: exportData.target,
              exportedAt: exportData.exportedAt,
            });
          }
        }
      }

      // Sort by export date (newest first)
      exports.sort((a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime());

      res.json({
        ok: true,
        jobId,
        count: exports.length,
        exports,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Factory] Export history error:', message);
      res.status(500).json({
        ok: false,
        code: 'E_EXPORT_INTERNAL',
        message,
      });
    }
  });

  return router;
}

// ============================================================================
// Types
// ============================================================================

interface ExportRecord {
  exportId: string;
  jobId: string;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  target: ExportTarget;
  mode: ExportMode;
  include?: {
    manifest?: boolean;
    packet?: boolean;
    dxf?: boolean;
  };
  exportedAt: string;
  sha256?: string;
}

interface ExportHistoryEntry {
  exportId: string;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  target: ExportTarget;
  exportedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate job ID format (JOB-YYYY-NNNN)
 */
function isValidJobId(jobId: string): boolean {
  return /^JOB-\d{4}-\d{4}$/.test(jobId);
}

/**
 * Generate mock G-code content for download
 */
function generateMockGcode(exportData: ExportRecord): string {
  const header = getDialectHeader(exportData.dialect);
  const timestamp = new Date().toISOString();

  return `${header}
; Job: ${exportData.jobId}
; Export ID: ${exportData.exportId}
; Profile: ${exportData.profileId}
; Generated: ${timestamp}
; Generated by MONOLITH Factory Export Service
;
G21 ; Metric units (mm)
G90 ; Absolute positioning
G17 ; XY plane selection

; Tool selection
T1 M6 ; Select tool 1
S18000 M3 ; Spindle on at 18000 RPM

; Safe start position
G0 X0 Y0 Z50

; Begin cutting operations
G0 X100 Y100 ; Rapid to start position
G1 Z-5 F1000 ; Plunge
G1 X200 F3000 ; Cut
G1 Y200
G1 X100
G1 Y100
G0 Z50 ; Retract

; End program
M5 ; Spindle off
G0 X0 Y0 ; Return to origin
M30 ; Program end
`;
}

/**
 * Get dialect-specific G-code header
 */
function getDialectHeader(dialect: ExportDialect): string {
  switch (dialect) {
    case 'KDT':
      return `; KDT CNC G-Code
; Machine: KDT Series Router
; Post-processor: kdt_mvp_v1`;
    case 'BIESSE':
      return `; BIESSE CNC G-Code
; Machine: Biesse Rover Series
; Post-processor: biesse_iso_v1`;
    case 'HOMAG':
      return `; HOMAG CNC G-Code
; Machine: Homag/Weeke Series
; Post-processor: homag_iso_v1`;
    default:
      return `; Generic CNC G-Code`;
  }
}

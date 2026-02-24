/**
 * Artifact API Routes
 *
 * Step 10: Signed URL download and direct artifact access
 *
 * Endpoints:
 * - GET /download - Download via signed URL (time-limited, HMAC-verified)
 * - GET /artifacts/:sha256 - Direct artifact access (for internal use)
 */

import { Router, Request, Response } from 'express';
import { CAS } from '../../storage/cas.js';
import { verifySignedDownloadQuery, isHashRevoked } from '../../download/signedUrl.js';

export interface ArtifactsRouterDeps {
  cas: CAS;
}

export function artifactsRouter(deps: ArtifactsRouterDeps): Router {
  const router = Router();
  const { cas } = deps;

  /**
   * GET /download - Download via signed URL
   *
   * Query params:
   * - sha256: Content hash
   * - exp: Expiration timestamp (Unix seconds)
   * - mime: MIME type
   * - fn: Filename
   * - sig: HMAC signature
   */
  router.get('/download', async (req: Request, res: Response) => {
    try {
      // Verify signed URL
      const verification = verifySignedDownloadQuery(req.query as Record<string, unknown>);

      if (!verification.ok) {
        return res.status(403).json({
          ok: false,
          error: verification.reason,
          message: getErrorMessage(verification.reason),
        });
      }

      const { sha256, mime, filename } = verification;

      // Check if hash has been revoked
      if (sha256 && isHashRevoked(sha256)) {
        return res.status(403).json({
          ok: false,
          error: 'REVOKED',
          message: 'This content has been revoked',
        });
      }

      // Get content from CAS
      const content = await cas.getBytes(sha256!);

      if (!content) {
        return res.status(404).json({
          ok: false,
          error: 'NOT_FOUND',
          message: 'Content not found',
        });
      }

      // Set response headers
      res.setHeader('Content-Type', mime || 'application/octet-stream');
      res.setHeader('Content-Length', content.length);
      res.setHeader('Cache-Control', 'private, max-age=300'); // 5 min cache

      if (filename) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${sha256}"`);
      }

      // Send content
      res.send(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Download] Error:', message);
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * GET /artifacts/:sha256 - Direct artifact access
   *
   * For internal use only (no signature required).
   * In production, you might want to restrict this to internal networks.
   */
  router.get('/artifacts/:sha256', async (req: Request, res: Response) => {
    try {
      const { sha256 } = req.params;

      // Validate hash format
      if (!/^[a-f0-9]{64}$/i.test(sha256)) {
        return res.status(400).json({
          ok: false,
          error: 'INVALID_HASH',
          message: 'SHA256 hash must be 64 hex characters',
        });
      }

      // Get content from CAS
      const content = await cas.getBytes(sha256);

      if (!content) {
        return res.status(404).json({
          ok: false,
          error: 'NOT_FOUND',
        });
      }

      // Determine content type from file content (basic detection)
      const mime = detectMimeType(content);

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', content.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year (content-addressed)

      res.send(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * HEAD /artifacts/:sha256 - Check if artifact exists
   */
  router.head('/artifacts/:sha256', async (req: Request, res: Response) => {
    try {
      const { sha256 } = req.params;

      const exists = await cas.hasHash(sha256);

      if (exists) {
        res.status(200).end();
      } else {
        res.status(404).end();
      }
    } catch {
      res.status(500).end();
    }
  });

  return router;
}

// ============================================================================
// Helpers
// ============================================================================

function getErrorMessage(reason?: string): string {
  switch (reason) {
    case 'MISSING_PARAMS':
      return 'Missing required URL parameters';
    case 'EXPIRED':
      return 'Download link has expired';
    case 'SIG_INVALID':
      return 'Invalid signature';
    default:
      return 'Access denied';
  }
}

function detectMimeType(content: Buffer): string {
  // Simple magic number detection
  const header = content.slice(0, 8);

  // PDF
  if (header.toString('ascii', 0, 4) === '%PDF') {
    return 'application/pdf';
  }

  // PNG
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return 'image/png';
  }

  // JPEG
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  // ZIP/XLSX/DOCX
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return 'application/zip';
  }

  // Try to detect text-based formats
  const textContent = content.toString('utf-8', 0, 100);

  if (textContent.startsWith('0\nSECTION') || textContent.includes('$ACADVER')) {
    return 'application/dxf';
  }

  if (textContent.startsWith('{') || textContent.startsWith('[')) {
    return 'application/json';
  }

  if (textContent.startsWith('G0') || textContent.startsWith('G1') || textContent.startsWith(';')) {
    return 'text/plain'; // G-code
  }

  // Default
  return 'application/octet-stream';
}

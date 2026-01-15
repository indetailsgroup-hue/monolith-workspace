/**
 * Bundle API Routes
 *
 * Step 10: Bundle upload, verification, and management
 *
 * Endpoints:
 * - POST /bundles - Upload and verify a bundle
 * - GET /bundles - List all bundles
 * - GET /bundles/:id - Get bundle info
 */

import { Router, Request, Response } from 'express';
import { CAS, sha256Hex } from '../../storage/cas.js';
import { verifyBundle, extractManifest, getBundleId } from '../../verify/verifyBundle.js';
import type { ArtifactBundle } from '../../types.js';

export interface BundleRouterDeps {
  cas: CAS;
}

export function bundlesRouter(deps: BundleRouterDeps): Router {
  const router = Router();
  const { cas } = deps;

  /**
   * POST /bundles - Upload and verify a bundle
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { bundle } = req.body as { bundle?: ArtifactBundle };

      if (!bundle || !bundle.files) {
        return res.status(400).json({
          ok: false,
          error: 'INVALID_REQUEST',
          message: 'Bundle is required',
        });
      }

      // Verify the bundle
      const verify = await verifyBundle(bundle);

      if (!verify.ok) {
        return res.status(400).json({
          ok: false,
          error: 'VERIFICATION_FAILED',
          verify,
        });
      }

      // Calculate bundle ID
      const bundleId = getBundleId(bundle);

      // Store bundle files in CAS
      for (const file of bundle.files) {
        const content = typeof file.content === 'string'
          ? file.content
          : Buffer.from(file.content);
        await cas.putBytes(content);
      }

      // Create bundle index
      const manifest = extractManifest(bundle);
      const bundleIndex = {
        version: 'bundle-index.v1',
        bundleId,
        createdAtIso: bundle.createdAtIso,
        uploadedAtIso: new Date().toISOString(),
        manifest,
        files: bundle.files.map(f => ({
          name: f.name,
          sha256: f.hashHex,
          contentType: f.contentType,
          sizeBytes: Buffer.byteLength(f.content, 'utf-8'),
        })),
      };

      // Store bundle index
      await cas.putJson(`bundles/${bundleId}.json`, bundleIndex);

      res.json({
        ok: true,
        bundleId,
        verify,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Bundles] Upload error:', message);
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  /**
   * GET /bundles - List all bundles
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      // This is a simple implementation
      // In production, you'd want pagination and better indexing
      const bundleIds: string[] = [];

      // Note: This requires listing files in the bundles directory
      // For MVP, we return an empty list or implement file listing
      res.json({
        ok: true,
        bundles: bundleIds,
      });
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
   * GET /bundles/:id - Get bundle info
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const bundleId = req.params.id;

      const exists = await cas.exists(`bundles/${bundleId}.json`);
      if (!exists) {
        return res.status(404).json({
          ok: false,
          error: 'BUNDLE_NOT_FOUND',
        });
      }

      const bundleIndex = await cas.readJson(`bundles/${bundleId}.json`);

      res.json({
        ok: true,
        bundle: bundleIndex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        ok: false,
        error: 'SERVER_ERROR',
        message,
      });
    }
  });

  return router;
}

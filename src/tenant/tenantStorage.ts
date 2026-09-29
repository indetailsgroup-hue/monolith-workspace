/**
 * tenant/tenantStorage.ts — Org-scoped Supabase Storage utilities
 *
 * All file uploads in MONOLITH are scoped to the tenant's org_id.
 * Storage path pattern: {bucket}/{org_id}/{category}/{filename}
 *
 * Categories:
 * - logos/        — org logos and branding assets
 * - jobs/         — job-related files (DXF, PDF, images)
 * - quotations/   — generated quotation PDFs
 * - exports/      — batch export archives (ZIP)
 * - attachments/  — generic file attachments
 *
 * RLS on storage: only members of the org can access files under org_id/
 */

import type { Organization } from './types';

// ============================================================================
// Constants
// ============================================================================

export const STORAGE_BUCKET = 'monolith-files';

export type StorageCategory = 'logos' | 'jobs' | 'quotations' | 'exports' | 'attachments';

export const ALLOWED_MIME_TYPES: Record<StorageCategory, string[]> = {
  logos: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
  jobs: ['application/dxf', 'application/pdf', 'image/png', 'image/jpeg', 'application/zip'],
  quotations: ['application/pdf'],
  exports: ['application/zip', 'application/x-zip-compressed'],
  attachments: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ],
};

export const MAX_FILE_SIZES: Record<StorageCategory, number> = {
  logos: 2 * 1024 * 1024,         // 2 MB
  jobs: 50 * 1024 * 1024,        // 50 MB
  quotations: 10 * 1024 * 1024,  // 10 MB
  exports: 200 * 1024 * 1024,    // 200 MB
  attachments: 20 * 1024 * 1024, // 20 MB
};

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Build org-scoped storage path.
 * Pattern: {org_id}/{category}/{filename}
 */
export function buildStoragePath(orgId: string, category: StorageCategory, filename: string): string {
  // Sanitize filename
  const sanitized = sanitizeFilename(filename);
  return `${orgId}/${category}/${sanitized}`;
}

/**
 * Build org-scoped storage path for a job-specific file.
 * Pattern: {org_id}/jobs/{jobId}/{filename}
 */
export function buildJobFilePath(orgId: string, jobId: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  return `${orgId}/jobs/${jobId}/${sanitized}`;
}

/**
 * Extract org_id from a storage path.
 */
export function extractOrgIdFromPath(path: string): string | null {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  // Validate UUID format (basic check)
  const candidate = parts[0];
  if (candidate.length === 36 && candidate.includes('-')) return candidate;
  return null;
}

/**
 * Check if a storage path belongs to the given org.
 */
export function pathBelongsToOrg(path: string, orgId: string): boolean {
  return path.startsWith(`${orgId}/`);
}

/**
 * Sanitize filename for safe storage.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, 'f_')
    .slice(0, 200);
}

/**
 * Generate a unique filename with timestamp to prevent collisions.
 */
export function uniqueFilename(originalName: string): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop() : '';
  const base = originalName.replace(/\.[^.]+$/, '');
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeFilename(`${base}_${timestamp}_${rand}${ext ? '.' + ext : ''}`);
}

// ============================================================================
// Validation
// ============================================================================

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file before upload.
 */
export function validateFile(
  file: { name: string; size: number; type: string },
  category: StorageCategory
): FileValidationResult {
  const allowedTypes = ALLOWED_MIME_TYPES[category];
  const maxSize = MAX_FILE_SIZES[category];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `ประเภทไฟล์ "${file.type}" ไม่อนุญาตสำหรับหมวด ${category}. อนุญาต: ${allowedTypes.join(', ')}`,
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `ไฟล์ขนาด ${(file.size / 1024 / 1024).toFixed(1)} MB เกินขนาดสูงสุดที่อนุญาต (${maxSize / 1024 / 1024} MB)`,
    };
  }

  if (!file.name || file.name.length === 0) {
    return { valid: false, error: 'ชื่อไฟล์ว่างเปล่า' };
  }

  return { valid: true };
}

// ============================================================================
// Upload / Download Helpers (Supabase Storage API wrappers)
// ============================================================================

export interface UploadParams {
  org: Organization;
  category: StorageCategory;
  file: File;
  jobId?: string;             // if category === 'jobs'
  customFilename?: string;
}

export interface UploadResult {
  success: boolean;
  path?: string;
  publicUrl?: string;
  error?: string;
}

/**
 * Upload a file to org-scoped storage.
 * In production: uses Supabase Storage client.
 */
export async function uploadFile(params: UploadParams): Promise<UploadResult> {
  const { org, category, file, jobId, customFilename } = params;

  // Validate
  const validation = validateFile(file, category);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Build path
  const filename = customFilename || uniqueFilename(file.name);
  const path = jobId
    ? buildJobFilePath(org.orgId, jobId, filename)
    : buildStoragePath(org.orgId, category, filename);

  try {
    // In production:
    // const { data, error } = await supabase.storage
    //   .from(STORAGE_BUCKET)
    //   .upload(path, file, { contentType: file.type, upsert: false });

    // Simulated success for now
    return {
      success: true,
      path,
      publicUrl: `https://storage.monolith.app/${STORAGE_BUCKET}/${path}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Upload failed' };
  }
}

/**
 * Get a signed URL for a private file.
 */
export async function getSignedUrl(path: string, expiresInSeconds: number = 3600): Promise<string | null> {
  // In production:
  // const { data, error } = await supabase.storage
  //   .from(STORAGE_BUCKET)
  //   .createSignedUrl(path, expiresInSeconds);
  // return data?.signedUrl || null;

  return `https://storage.monolith.app/${STORAGE_BUCKET}/${path}?token=signed_${Date.now()}`;
}

/**
 * Delete a file from org-scoped storage.
 * Validates the path belongs to the org before deletion.
 */
export async function deleteFile(orgId: string, path: string): Promise<{ success: boolean; error?: string }> {
  if (!pathBelongsToOrg(path, orgId)) {
    return { success: false, error: 'TENANT_ISOLATION: Path does not belong to this org' };
  }

  try {
    // In production:
    // await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * List files in an org-scoped directory.
 */
export async function listFiles(
  orgId: string,
  category: StorageCategory,
  jobId?: string
): Promise<{ name: string; path: string; size: number; createdAt: string }[]> {
  const prefix = jobId
    ? `${orgId}/jobs/${jobId}/`
    : `${orgId}/${category}/`;

  // In production:
  // const { data } = await supabase.storage.from(STORAGE_BUCKET).list(prefix);
  // return data?.map(...) || [];

  return [];
}

// ============================================================================
// Storage RLS SQL (for migration reference)
// ============================================================================

export function generateStoragePolicy(): string {
  return `
-- Storage RLS: users can only access files under their org's prefix
CREATE POLICY "storage_tenant_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = '${STORAGE_BUCKET}' AND
    (storage.foldername(name))[1] = (SELECT org_id::text FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1)
  );

CREATE POLICY "storage_tenant_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = '${STORAGE_BUCKET}' AND
    (storage.foldername(name))[1] = (SELECT org_id::text FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1)
  );

CREATE POLICY "storage_tenant_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = '${STORAGE_BUCKET}' AND
    (storage.foldername(name))[1] = (SELECT org_id::text FROM public.org_members WHERE user_id = auth.uid() AND is_active = true LIMIT 1)
  );
`.trim();
}

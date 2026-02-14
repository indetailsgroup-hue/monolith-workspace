/**
 * Admin Schema (G9 Persistence Boundary)
 *
 * Zod schemas for admin session data stored in localStorage.
 *
 * @version 1.0.0
 */

import { z } from 'zod';

/**
 * Schema for admin session "on" flag ('1' or '0')
 */
export const AdminSessionOnSchema = z.enum(['0', '1']);

/**
 * Schema for admin session expiry (ISO timestamp)
 */
export const AdminSessionExpirySchema = z.string().refine(
  s => !isNaN(Date.parse(s)),
  { message: 'Invalid ISO timestamp for admin session expiry' }
);

/**
 * Schema for admin password hash (SHA-256 hex string)
 */
export const AdminHashSchema = z.string().regex(
  /^[a-f0-9]{64}$/,
  { message: 'Admin hash must be 64 hex characters (SHA-256)' }
);

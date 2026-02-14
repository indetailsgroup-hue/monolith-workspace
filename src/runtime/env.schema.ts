/**
 * Runtime Environment Schema (G9 Persistence Boundary)
 *
 * Zod schemas for runtime environment config stored in localStorage.
 *
 * @version 1.0.0
 */

import { z } from 'zod';

/**
 * Runtime mode schema
 */
export const RuntimeModeSchema = z.enum(['DESIGNER', 'FACTORY']);

/**
 * Factory ID schema (non-empty string)
 */
export const FactoryIdSchema = z.string().min(1, 'Factory ID cannot be empty');

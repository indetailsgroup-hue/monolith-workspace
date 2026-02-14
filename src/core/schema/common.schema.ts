/**
 * Common Zod Schemas
 *
 * Shared schema building blocks for hardware and other configuration schemas.
 */

import { z } from 'zod';

/** UUID or nanoid-style identifier */
export const IdSchema = z.string().min(1).max(128);

/** Nullable/optional wrapper */
export const Nullish = <T extends z.ZodTypeAny>(schema: T) => schema.nullish();

/** Positive millimeter value (> 0) */
export const PositiveMmSchema = z.number().positive();

/** Non-negative millimeter value (>= 0) */
export const NonNegativeMmSchema = z.number().nonnegative();

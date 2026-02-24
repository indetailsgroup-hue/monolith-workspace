/**
 * jobRegistry/index.ts - Job Registry Module
 *
 * Provides job ID tracking for:
 * - Listing all jobs
 * - Checking if job exists
 * - Deriving next revision ID
 */

export { type JobRegistryStore } from './jobRegistryStore';

export {
  createLocalStorageJobRegistry,
  createMemoryJobRegistry,
} from './localStorageJobRegistry';

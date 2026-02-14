/**
 * session/index.ts - Session Module Exports
 *
 * Provides job session context management for:
 * - Current job tracking
 * - Store lifecycle management
 * - Navigation between jobs/revisions
 */

export {
  JobSessionProvider,
  useJobSession,
  type JobSessionContextValue,
  type JobSessionProviderProps,
} from './JobSessionProvider';

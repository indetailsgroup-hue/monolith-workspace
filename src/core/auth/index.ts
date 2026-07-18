/**
 * Auth Module - Role-based access control
 *
 * @example
 * import { RequireRole, canExport, getCurrentRole } from '@/core/auth';
 */

export * from './roles';
export * from './permissions';
export {
  RequireRole,
  RoleBadge,
} from './guards';
export { useRoleStore } from './useRoleStore';
export { useSessionStore } from './useSessionStore';
export { getSupabaseClient, getAuthStorageKey } from './supabaseClient';

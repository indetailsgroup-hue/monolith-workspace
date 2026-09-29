/**
 * core/auth/index.ts — Barrel export for auth module
 */
export { type Role, ROLES, getCurrentRole, setCurrentRole, hasRole, isAdmin, getRoleFeatures } from './roles';
export { useRoleStore } from './useRoleStore';
export { useAuthSession, type AuthSessionState } from './useAuthSession';
export {
  signIn,
  signOut,
  getSession,
  getUser,
  refreshSession,
  getSupabaseClient,
  setSupabaseClient,
  deriveRoleFromUser,
  deriveRoleFromToken,
  onAuthStateChange,
} from './supabaseAuth';
export { RequireRole, RequireSpecState, RequirePermission, DevOnly, AdminOnly, FactoryOnly, RoleBadge } from './guards';

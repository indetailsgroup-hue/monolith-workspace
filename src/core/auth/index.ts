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
  RequireSpecState,
  RequirePermission,
  DevOnly,
  AdminOnly,
  FactoryOnly,
  RoleBadge,
} from './guards';

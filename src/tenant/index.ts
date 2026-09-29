/**
 * tenant/index.ts — Barrel exports for Multi-Tenant Module
 */

// Types
export type {
  Organization,
  OrgMember,
  OrgInvitation,
  OrgRole,
  OrgPlan,
  OrgStatus,
  OrgSettings,
  TenantContext,
  TenantPermissions,
  InviteStatus,
} from './types';

export {
  ORG_ROLE_HIERARCHY,
  PLAN_LIMITS,
  hasPermission,
  isOwnerOrAdmin,
  canAccessFeature,
  isTrialExpired,
  generateOrgSlug,
} from './types';

// Store
export { useTenantStore } from './tenantStore';

// Provider & Hooks
export {
  TenantProvider,
  useTenant,
  useOrgId,
  useFeatureGate,
  OrgGuard,
  FeatureGate,
} from './TenantProvider';
export type { TenantProviderProps } from './TenantProvider';

// Onboarding
export { TenantOnboarding } from './TenantOnboarding';
export type { TenantOnboardingProps } from './TenantOnboarding';

// Query Helpers
export {
  scopeToOrg,
  withOrgId,
  withOrgIdBatch,
  assertOrgOwnership,
  belongsToOrg,
  generateRlsPolicy,
} from './orgScopedQuery';

// Billing
export {
  PLAN_PRICING,
  createCheckoutSession,
  createPortalSession,
  getPlanChangeDirection,
  canChangePlan,
  calculateProration,
  stripePriceToOrgPlan,
  stripePriceToInterval,
} from './billing';
export type {
  PlanPricing,
  BillingInterval,
  SubscriptionStatus,
  BillingSubscription,
  BillingInvoice,
  CreateCheckoutParams,
  CheckoutSession,
  CreatePortalParams,
  PortalSession,
  PlanChangeDirection,
  BillingWebhookEvent,
  WebhookPayload,
} from './billing';
export { BillingPage } from './BillingPage';

// Settings
export { OrgSettingsPage } from './OrgSettingsPage';

// Storage
export {
  STORAGE_BUCKET,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZES,
  buildStoragePath,
  buildJobFilePath,
  extractOrgIdFromPath,
  pathBelongsToOrg,
  sanitizeFilename,
  uniqueFilename,
  validateFile,
  uploadFile,
  getSignedUrl,
  deleteFile,
  listFiles,
  generateStoragePolicy,
} from './tenantStorage';
export type {
  StorageCategory,
  FileValidationResult,
  UploadParams,
  UploadResult,
} from './tenantStorage';

// Usage Metering
export {
  PLAN_STORAGE_LIMITS,
  getCurrentPeriod,
  getPeriodRange,
  isInPeriod,
  canCreateJob,
  canInviteMember,
  canUseFeature,
  canUploadFile,
  getUsageAlerts,
  buildUsageMetrics,
  jobCountQuery,
  memberCountQuery,
  generateUsageMeteringRpc,
  enforceLimit,
} from './usageMetering';
export type {
  UsageMetrics,
  UsageCheckResult,
  UsageAlert,
  UsageResource,
} from './usageMetering';

// Audit Log
export {
  AUDIT_ACTION_LABELS,
  getActionCategory,
  getActionSeverity,
  recordAuditEntry,
  fetchAuditLog,
  formatAuditDescription,
  getAuditIcon,
  generateAuditLogMigration,
} from './auditLog';
export type {
  AuditCategory,
  AuditAction,
  ActorType,
  AuditLogEntry,
  CreateAuditEntry,
  AuditLogFilters,
  AuditLogPage,
} from './auditLog';

// Audit Log Viewer
export { AuditLogViewer } from './AuditLogViewer';
export type { AuditLogViewerProps } from './AuditLogViewer';

// Usage Dashboard
export { UsageDashboard } from './UsageDashboard';
export type { UsageDashboardProps } from './UsageDashboard';

// Grace Period
export {
  DEFAULT_GRACE_CONFIG,
  CANCELLATION_REMINDER_DAYS,
  EMAIL_TEMPLATES,
  calculateGraceExpiry,
  getRemainingGraceDays,
  isGracePeriodExpired,
  getNextReminder,
  createGracePeriod,
  resolveGracePeriod,
  expireGracePeriod,
  buildGraceStartEmail,
  buildGraceReminderEmail,
  buildDowngradeEmail,
  buildCancellationReminderEmail,
  buildPaymentSuccessEmail,
  processGracePeriods,
  generateGracePeriodCronSql,
  generateGracePeriodMigration,
} from './gracePeriod';
export type {
  GracePeriodConfig,
  GracePeriodState,
  EmailNotification,
  NotificationTemplate,
  GraceAction,
} from './gracePeriod';

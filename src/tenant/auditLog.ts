/**
 * tenant/auditLog.ts — Org-Level Audit Logging for MONOLITH Multi-Tenant
 *
 * Provides:
 * - Typed audit event definitions
 * - Client-side audit log recording
 * - Query helpers for audit log retrieval
 * - Audit trail formatting for UI display
 *
 * All audit entries are org-scoped with actor attribution.
 */

// ============================================================================
// Types
// ============================================================================

/** Categories of auditable actions */
export type AuditCategory = 'member' | 'billing' | 'job' | 'settings' | 'auth' | 'storage';

/** Specific audit actions within each category */
export type AuditAction =
  // Member actions
  | 'member.invited'
  | 'member.joined'
  | 'member.role_changed'
  | 'member.removed'
  | 'member.left'
  // Billing actions
  | 'billing.subscription_created'
  | 'billing.subscription_updated'
  | 'billing.subscription_deleted'
  | 'billing.checkout_completed'
  | 'billing.invoice_paid'
  | 'billing.payment_failed'
  | 'billing.plan_upgraded'
  | 'billing.plan_downgraded'
  // Job actions
  | 'job.created'
  | 'job.status_changed'
  | 'job.deleted'
  | 'job.assigned'
  | 'job.exported'
  // Settings actions
  | 'settings.org_updated'
  | 'settings.logo_changed'
  | 'settings.workspace_updated'
  // Auth actions
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled'
  // Storage actions
  | 'storage.file_uploaded'
  | 'storage.file_deleted'
  | 'storage.quota_exceeded';

/** Who performed the action */
export type ActorType = 'user' | 'system' | 'api';

/** A single audit log entry */
export interface AuditLogEntry {
  id: string;
  orgId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId: string;            // user ID or 'stripe-webhook', 'system', etc.
  actorName?: string;         // display name for UI
  actorEmail?: string;        // email for user actors
  targetType?: string;        // 'member', 'job', 'org', etc.
  targetId?: string;          // ID of the affected resource
  targetName?: string;        // display name of target
  metadata?: Record<string, unknown>;  // action-specific data
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;          // ISO timestamp
}

/** Input for creating a new audit entry */
export interface CreateAuditEntry {
  orgId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId: string;
  actorName?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Filters for querying audit logs */
export interface AuditLogFilters {
  orgId: string;
  category?: AuditCategory;
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/** Paginated audit log response */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Action Metadata
// ============================================================================

/** Human-readable labels for each action (Thai) */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'member.invited': 'เชิญสมาชิก',
  'member.joined': 'สมาชิกเข้าร่วม',
  'member.role_changed': 'เปลี่ยนบทบาทสมาชิก',
  'member.removed': 'ลบสมาชิก',
  'member.left': 'สมาชิกออก',
  'billing.subscription_created': 'สร้างการสมัครสมาชิก',
  'billing.subscription_updated': 'อัพเดทการสมัครสมาชิก',
  'billing.subscription_deleted': 'ยกเลิกการสมัครสมาชิก',
  'billing.checkout_completed': 'ชำระเงินสำเร็จ',
  'billing.invoice_paid': 'ใบแจ้งหนี้ชำระแล้ว',
  'billing.payment_failed': 'การชำระเงินล้มเหลว',
  'billing.plan_upgraded': 'อัพเกรดแพลน',
  'billing.plan_downgraded': 'ดาวน์เกรดแพลน',
  'job.created': 'สร้างงาน',
  'job.status_changed': 'เปลี่ยนสถานะงาน',
  'job.deleted': 'ลบงาน',
  'job.assigned': 'มอบหมายงาน',
  'job.exported': 'ส่งออกงาน',
  'settings.org_updated': 'อัพเดทข้อมูลองค์กร',
  'settings.logo_changed': 'เปลี่ยนโลโก้',
  'settings.workspace_updated': 'อัพเดท Workspace',
  'auth.login': 'เข้าสู่ระบบ',
  'auth.logout': 'ออกจากระบบ',
  'auth.password_changed': 'เปลี่ยนรหัสผ่าน',
  'auth.mfa_enabled': 'เปิดใช้ MFA',
  'auth.mfa_disabled': 'ปิดใช้ MFA',
  'storage.file_uploaded': 'อัพโหลดไฟล์',
  'storage.file_deleted': 'ลบไฟล์',
  'storage.quota_exceeded': 'เกินพื้นที่จัดเก็บ',
};

/** Map action to category */
export function getActionCategory(action: AuditAction): AuditCategory {
  const prefix = action.split('.')[0] as AuditCategory;
  return prefix;
}

/** Severity level for UI rendering */
export function getActionSeverity(action: AuditAction): 'info' | 'warning' | 'error' | 'success' {
  if (action.includes('failed') || action.includes('exceeded') || action.includes('deleted') || action.includes('removed')) {
    return 'error';
  }
  if (action.includes('downgraded') || action.includes('left') || action.includes('disabled')) {
    return 'warning';
  }
  if (action.includes('created') || action.includes('joined') || action.includes('paid') || action.includes('upgraded') || action.includes('enabled')) {
    return 'success';
  }
  return 'info';
}

// ============================================================================
// Client-Side Audit Helpers
// ============================================================================

/**
 * Record an audit log entry via Supabase.
 * Call this from client or Edge Functions after any auditable action.
 */
export async function recordAuditEntry(
  supabase: { from: (table: string) => { insert: (data: Record<string, unknown>) => Promise<{ error: unknown }> } },
  entry: CreateAuditEntry
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('audit_logs').insert({
    org_id: entry.orgId,
    action: entry.action,
    actor_type: entry.actorType,
    actor_id: entry.actorId,
    actor_name: entry.actorName || null,
    actor_email: entry.actorEmail || null,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    target_name: entry.targetName || null,
    metadata: entry.metadata || {},
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
  });

  if (error) {
    console.error('Failed to record audit entry:', error);
    return { success: false, error: String(error) };
  }

  return { success: true };
}

/**
 * Fetch audit log entries with filtering and pagination.
 */
export async function fetchAuditLog(
  supabase: {
    from: (table: string) => {
      select: (cols: string, opts?: { count: string }) => unknown;
    };
  },
  filters: AuditLogFilters
): Promise<AuditLogPage> {
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Build query (simplified — actual Supabase chain)
  let query = (supabase.from('audit_logs') as any)
    .select('*', { count: 'exact' })
    .eq('org_id', filters.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.category) {
    query = query.like('action', `${filters.category}.%`);
  }
  if (filters.action) {
    query = query.eq('action', filters.action);
  }
  if (filters.actorId) {
    query = query.eq('actor_id', filters.actorId);
  }
  if (filters.targetId) {
    query = query.eq('target_id', filters.targetId);
  }
  if (filters.fromDate) {
    query = query.gte('created_at', filters.fromDate);
  }
  if (filters.toDate) {
    query = query.lte('created_at', filters.toDate);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to fetch audit log:', error);
    return { entries: [], total: 0, hasMore: false };
  }

  const entries: AuditLogEntry[] = (data || []).map((row: any) => ({
    id: row.id,
    orgId: row.org_id,
    action: row.action,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));

  return {
    entries,
    total: count || 0,
    hasMore: (count || 0) > offset + limit,
  };
}

// ============================================================================
// Formatting Helpers for UI
// ============================================================================

/**
 * Format an audit entry into a human-readable description (Thai).
 */
export function formatAuditDescription(entry: AuditLogEntry): string {
  const actorName = entry.actorName || entry.actorId;
  const label = AUDIT_ACTION_LABELS[entry.action] || entry.action;
  const target = entry.targetName || entry.targetId || '';

  switch (entry.action) {
    case 'member.invited':
      return `${actorName} เชิญ ${target} เข้าร่วมองค์กร`;
    case 'member.joined':
      return `${target} เข้าร่วมองค์กร`;
    case 'member.role_changed':
      return `${actorName} เปลี่ยนบทบาทของ ${target} เป็น ${(entry.metadata as any)?.new_role || ''}`;
    case 'member.removed':
      return `${actorName} ลบ ${target} ออกจากองค์กร`;
    case 'billing.plan_upgraded':
      return `${actorName} อัพเกรดแพลนเป็น ${(entry.metadata as any)?.new_plan || ''}`;
    case 'billing.plan_downgraded':
      return `${actorName} ดาวน์เกรดแพลนเป็น ${(entry.metadata as any)?.new_plan || ''}`;
    case 'billing.payment_failed':
      return `การชำระเงินล้มเหลว — กรุณาตรวจสอบบัตรเครดิต`;
    case 'job.created':
      return `${actorName} สร้างงาน "${target}"`;
    case 'job.status_changed':
      return `${actorName} เปลี่ยนสถานะงาน "${target}" เป็น ${(entry.metadata as any)?.new_status || ''}`;
    case 'job.exported':
      return `${actorName} ส่งออกงาน "${target}"`;
    case 'settings.org_updated':
      return `${actorName} อัพเดทข้อมูลองค์กร`;
    case 'storage.file_uploaded':
      return `${actorName} อัพโหลดไฟล์ ${target}`;
    default:
      return `${actorName} ${label}${target ? ` — ${target}` : ''}`;
  }
}

/**
 * Get icon name for audit action (for UI rendering).
 */
export function getAuditIcon(action: AuditAction): string {
  const category = getActionCategory(action);
  switch (category) {
    case 'member': return 'users';
    case 'billing': return 'credit-card';
    case 'job': return 'briefcase';
    case 'settings': return 'settings';
    case 'auth': return 'shield';
    case 'storage': return 'hard-drive';
    default: return 'activity';
  }
}

// ============================================================================
// Migration SQL
// ============================================================================

/**
 * Generate the audit_logs table migration.
 */
export function generateAuditLogMigration(): string {
  return `
-- Audit Log table for org-level action tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'api')),
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  actor_email TEXT,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_id);

-- RLS: org members can only read their own org's audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('OWNER', 'ADMIN')
    )
  );

-- Only service role (Edge Functions) can insert
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- Retention: auto-delete entries older than 90 days for FREE plan
-- (implement via pg_cron or Supabase scheduled function)
  `.trim();
}

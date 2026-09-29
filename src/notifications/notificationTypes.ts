/**
 * notifications/notificationTypes.ts — Notification system types & constants
 *
 * Tenant-scoped notification system with:
 * - In-app real-time notifications
 * - Email digest preferences
 * - Category-based filtering
 */

// ============================================================================
// Types
// ============================================================================

export type NotificationCategory =
  | 'job_status'    // Job created, status changed, completed
  | 'billing'      // Invoice, payment, plan change
  | 'team'         // Member joined, invited, role changed
  | 'system'       // Maintenance, updates, announcements
  | 'usage'        // Limit approaching, limit reached
  | 'export';      // Export ready, DXF generated

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type DigestFrequency = 'immediate' | 'daily' | 'weekly' | 'none';

export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  /** Optional link to navigate to */
  actionUrl?: string;
  /** Optional action label */
  actionLabel?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  orgId: string;
  /** Per-category email digest frequency */
  emailDigest: Record<NotificationCategory, DigestFrequency>;
  /** In-app push enabled per category */
  inAppEnabled: Record<NotificationCategory, boolean>;
  /** Global mute (snooze all notifications) */
  globalMute: boolean;
  /** Mute until timestamp (temporary snooze) */
  muteUntil?: string;
  /** Quiet hours (no push during these times) */
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string;   // HH:mm
}

// ============================================================================
// Constants
// ============================================================================

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  job_status: '📋 สถานะงาน',
  billing: '💳 การเงิน',
  team: '👥 ทีมงาน',
  system: '🔧 ระบบ',
  usage: '📊 การใช้งาน',
  export: '📦 ส่งออก',
};

export const NOTIFICATION_CATEGORY_LABELS_EN: Record<NotificationCategory, string> = {
  job_status: 'Job Status',
  billing: 'Billing',
  team: 'Team',
  system: 'System',
  usage: 'Usage',
  export: 'Exports',
};

export const DIGEST_FREQUENCY_LABELS: Record<DigestFrequency, string> = {
  immediate: 'ทันที',
  daily: 'สรุปรายวัน',
  weekly: 'สรุปรายสัปดาห์',
  none: 'ปิด',
};

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'orgId'> = {
  emailDigest: {
    job_status: 'immediate',
    billing: 'immediate',
    team: 'daily',
    system: 'weekly',
    usage: 'immediate',
    export: 'none',
  },
  inAppEnabled: {
    job_status: true,
    billing: true,
    team: true,
    system: true,
    usage: true,
    export: true,
  },
  globalMute: false,
};

export const PRIORITY_CONFIG: Record<NotificationPriority, { color: string; icon: string }> = {
  low: { color: '#6b7280', icon: '○' },
  normal: { color: '#3b82f6', icon: '●' },
  high: { color: '#f59e0b', icon: '⚠️' },
  urgent: { color: '#ef4444', icon: '🚨' },
};

// ============================================================================
// Helpers
// ============================================================================

export function createNotification(
  params: Omit<Notification, 'id' | 'isRead' | 'createdAt'>
): Notification {
  return {
    ...params,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

export function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH');
}

export function shouldSendEmail(
  prefs: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  if (prefs.globalMute) return false;
  if (prefs.muteUntil && new Date(prefs.muteUntil) > new Date()) return false;
  return prefs.emailDigest[category] !== 'none';
}

export function isInQuietHours(prefs: NotificationPreferences): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const { quietHoursStart, quietHoursEnd } = prefs;

  if (quietHoursStart <= quietHoursEnd) {
    return currentTime >= quietHoursStart && currentTime <= quietHoursEnd;
  }
  // Overnight quiet hours (e.g., 22:00 - 07:00)
  return currentTime >= quietHoursStart || currentTime <= quietHoursEnd;
}

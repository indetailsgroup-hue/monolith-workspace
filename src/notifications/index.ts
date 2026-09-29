/**
 * notifications/index.ts — Barrel exports for Notification module
 */

export { NotificationCenter, NotificationBell, NotificationPanel } from './NotificationCenter';
export { NotificationPreferencesPage } from './NotificationPreferencesPage';
export { useNotificationStore } from './notificationStore';
export { useNotificationRealtime } from './useNotificationRealtime';
export {
  createNotification,
  getTimeAgo,
  shouldSendEmail,
  isInQuietHours,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_LABELS_EN,
  DIGEST_FREQUENCY_LABELS,
  DEFAULT_PREFERENCES,
  PRIORITY_CONFIG,
} from './notificationTypes';
export type {
  Notification,
  NotificationPreferences,
  NotificationCategory,
  NotificationPriority,
  DigestFrequency,
} from './notificationTypes';

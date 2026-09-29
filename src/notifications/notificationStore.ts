/**
 * notifications/notificationStore.ts — Zustand store for notification state
 *
 * Manages:
 * - Notification list (tenant-scoped)
 * - Unread count
 * - Preferences
 * - Real-time subscription management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Notification,
  NotificationPreferences,
  NotificationCategory,
  DigestFrequency,
} from './notificationTypes';
import { DEFAULT_PREFERENCES, createNotification } from './notificationTypes';

// ============================================================================
// Store Interface
// ============================================================================

interface NotificationState {
  /** All notifications for current user/org */
  notifications: Notification[];
  /** User preferences */
  preferences: NotificationPreferences | null;
  /** Whether the notification panel is open */
  isPanelOpen: boolean;
  /** Loading state */
  loading: boolean;
  /** Filter category */
  filterCategory: NotificationCategory | 'all';

  // Computed
  unreadCount: () => number;

  // Actions
  addNotification: (notif: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  markAsRead: (notifId: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (notifId: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  setFilterCategory: (cat: NotificationCategory | 'all') => void;
  setPreferences: (prefs: NotificationPreferences) => void;
  updateDigestFrequency: (category: NotificationCategory, frequency: DigestFrequency) => void;
  toggleInApp: (category: NotificationCategory) => void;
  toggleGlobalMute: () => void;
  setMuteUntil: (until: string | undefined) => void;
  loadNotifications: (notifications: Notification[]) => void;
  initPreferences: (userId: string, orgId: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      preferences: null,
      isPanelOpen: false,
      loading: false,
      filterCategory: 'all',

      unreadCount: () => get().notifications.filter(n => !n.isRead).length,

      addNotification: (params) => {
        const notif = createNotification(params);
        set(state => ({
          notifications: [notif, ...state.notifications].slice(0, 200), // Keep max 200
        }));
      },

      markAsRead: (notifId) => {
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === notifId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
          ),
        }));
      },

      markAllAsRead: () => {
        const now = new Date().toISOString();
        set(state => ({
          notifications: state.notifications.map(n =>
            n.isRead ? n : { ...n, isRead: true, readAt: now }
          ),
        }));
      },

      deleteNotification: (notifId) => {
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== notifId),
        }));
      },

      clearAll: () => set({ notifications: [] }),

      togglePanel: () => set(state => ({ isPanelOpen: !state.isPanelOpen })),

      setFilterCategory: (cat) => set({ filterCategory: cat }),

      setPreferences: (prefs) => set({ preferences: prefs }),

      updateDigestFrequency: (category, frequency) => {
        set(state => {
          if (!state.preferences) return state;
          return {
            preferences: {
              ...state.preferences,
              emailDigest: { ...state.preferences.emailDigest, [category]: frequency },
            },
          };
        });
      },

      toggleInApp: (category) => {
        set(state => {
          if (!state.preferences) return state;
          return {
            preferences: {
              ...state.preferences,
              inAppEnabled: {
                ...state.preferences.inAppEnabled,
                [category]: !state.preferences.inAppEnabled[category],
              },
            },
          };
        });
      },

      toggleGlobalMute: () => {
        set(state => {
          if (!state.preferences) return state;
          return {
            preferences: { ...state.preferences, globalMute: !state.preferences.globalMute },
          };
        });
      },

      setMuteUntil: (until) => {
        set(state => {
          if (!state.preferences) return state;
          return { preferences: { ...state.preferences, muteUntil: until } };
        });
      },

      loadNotifications: (notifications) => set({ notifications, loading: false }),

      initPreferences: (userId, orgId) => {
        const existing = get().preferences;
        if (!existing || existing.userId !== userId || existing.orgId !== orgId) {
          set({
            preferences: { ...DEFAULT_PREFERENCES, userId, orgId },
          });
        }
      },
    }),
    {
      name: 'monolith-notifications',
      partialize: (state) => ({
        preferences: state.preferences,
        // Don't persist notifications — they come from server
      }),
    }
  )
);

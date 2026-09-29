/**
 * notifications/useNotificationRealtime.ts — Supabase Realtime hook for notifications
 *
 * Subscribes to INSERT events on the notifications table filtered by org_id + user_id.
 * Automatically adds new notifications to the store.
 */

import { useEffect, useRef } from 'react';
import { useNotificationStore } from './notificationStore';
import type { Notification, NotificationCategory, NotificationPriority } from './notificationTypes';

// ============================================================================
// Types
// ============================================================================

interface RealtimePayload {
  new: {
    id: string;
    org_id: string;
    user_id: string;
    category: NotificationCategory;
    priority: NotificationPriority;
    title: string;
    body: string;
    action_url?: string;
    action_label?: string;
    metadata?: Record<string, unknown>;
    is_read: boolean;
    created_at: string;
  };
}

interface UseNotificationRealtimeOptions {
  orgId: string;
  userId: string;
  /** Supabase client instance */
  supabaseClient?: {
    channel: (name: string) => {
      on: (event: string, filter: Record<string, string>, callback: (payload: RealtimePayload) => void) => any;
      subscribe: () => any;
      unsubscribe: () => void;
    };
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useNotificationRealtime({ orgId, userId, supabaseClient }: UseNotificationRealtimeOptions) {
  const { addNotification, preferences } = useNotificationStore();
  const channelRef = useRef<ReturnType<typeof supabaseClient extends { channel: infer C } ? C : never> | null>(null);

  useEffect(() => {
    if (!supabaseClient || !orgId || !userId) return;

    const channel = supabaseClient.channel(`notifications:${orgId}:${userId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `org_id=eq.${orgId}`,
        },
        (payload: RealtimePayload) => {
          const row = payload.new;
          // Only process if targeted to this user or broadcast
          if (row.user_id !== userId && row.user_id !== '*') return;

          // Check if category is muted
          if (preferences?.inAppEnabled[row.category] === false) return;
          if (preferences?.globalMute) return;

          addNotification({
            orgId: row.org_id,
            userId: row.user_id,
            category: row.category,
            priority: row.priority,
            title: row.title,
            body: row.body,
            actionUrl: row.action_url,
            actionLabel: row.action_label,
            metadata: row.metadata,
          });

          // Browser notification for high/urgent
          if ((row.priority === 'high' || row.priority === 'urgent') && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification(row.title, { body: row.body, icon: '/monolith-icon.png' });
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel as any;

    return () => {
      channel.unsubscribe();
    };
  }, [orgId, userId, supabaseClient, addNotification, preferences]);
}

export default useNotificationRealtime;

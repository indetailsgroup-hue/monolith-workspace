/**
 * notifications/NotificationCenter.tsx — In-App Notification UI
 *
 * Features:
 * - Bell icon with unread badge
 * - Dropdown panel with notification list
 * - Category-based filtering
 * - Mark as read / mark all as read
 * - Navigate to action URL
 * - Priority-based styling
 * - Thai locale time display
 */

import React, { useMemo, useCallback } from 'react';
import { useNotificationStore } from './notificationStore';
import type { NotificationCategory } from './notificationTypes';
import {
  NOTIFICATION_CATEGORY_LABELS,
  PRIORITY_CONFIG,
  getTimeAgo,
} from './notificationTypes';

// ============================================================================
// Bell Icon with Badge
// ============================================================================

export function NotificationBell() {
  const { isPanelOpen, togglePanel } = useNotificationStore();
  const unreadCount = useNotificationStore(s => s.unreadCount());

  return (
    <button
      className="notif-bell"
      onClick={togglePanel}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      data-testid="notification-bell"
    >
      <span className="notif-bell-icon">{isPanelOpen ? '🔔' : '🔕'}</span>
      {unreadCount > 0 && (
        <span className="notif-badge" data-testid="unread-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Notification Panel (Dropdown)
// ============================================================================

export function NotificationPanel() {
  const {
    notifications,
    isPanelOpen,
    filterCategory,
    setFilterCategory,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    togglePanel,
  } = useNotificationStore();
  const unreadCount = useNotificationStore(s => s.unreadCount());

  const filtered = useMemo(() => {
    if (filterCategory === 'all') return notifications;
    return notifications.filter(n => n.category === filterCategory);
  }, [notifications, filterCategory]);

  const handleNotifClick = useCallback((notifId: string, actionUrl?: string) => {
    markAsRead(notifId);
    if (actionUrl) {
      window.location.href = actionUrl;
    }
  }, [markAsRead]);

  if (!isPanelOpen) return null;

  return (
    <div className="notif-panel" data-testid="notification-panel">
      {/* Panel Header */}
      <div className="notif-panel-header">
        <h3>🔔 การแจ้งเตือน</h3>
        <div className="notif-panel-actions">
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="notif-mark-all">
              อ่านทั้งหมด
            </button>
          )}
          <button onClick={togglePanel} className="notif-close">✕</button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="notif-filter-bar">
        <button
          className={`notif-filter-btn ${filterCategory === 'all' ? 'active' : ''}`}
          onClick={() => setFilterCategory('all')}
        >
          ทั้งหมด
        </button>
        {(Object.entries(NOTIFICATION_CATEGORY_LABELS) as [NotificationCategory, string][]).map(
          ([cat, label]) => (
            <button
              key={cat}
              className={`notif-filter-btn ${filterCategory === cat ? 'active' : ''}`}
              onClick={() => setFilterCategory(cat)}
            >
              {label.split(' ')[0]}
            </button>
          )
        )}
      </div>

      {/* Notification List */}
      <div className="notif-list">
        {filtered.length === 0 ? (
          <div className="notif-empty">
            <span>📭</span>
            <p>ไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          filtered.map(notif => (
            <div
              key={notif.id}
              className={`notif-item ${notif.isRead ? 'read' : 'unread'} notif-priority-${notif.priority}`}
              onClick={() => handleNotifClick(notif.id, notif.actionUrl)}
              data-testid={`notif-item-${notif.id}`}
            >
              <div className="notif-item-left">
                <span className="notif-priority-dot" style={{ color: PRIORITY_CONFIG[notif.priority].color }}>
                  {PRIORITY_CONFIG[notif.priority].icon}
                </span>
              </div>
              <div className="notif-item-content">
                <div className="notif-item-title">{notif.title}</div>
                <div className="notif-item-body">{notif.body}</div>
                <div className="notif-item-meta">
                  <span className="notif-item-category">
                    {NOTIFICATION_CATEGORY_LABELS[notif.category]}
                  </span>
                  <span className="notif-item-time">{getTimeAgo(notif.createdAt)}</span>
                </div>
              </div>
              <button
                className="notif-item-delete"
                onClick={e => { e.stopPropagation(); deleteNotification(notif.id); }}
                title="ลบ"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="notif-panel-footer">
        <a href="/settings/notifications" className="notif-settings-link">
          ⚙️ ตั้งค่าการแจ้งเตือน
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Combined: Bell + Panel
// ============================================================================

export function NotificationCenter() {
  return (
    <div className="notif-center" data-testid="notification-center">
      <NotificationBell />
      <NotificationPanel />
    </div>
  );
}

export default NotificationCenter;

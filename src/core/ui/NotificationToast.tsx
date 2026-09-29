/**
 * core/ui/NotificationToast.tsx — Toast notification system for real-time events
 *
 * Features:
 * - Queue-based — multiple toasts stack from top-right
 * - Auto-dismiss with configurable duration
 * - Manual dismiss on click
 * - Color-coded by type: success, info, warning, error
 * - Animated slide-in
 * - Used with useJobStatusToast for job lifecycle notifications
 *
 * @version 15.3.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  createdAt: number;
  duration: number; // ms, 0 = no auto-dismiss
}

export interface ToastConfig {
  message: string;
  title?: string;
  type?: ToastType;
  duration?: number;
}

export interface UseToastReturn {
  toasts: Toast[];
  addToast: (config: ToastConfig) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

// ============================================================================
// Toast Hook
// ============================================================================

let toastCounter = 0;

export function useToast(maxToasts: number = 5): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (config: ToastConfig): string => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      const duration = config.duration ?? 5000;

      const toast: Toast = {
        id,
        message: config.message,
        title: config.title,
        type: config.type ?? 'info',
        createdAt: Date.now(),
        duration,
      };

      setToasts((prev) => {
        const next = [toast, ...prev];
        // Remove oldest if over limit
        if (next.length > maxToasts) {
          const removed = next.pop();
          if (removed) {
            const timer = timersRef.current.get(removed.id);
            if (timer) clearTimeout(timer);
            timersRef.current.delete(removed.id);
          }
        }
        return next;
      });

      // Auto-dismiss
      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [maxToasts, removeToast],
  );

  const clearAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { toasts, addToast, removeToast, clearAll };
}

// ============================================================================
// Toast Colors
// ============================================================================

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#064e3b', border: '#059669', text: '#a7f3d0', icon: '✓' },
  info: { bg: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe', icon: 'ℹ' },
  warning: { bg: '#451a03', border: '#d97706', text: '#fde68a', icon: '⚠' },
  error: { bg: '#450a0a', border: '#dc2626', text: '#fecaca', icon: '✕' },
};

// ============================================================================
// Toast Container Component
// ============================================================================

export interface NotificationToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function NotificationToastContainer({
  toasts,
  onDismiss,
  position = 'top-right',
}: NotificationToastContainerProps): React.ReactElement | null {
  if (toasts.length === 0) return null;

  const positionStyles: React.CSSProperties = {
    'top-right': { top: '16px', right: '16px' },
    'top-left': { top: '16px', left: '16px' },
    'bottom-right': { bottom: '16px', right: '16px' },
    'bottom-left': { bottom: '16px', left: '16px' },
  }[position] as React.CSSProperties;

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '360px',
        width: '100%',
        pointerEvents: 'none',
      }}
      data-testid="toast-container"
      data-print="hide"
    >
      {toasts.map((toast) => {
        const colors = TOAST_COLORS[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              padding: '12px 16px',
              color: colors.text,
              fontSize: '13px',
              cursor: 'pointer',
              pointerEvents: 'all',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              animation: 'slideInRight 0.3s ease-out',
            }}
            onClick={() => onDismiss(toast.id)}
            data-testid={`toast-${toast.id}`}
            role="alert"
          >
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{colors.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {toast.title && (
                <div style={{ fontWeight: 600, marginBottom: '2px', fontSize: '12px' }}>
                  {toast.title}
                </div>
              )}
              <div style={{ lineHeight: 1.4 }}>{toast.message}</div>
            </div>
            <span style={{ fontSize: '14px', opacity: 0.6, flexShrink: 0 }}>×</span>
          </div>
        );
      })}
    </div>
  );
}

export default NotificationToastContainer;

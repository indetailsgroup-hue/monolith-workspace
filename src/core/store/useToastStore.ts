/**
 * useToastStore - Simple toast notification system
 *
 * T014: Provides visual feedback for keyboard shortcuts
 *
 * @version 1.0.0
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];

  /** Show a toast notification */
  showToast: (message: string, type?: ToastType, duration?: number) => void;

  /** Remove a toast by id */
  removeToast: (id: string) => void;

  /** Clear all toasts */
  clearAll: () => void;
}

// ============================================================================
// Store
// ============================================================================

let toastCounter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: (message, type = 'info', duration = 2000) => {
    const id = `toast-${++toastCounter}`;
    const toast: Toast = {
      id,
      message,
      type,
      duration,
      createdAt: Date.now(),
    };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    // Auto-remove after duration
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// ============================================================================
// Convenience functions
// ============================================================================

/** Quick toast for keyboard shortcuts */
export function toastShortcut(shortcut: string, action: string) {
  useToastStore.getState().showToast(`${shortcut} → ${action}`, 'info', 1500);
}

/** Success toast */
export function toastSuccess(message: string) {
  useToastStore.getState().showToast(message, 'success', 2000);
}

/** Warning toast */
export function toastWarning(message: string) {
  useToastStore.getState().showToast(message, 'warning', 3000);
}

/** Error toast */
export function toastError(message: string) {
  useToastStore.getState().showToast(message, 'error', 4000);
}

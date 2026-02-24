/**
 * ToastContainer - Renders toast notifications
 *
 * T014: Visual feedback for keyboard shortcuts
 *
 * @version 1.0.0
 */

import React from 'react';
import { useToastStore, Toast, ToastType } from '../../core/store/useToastStore';
import { motion, AnimatePresence } from 'motion/react';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

// ============================================================================
// Toast Icon & Colors by Type
// ============================================================================

const TOAST_CONFIG: Record<
  ToastType,
  { icon: React.ReactNode; bg: string; border: string; text: string }
> = {
  info: {
    icon: <Info size={16} />,
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#93c5fd',
  },
  success: {
    icon: <CheckCircle size={16} />,
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.3)',
    text: '#86efac',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#fcd34d',
  },
  error: {
    icon: <XCircle size={16} />,
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#fca5a5',
  },
};

// ============================================================================
// Single Toast Item
// ============================================================================

interface ToastItemProps {
  toast: Toast;
  onRemove: () => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const config = TOAST_CONFIG[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        color: config.text,
        fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(8px)',
        maxWidth: '300px',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ flexShrink: 0, opacity: 0.9 }}>{config.icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: 'inherit',
          opacity: 0.6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ============================================================================
// Container
// ============================================================================

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onRemove={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ToastContainer;

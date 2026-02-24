/**
 * ConfirmationDialog.tsx - Reusable Confirmation Modal
 *
 * A modal dialog for confirming destructive or important actions.
 * Supports different intent types (danger, warning, info).
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { colors } from '../../core/theme/colors';

// ============================================================================
// Types
// ============================================================================

export type DialogIntent = 'danger' | 'warning' | 'info' | 'default';

export interface ConfirmationDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Called when user confirms the action */
  onConfirm: () => void;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: React.ReactNode;
  /** Confirm button text */
  confirmLabel?: string;
  /** Cancel button text */
  cancelLabel?: string;
  /** Intent determines button colors */
  intent?: DialogIntent;
  /** Whether confirm action is in progress */
  loading?: boolean;
  /** Disable confirm button */
  confirmDisabled?: boolean;
  /** Optional icon to show in header */
  icon?: React.ReactNode;
}

// ============================================================================
// Intent Colors
// ============================================================================

const intentColors: Record<DialogIntent, { bg: string; hover: string; text: string }> = {
  danger: {
    bg: colors.error.base,
    hover: '#dc2626',
    text: '#ffffff',
  },
  warning: {
    bg: colors.warning.base,
    hover: '#d97706',
    text: '#000000',
  },
  info: {
    bg: colors.info.base,
    hover: '#2563eb',
    text: '#ffffff',
  },
  default: {
    bg: colors.accent.purple,
    hover: colors.accent.purpleHover,
    text: '#ffffff',
  },
};

// ============================================================================
// Component
// ============================================================================

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  intent = 'default',
  loading = false,
  confirmDisabled = false,
  icon,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, loading, onClose]);

  // Focus confirm button when opened
  useEffect(() => {
    if (open && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [open]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !loading) {
        onClose();
      }
    },
    [loading, onClose]
  );

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!loading && !confirmDisabled) {
      onConfirm();
    }
  }, [loading, confirmDisabled, onConfirm]);

  if (!open) return null;

  const intentStyle = intentColors[intent];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        ref={dialogRef}
        style={{
          backgroundColor: colors.bg.secondary,
          borderRadius: 12,
          border: `1px solid ${colors.border.default}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth: 420,
          margin: 16,
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${colors.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {icon && (
            <span
              style={{
                fontSize: 24,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {icon}
            </span>
          )}
          <h2
            id="dialog-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: colors.text.primary,
            }}
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div
          style={{
            padding: 20,
            fontSize: 14,
            lineHeight: 1.6,
            color: colors.text.secondary,
          }}
        >
          {message}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          {/* Cancel Button */}
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              backgroundColor: 'transparent',
              color: colors.text.secondary,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = colors.bg.hover;
                e.currentTarget.style.color = colors.text.primary;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = colors.text.secondary;
            }}
          >
            {cancelLabel}
          </button>

          {/* Confirm Button */}
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              backgroundColor: intentStyle.bg,
              color: intentStyle.text,
              cursor: loading || confirmDisabled ? 'not-allowed' : 'pointer',
              opacity: loading || confirmDisabled ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!loading && !confirmDisabled) {
                e.currentTarget.style.backgroundColor = intentStyle.hover;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = intentStyle.bg;
            }}
          >
            {loading && (
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid transparent',
                  borderTopColor: intentStyle.text,
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }}
              />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>

      {/* Keyframe animations via style tag */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Delete Confirmation Preset
// ============================================================================

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName?: string;
  loading?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onClose,
  onConfirm,
  itemName = 'this item',
  loading,
}: DeleteConfirmationDialogProps) {
  return (
    <ConfirmationDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete Confirmation"
      message={
        <>
          Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
        </>
      }
      confirmLabel="Delete"
      intent="danger"
      icon="🗑️"
      loading={loading}
    />
  );
}

// ============================================================================
// Unsaved Changes Confirmation Preset
// ============================================================================

export interface UnsavedChangesDialogProps {
  open: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave?: () => void;
}

export function UnsavedChangesDialog({
  open,
  onClose,
  onDiscard,
  onSave,
}: UnsavedChangesDialogProps) {
  return (
    <ConfirmationDialog
      open={open}
      onClose={onClose}
      onConfirm={onDiscard}
      title="Unsaved Changes"
      message="You have unsaved changes. Do you want to discard them?"
      confirmLabel="Discard"
      cancelLabel={onSave ? 'Save' : 'Cancel'}
      intent="warning"
      icon="⚠️"
    />
  );
}

export default ConfirmationDialog;

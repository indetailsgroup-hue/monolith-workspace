/**
 * RoleGateDialog - Modal dialog for role-restricted access notification
 * Priority 4B: Deep-link hardening + role UX
 *
 * Shows friendly notification when user without access tries to navigate
 * to a role-restricted route, instead of silently blocking.
 *
 * @version 0.12.3
 */

import React, { useEffect, useCallback } from 'react';
import { Role, ROLE_INFO, getCurrentRole } from '../../core/auth/roles';

export interface RoleGateDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Close the dialog */
  onClose: () => void;
  /** Roles that can access the restricted content */
  requiredRoles: Role[];
  /** Title for the dialog */
  title?: string;
  /** Description of what the user was trying to access */
  description?: string;
  /** Optional URL to copy/share */
  shareableUrl?: string;
}

export function RoleGateDialog({
  isOpen,
  onClose,
  requiredRoles,
  title = 'Access Restricted',
  description = 'This area requires specific role permissions.',
  shareableUrl,
}: RoleGateDialogProps): React.ReactElement | null {
  const currentRole = getCurrentRole();
  const currentRoleInfo = ROLE_INFO[currentRole];

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Copy link to clipboard
  const handleCopyLink = async () => {
    if (shareableUrl) {
      try {
        await navigator.clipboard.writeText(shareableUrl);
        // Could add a toast notification here
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: '16px',
          border: '1px solid #3a3a5a',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: '24px',
        }}>
          🔒
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#f5f5f5',
          textAlign: 'center',
          marginBottom: '8px',
        }}>
          {title}
        </h2>

        {/* Description */}
        <p style={{
          fontSize: '14px',
          color: '#9ca3af',
          textAlign: 'center',
          marginBottom: '20px',
          lineHeight: 1.5,
        }}>
          {description}
        </p>

        {/* Current Role Badge */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#6b7280',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Your current role
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              padding: '4px 10px',
              background: `${currentRoleInfo.color}20`,
              border: `1px solid ${currentRoleInfo.color}40`,
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: currentRoleInfo.color,
            }}>
              {currentRoleInfo.label}
            </span>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {currentRoleInfo.description}
            </span>
          </div>
        </div>

        {/* Required Roles */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '20px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#6b7280',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Required role(s)
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            {requiredRoles.map((role) => {
              const info = ROLE_INFO[role];
              return (
                <span
                  key={role}
                  style={{
                    padding: '4px 10px',
                    background: `${info.color}20`,
                    border: `1px solid ${info.color}40`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: info.color,
                  }}
                >
                  {info.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Copy Link Button (if shareable URL provided) */}
        {shareableUrl && (
          <button
            onClick={handleCopyLink}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              color: '#93c5fd',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            <span>📋</span>
            Copy Link to Share with Team
          </button>
        )}

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            background: '#374151',
            border: 'none',
            borderRadius: '10px',
            color: '#d1d5db',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Close
        </button>

        {/* Help Text */}
        <p style={{
          fontSize: '11px',
          color: '#6b7280',
          textAlign: 'center',
          marginTop: '16px',
        }}>
          Contact your administrator for role assignment
        </p>
      </div>
    </div>
  );
}

export default RoleGateDialog;

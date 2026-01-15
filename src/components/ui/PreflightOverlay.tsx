/**
 * Preflight Overlay - Visual Validation Feedback
 *
 * Shows validation errors/warnings as:
 * - Red/amber highlights on affected geometry
 * - Inline error messages near the problem
 * - Summary panel with all issues
 *
 * v1.0: Initial preflight overlay
 */

import React from 'react';
import type { PreflightResult, ValidationError, ValidationSeverity } from '@/core/modeling/preflight';
import { getSeverityColor, getSeverityIcon } from '@/core/modeling/preflight';

interface PreflightOverlayProps {
  result: PreflightResult | null;
  /** Callback when user clicks "Fix" on an error */
  onFix?: (error: ValidationError) => void;
  /** Callback when user dismisses a warning */
  onDismiss?: (error: ValidationError) => void;
  /** Position: 'top-right' | 'bottom-right' */
  position?: 'top-right' | 'bottom-right';
  /** Compact mode (just badge) */
  compact?: boolean;
}

export function PreflightOverlay({
  result,
  onFix,
  onDismiss,
  position = 'bottom-right',
  compact = false,
}: PreflightOverlayProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (!result) return null;

  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const totalIssues = result.errors.length + result.warnings.length;

  if (totalIssues === 0) {
    // Show success badge
    return (
      <div
        style={{
          position: 'fixed',
          ...(position === 'top-right' ? { top: 16, right: 16 } : { bottom: 80, right: 16 }),
          zIndex: 100,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 8,
            color: '#22c55e',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>✓</span>
          <span>Preflight OK</span>
        </div>
      </div>
    );
  }

  // Compact badge mode
  if (compact && !expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          ...(position === 'top-right' ? { top: 16, right: 16 } : { bottom: 80, right: 16 }),
          zIndex: 100,
        }}
      >
        <button
          onClick={() => setExpanded(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: hasErrors ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            border: `1px solid ${hasErrors ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
            borderRadius: 8,
            color: hasErrors ? '#ef4444' : '#f59e0b',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span>{hasErrors ? '✗' : '⚠'}</span>
          <span>
            {result.errors.length > 0 && `${result.errors.length} Error${result.errors.length > 1 ? 's' : ''}`}
            {result.errors.length > 0 && result.warnings.length > 0 && ' • '}
            {result.warnings.length > 0 && `${result.warnings.length} Warning${result.warnings.length > 1 ? 's' : ''}`}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        ...(position === 'top-right' ? { top: 16, right: 16 } : { bottom: 80, right: 16 }),
        width: 360,
        maxHeight: '60vh',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #3a3a5a',
          backgroundColor: hasErrors ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{hasErrors ? '✗' : '⚠'}</span>
          <div>
            <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>Preflight Check</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {result.errors.length} error{result.errors.length !== 1 ? 's' : ''},{' '}
              {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Issues List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Errors */}
        {result.errors.length > 0 && (
          <div>
            <div
              style={{
                padding: '8px 16px',
                fontSize: 10,
                fontWeight: 600,
                color: '#ef4444',
                textTransform: 'uppercase',
                letterSpacing: 1,
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
              }}
            >
              Errors (Must Fix)
            </div>
            {result.errors.map((error) => (
              <ValidationErrorItem
                key={error.id}
                error={error}
                onFix={onFix}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div>
            <div
              style={{
                padding: '8px 16px',
                fontSize: 10,
                fontWeight: 600,
                color: '#f59e0b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
              }}
            >
              Warnings
            </div>
            {result.warnings.map((error) => (
              <ValidationErrorItem
                key={error.id}
                error={error}
                onFix={onFix}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        )}

        {/* Info */}
        {result.info.length > 0 && (
          <div>
            <div
              style={{
                padding: '8px 16px',
                fontSize: 10,
                fontWeight: 600,
                color: '#3b82f6',
                textTransform: 'uppercase',
                letterSpacing: 1,
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
              }}
            >
              Info
            </div>
            {result.info.map((error) => (
              <ValidationErrorItem
                key={error.id}
                error={error}
                onFix={onFix}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid #3a3a5a',
          fontSize: 11,
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        {hasErrors
          ? 'Fix all errors before committing'
          : 'Warnings can be ignored if intentional'}
      </div>
    </div>
  );
}

// ============================================================================
// Individual Error Item
// ============================================================================

interface ValidationErrorItemProps {
  error: ValidationError;
  onFix?: (error: ValidationError) => void;
  onDismiss?: (error: ValidationError) => void;
}

function ValidationErrorItem({ error, onFix, onDismiss }: ValidationErrorItemProps) {
  const color = getSeverityColor(error.severity);
  const icon = getSeverityIcon(error.severity);

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #2a2a4a',
        display: 'flex',
        gap: 12,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${color}20`,
          borderRadius: 6,
          color,
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: '#fff',
            marginBottom: 4,
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </div>

        <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
          {error.code}
        </div>

        {/* Suggested fix */}
        {error.suggestedValue !== undefined && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              Suggested: {error.suggestedValue}mm
            </span>
            {onFix && (
              <button
                onClick={() => onFix(error)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: `${color}20`,
                  border: `1px solid ${color}40`,
                  borderRadius: 4,
                  color,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Apply Fix
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dismiss for warnings */}
      {error.severity === 'warning' && onDismiss && (
        <button
          onClick={() => onDismiss(error)}
          style={{
            padding: '4px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 14,
            flexShrink: 0,
          }}
          title="Dismiss warning"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Inline Error Tooltip (for 3D viewport)
// ============================================================================

interface InlineErrorTooltipProps {
  error: ValidationError;
  /** Screen position */
  position: { x: number; y: number };
  /** Callback on click */
  onClick?: () => void;
}

export function InlineErrorTooltip({ error, position, onClick }: InlineErrorTooltipProps) {
  const color = getSeverityColor(error.severity);
  const icon = getSeverityIcon(error.severity);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)',
        padding: '6px 10px',
        backgroundColor: '#1a1a2e',
        border: `1px solid ${color}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: onClick ? 'pointer' : 'default',
        zIndex: 200,
        maxWidth: 240,
        boxShadow: `0 4px 12px ${color}40`,
      }}
    >
      <span style={{ color, fontWeight: 600 }}>{icon}</span>
      <span style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {error.message}
      </span>
      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `6px solid ${color}`,
        }}
      />
    </div>
  );
}

export default PreflightOverlay;

/**
 * StatusPill.tsx - Reusable Status Indicator Component
 *
 * A pill-shaped badge for displaying status with semantic colors.
 * Supports various sizes and status types.
 */

import React from 'react';
import { colors, getStatusColors, StatusType } from '../../core/theme/colors';

// ============================================================================
// Types
// ============================================================================

export type PillSize = 'sm' | 'md' | 'lg';
export type PillVariant = 'solid' | 'outline' | 'subtle';

export interface StatusPillProps {
  /** Status type determines the color scheme */
  status: StatusType;
  /** Text to display inside the pill */
  children: React.ReactNode;
  /** Size of the pill */
  size?: PillSize;
  /** Visual variant */
  variant?: PillVariant;
  /** Optional icon to show before text */
  icon?: React.ReactNode;
  /** Show animated pulse indicator */
  pulse?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

// ============================================================================
// Size Configurations
// ============================================================================

const sizeStyles: Record<PillSize, React.CSSProperties> = {
  sm: {
    padding: '2px 8px',
    fontSize: 10,
    borderRadius: 4,
    gap: 4,
  },
  md: {
    padding: '4px 12px',
    fontSize: 12,
    borderRadius: 6,
    gap: 6,
  },
  lg: {
    padding: '6px 16px',
    fontSize: 14,
    borderRadius: 8,
    gap: 8,
  },
};

// ============================================================================
// Component
// ============================================================================

export function StatusPill({
  status,
  children,
  size = 'md',
  variant = 'solid',
  icon,
  pulse = false,
  className,
  style,
}: StatusPillProps) {
  const statusColors = getStatusColors(status);
  const sizeConfig = sizeStyles[size];

  // Build styles based on variant
  const variantStyles: React.CSSProperties = (() => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: statusColors.base,
          color: status === 'neutral' ? colors.text.primary : colors.text.inverse,
          border: 'none',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: statusColors.text,
          border: `1px solid ${statusColors.border}`,
        };
      case 'subtle':
      default:
        return {
          backgroundColor: statusColors.bg,
          color: statusColors.text,
          border: `1px solid ${statusColors.border}`,
        };
    }
  })();

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
        whiteSpace: 'nowrap',
        ...sizeConfig,
        ...variantStyles,
        ...style,
      }}
    >
      {pulse && (
        <span
          style={{
            width: size === 'sm' ? 6 : size === 'md' ? 8 : 10,
            height: size === 'sm' ? 6 : size === 'md' ? 8 : 10,
            borderRadius: '50%',
            backgroundColor: statusColors.base,
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      )}
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </span>
  );
}

// ============================================================================
// Preset Pills
// ============================================================================

export function SuccessPill({ children, ...props }: Omit<StatusPillProps, 'status'>) {
  return <StatusPill status="success" {...props}>{children}</StatusPill>;
}

export function WarningPill({ children, ...props }: Omit<StatusPillProps, 'status'>) {
  return <StatusPill status="warning" {...props}>{children}</StatusPill>;
}

export function ErrorPill({ children, ...props }: Omit<StatusPillProps, 'status'>) {
  return <StatusPill status="error" {...props}>{children}</StatusPill>;
}

export function InfoPill({ children, ...props }: Omit<StatusPillProps, 'status'>) {
  return <StatusPill status="info" {...props}>{children}</StatusPill>;
}

// ============================================================================
// Spec State Pill
// ============================================================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

const specStateConfig: Record<SpecState, { status: StatusType; label: string }> = {
  DRAFT: { status: 'neutral', label: 'Draft' },
  FROZEN: { status: 'info', label: 'Frozen' },
  RELEASED: { status: 'success', label: 'Released' },
};

export function SpecStatePill({
  state,
  ...props
}: { state: SpecState } & Omit<StatusPillProps, 'status' | 'children'>) {
  const config = specStateConfig[state] || specStateConfig.DRAFT;
  return (
    <StatusPill status={config.status} {...props}>
      {config.label}
    </StatusPill>
  );
}

// ============================================================================
// Verify Status Pill
// ============================================================================

export type VerifyStatus = 'PASS' | 'PASS_WITH_WARN' | 'FAIL' | 'PENDING';

const verifyStatusConfig: Record<VerifyStatus, { status: StatusType; label: string }> = {
  PASS: { status: 'success', label: 'Pass' },
  PASS_WITH_WARN: { status: 'warning', label: 'Pass w/ Warnings' },
  FAIL: { status: 'error', label: 'Fail' },
  PENDING: { status: 'neutral', label: 'Pending' },
};

export function VerifyStatusPill({
  verifyStatus,
  ...props
}: { verifyStatus: VerifyStatus } & Omit<StatusPillProps, 'status' | 'children'>) {
  const config = verifyStatusConfig[verifyStatus] || verifyStatusConfig.PENDING;
  return (
    <StatusPill status={config.status} pulse={verifyStatus === 'PENDING'} {...props}>
      {config.label}
    </StatusPill>
  );
}

export default StatusPill;

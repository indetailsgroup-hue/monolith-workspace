/**
 * GateStatusIndicator
 *
 * Compact status badge showing Gate pass/fail state.
 * Used in tab bar and toolbar areas.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import React from 'react';
import { useGateStore, selectHasBlockers, selectTotalFindingCount } from './gateStore';
import { SEVERITY_COLORS } from './gateTypes';

// ============================================
// TYPES
// ============================================

export interface GateStatusIndicatorProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show count badge */
  showCount?: boolean;
  /** Click handler (receives event for stopPropagation support) */
  onClick?: (e?: React.MouseEvent) => void;
  /** Additional class names */
  className?: string;
  /** Render as span instead of button (use when inside another button) */
  asSpan?: boolean;
}

// ============================================
// SIZE CONFIGS
// ============================================

const SIZE_CONFIGS = {
  sm: {
    container: 'w-4 h-4',
    icon: 'w-3 h-3',
    badge: 'text-[8px] min-w-[12px] h-[12px]',
  },
  md: {
    container: 'w-5 h-5',
    icon: 'w-3.5 h-3.5',
    badge: 'text-[9px] min-w-[14px] h-[14px]',
  },
  lg: {
    container: 'w-6 h-6',
    icon: 'w-4 h-4',
    badge: 'text-[10px] min-w-[16px] h-[16px]',
  },
};

// ============================================
// ICONS
// ============================================

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

// ============================================
// COMPONENT
// ============================================

export function GateStatusIndicator({
  size = 'md',
  showCount = true,
  onClick,
  className = '',
  asSpan = false,
}: GateStatusIndicatorProps) {
  const lastResult = useGateStore(s => s.lastResult);
  const isRunning = useGateStore(s => s.isRunning);
  const hasBlockers = useGateStore(selectHasBlockers);
  const totalCount = useGateStore(selectTotalFindingCount);

  const config = SIZE_CONFIGS[size];

  // Use span or button based on context (avoid nested buttons)
  const Wrapper = asSpan ? 'span' : 'button';

  // ────────────────────────────────────────────────────────────────────────
  // States
  // ────────────────────────────────────────────────────────────────────────

  // Running state
  if (isRunning) {
    return (
      <Wrapper
        onClick={onClick}
        className={`relative flex items-center justify-center rounded transition-all
          ${config.container} bg-blue-500/20 ${className}`}
        title="Gate validation running..."
      >
        <SpinnerIcon className={`${config.icon} text-blue-400`} />
      </Wrapper>
    );
  }

  // No result yet
  if (!lastResult) {
    return (
      <Wrapper
        onClick={onClick}
        className={`relative flex items-center justify-center rounded transition-all
          ${config.container} bg-gray-500/20 hover:bg-gray-500/30 ${className}`}
        title="No Gate validation run yet"
      >
        <ShieldIcon className={`${config.icon} text-gray-500`} />
      </Wrapper>
    );
  }

  // Has blockers = FAIL
  if (hasBlockers) {
    return (
      <Wrapper
        onClick={onClick}
        className={`relative flex items-center justify-center rounded transition-all
          ${config.container} bg-red-500/20 hover:bg-red-500/30 ${className}`}
        title={`Gate FAILED: ${totalCount} issues`}
      >
        <XIcon className={`${config.icon} text-red-400`} />
        {showCount && totalCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex items-center justify-center
              rounded-full bg-red-500 text-white font-medium ${config.badge}`}
          >
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </Wrapper>
    );
  }

  // Passed (may have warnings)
  const warningCount = lastResult.findings.warnings.length;

  if (warningCount > 0) {
    return (
      <Wrapper
        onClick={onClick}
        className={`relative flex items-center justify-center rounded transition-all
          ${config.container} bg-amber-500/20 hover:bg-amber-500/30 ${className}`}
        title={`Gate PASSED with ${warningCount} warnings`}
      >
        <CheckIcon className={`${config.icon} text-amber-400`} />
        {showCount && (
          <span
            className={`absolute -top-1 -right-1 flex items-center justify-center
              rounded-full bg-amber-500 text-black font-medium ${config.badge}`}
          >
            {warningCount}
          </span>
        )}
      </Wrapper>
    );
  }

  // Clean pass
  return (
    <Wrapper
      onClick={onClick}
      className={`relative flex items-center justify-center rounded transition-all
        ${config.container} bg-green-500/20 hover:bg-green-500/30 ${className}`}
      title="Gate PASSED"
    >
      <CheckIcon className={`${config.icon} text-green-400`} />
    </Wrapper>
  );
}

export default GateStatusIndicator;

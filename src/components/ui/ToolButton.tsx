/**
 * ToolButton - Industrial UI Tool Button
 *
 * Compact tool button with active state styling.
 * Used in toolbars and scene controls.
 *
 * @version 1.0.0
 */

import React from 'react';

export interface ToolButtonProps {
  /** Icon component or element */
  icon: React.ReactNode;
  /** Tooltip text */
  tooltip?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Active/selected state */
  active?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

export function ToolButton({
  icon,
  tooltip,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  className = '',
  size = 'md',
}: ToolButtonProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const baseClasses = `
    tool-btn
    ${sizeClasses[size]}
    flex items-center justify-center
    rounded-md
    transition-all duration-150
    ${active ? 'active' : ''}
    ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
  `;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseClasses} ${className}`.trim()}
      title={tooltip ? `${tooltip}${shortcut ? ` (${shortcut})` : ''}` : undefined}
    >
      <span className={`tool-icon ${active ? 'active' : ''}`}>
        {icon}
      </span>
    </button>
  );
}

// Grouped toolbar container
export interface ToolButtonGroupProps {
  children: React.ReactNode;
  /** Divider between groups */
  divider?: boolean;
  className?: string;
}

export function ToolButtonGroup({
  children,
  divider = false,
  className = '',
}: ToolButtonGroupProps) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {children}
      {divider && <div className="w-px h-5 bg-border-subtle mx-1" />}
    </div>
  );
}

export default ToolButton;

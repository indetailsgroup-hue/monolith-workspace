/**
 * GlassPanel - Glassmorphism Panel Component
 *
 * Semi-transparent panel with backdrop blur effect.
 * Used for floating overlays and inspector panels.
 *
 * @version 1.0.0
 */

import React from 'react';

export interface GlassPanelProps {
  children: React.ReactNode;
  /** Panel title */
  title?: string;
  /** Collapsible toggle */
  collapsible?: boolean;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Panel width */
  width?: number | string;
  /** Additional className */
  className?: string;
  /** Position style */
  style?: React.CSSProperties;
  /** Header actions (buttons/icons) */
  headerActions?: React.ReactNode;
  /** On collapse toggle */
  onCollapse?: (collapsed: boolean) => void;
}

export function GlassPanel({
  children,
  title,
  collapsible = false,
  defaultCollapsed = false,
  width = 280,
  className = '',
  style,
  headerActions,
  onCollapse,
}: GlassPanelProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const handleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onCollapse?.(newCollapsed);
  };

  return (
    <div
      className={`glass-panel rounded-lg overflow-hidden ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        ...style,
      }}
    >
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
          <span className="oi-panel-header">{title}</span>
          <div className="flex items-center gap-1">
            {headerActions}
            {collapsible && (
              <button
                type="button"
                onClick={handleCollapse}
                className="tool-btn w-5 h-5 flex items-center justify-center rounded"
              >
                <svg
                  className={`w-3 h-3 text-textc-muted transition-transform ${
                    collapsed ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {!collapsed && (
        <div className="p-3">
          {children}
        </div>
      )}
    </div>
  );
}

// Section within a glass panel
export interface GlassPanelSectionProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function GlassPanelSection({
  children,
  title,
  className = '',
}: GlassPanelSectionProps) {
  return (
    <div className={`oi-section rounded-md p-2 mb-2 last:mb-0 ${className}`}>
      {title && (
        <div className="text-[10px] font-medium text-textc-muted uppercase tracking-wider mb-2">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// Divider for glass panels
export function GlassPanelDivider() {
  return <div className="oi-divider my-2" />;
}

export default GlassPanel;

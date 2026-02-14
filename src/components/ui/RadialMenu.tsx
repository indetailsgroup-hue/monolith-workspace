/**
 * RadialMenu - Plasticity-Style Context Menu (Deep Space Theme)
 *
 * Right-click anywhere in the canvas to open.
 * Shows context-aware radial menu items around the cursor position.
 *
 * Features:
 * - 8-direction radial layout
 * - Keyboard shortcuts (1-8)
 * - Context-aware items based on selection type
 * - Smooth 120ms pop animation
 *
 * Uses centralized UI store for state management.
 *
 * @version 3.0.0 - Context-aware items
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useUiStore } from '@/core/store/useUiStore';
import { useToolStore } from '@/core/store/useToolStore';
import { useCabinetStore } from '@/core/store/useCabinetStore';
import { useSelectionStore, getSelectionKindLabel } from '@/core/store/useSelectionStore';
import { useModelingStore } from '@/core/modeling';
import { useDrillMapStore } from '@/core/store/useDrillMapStore';
import {
  executeUiCommand,
  getContextAwareRadialItems,
  getCurrentSelectionType,
  type RadialSlot,
} from '@/core/commands/uiRegistry';

// ============================================================================
// Types
// ============================================================================

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  theme?: 'default' | 'danger' | 'primary';
}

// ============================================================================
// Constants
// ============================================================================

const MENU_RADIUS = 90;
const ITEM_SIZE = 44;
const ANIMATION_DURATION = 120;

const POSITIONS = [
  { angle: -90, label: 'N' },
  { angle: -45, label: 'NE' },
  { angle: 0, label: 'E' },
  { angle: 45, label: 'SE' },
  { angle: 90, label: 'S' },
  { angle: 135, label: 'SW' },
  { angle: 180, label: 'W' },
  { angle: -135, label: 'NW' },
];

// ============================================================================
// Component
// ============================================================================

export function RadialMenu() {
  // UI Store state
  const isOpen = useUiStore((s) => s.radialMenu.isOpen);
  const position = useUiStore((s) => s.radialMenu.position);
  const selectedIndex = useUiStore((s) => s.radialMenu.selectedIndex);
  const closeRadialMenu = useUiStore((s) => s.closeRadialMenu);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);

  // For re-render on state changes
  const activeTool = useToolStore((s) => s.activeTool);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const selection = useModelingStore((s) => s.selection);
  const selectionKind = useSelectionStore((s) => s.kind);

  // Local state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Get context-aware items from registry
  const slots = useMemo<RadialSlot[]>(() => {
    return getContextAwareRadialItems();
  }, [activeTool, activeCabinetId, selection, selectionKind]);

  // Convert slots to menu items with actions
  const items = useMemo<RadialMenuItem[]>(() => {
    return slots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      icon: slot.icon,
      shortcut: slot.shortcut,
      disabled: slot.disabled,
      theme: slot.theme,
      action: () => {
        if (slot.id === 'palette') {
          openCommandPalette();
        } else if (slot.commandId) {
          executeUiCommand(slot.commandId);
        }
      },
    }));
  }, [slots, openCommandPalette]);

  // Handle animation
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts (1-8)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeRadialMenu();
        return;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        e.preventDefault();
        const index = num - 1;
        if (items[index] && !items[index].disabled) {
          items[index].action();
          closeRadialMenu();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, closeRadialMenu]);

  const handleBackdropClick = useCallback(() => {
    closeRadialMenu();
  }, [closeRadialMenu]);

  const handleItemClick = useCallback(
    (item: RadialMenuItem) => {
      if (item.disabled) return;
      item.action();
      closeRadialMenu();
    },
    [closeRadialMenu]
  );

  if (!isOpen) return null;

  // Selection type indicator (from modeling or selection mode)
  const selectionType = getCurrentSelectionType();
  const contextLabel = selectionType !== 'none'
    ? selectionType.toUpperCase()
    : selectionKind !== 'object'
      ? getSelectionKindLabel(selectionKind).toUpperCase()
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleBackdropClick}
        onContextMenu={(e) => {
          e.preventDefault();
          closeRadialMenu();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          zIndex: 9990,
          animation: 'fadeIn 80ms ease-out',
        }}
      />

      {/* Menu Container */}
      <div
        className="radial-menu"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
          zIndex: 9991,
          pointerEvents: 'none',
        }}
      >
        {/* Center Indicator */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-purple-30)',
            border: '2px solid var(--accent-purple)',
            boxShadow: '0 0 12px var(--accent-purple-30)',
          }}
        />

        {/* Context Label (shows selection type) */}
        {contextLabel && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, calc(-50% - 40px))',
              backgroundColor: 'var(--accent-purple)',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 600,
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {contextLabel}
          </div>
        )}

        {/* Menu Items */}
        {items.map((item, index) => {
          const pos = POSITIONS[index];
          const angleRad = (pos.angle * Math.PI) / 180;
          const x = Math.cos(angleRad) * MENU_RADIUS;
          const y = Math.sin(angleRad) * MENU_RADIUS;

          const isHovered = hoveredIndex === index;
          const isSelected = selectedIndex === index;
          const isActive = isHovered || isSelected;

          let bgColor = 'var(--bg-primary)';
          let borderColor = 'var(--border-subtle)';
          let textColor = 'var(--text-primary)';
          let glowColor = 'transparent';

          if (item.disabled) {
            bgColor = 'rgba(26, 26, 46, 0.5)';
            textColor = 'var(--text-muted)';
          } else if (item.theme === 'primary') {
            bgColor = 'var(--accent-purple-30)';
            borderColor = 'var(--accent-purple)';
            glowColor = 'var(--accent-purple-20)';
          } else if (item.theme === 'danger' && isActive) {
            bgColor = 'var(--accent-red-30)';
            borderColor = 'var(--accent-red)';
            glowColor = 'var(--accent-red-20)';
          } else if (isActive) {
            bgColor = 'var(--accent-purple-20)';
            borderColor = 'var(--accent-purple)';
            glowColor = 'var(--accent-purple-10)';
          }

          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => handleItemClick(item)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isAnimating ? 0 : 1})`,
                transition: `transform ${ANIMATION_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
                transitionDelay: `${index * 20}ms`,
                pointerEvents: 'auto',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <div
                style={{
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                  borderRadius: '50%',
                  backgroundColor: bgColor,
                  border: `1.5px solid ${borderColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color: textColor,
                  boxShadow: isActive
                    ? `0 4px 16px ${glowColor}, 0 0 0 1px ${borderColor}`
                    : '0 2px 8px rgba(0, 0, 0, 0.4)',
                  transition: 'all 80ms ease',
                  opacity: item.disabled ? 0.4 : 1,
                  backdropFilter: 'blur(8px)',
                }}
              >
                {item.icon}
              </div>

              {isActive && !item.disabled && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: ITEM_SIZE + 6,
                    transform: 'translateX(-50%)',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.label}</span>
                  {item.shortcut && (
                    <span
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '0px 4px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  position: 'absolute',
                  right: -2,
                  top: -2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: isActive ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 80ms ease',
                }}
              >
                {index + 1}
              </div>
            </div>
          );
        })}

        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: MENU_RADIUS + ITEM_SIZE + 32,
            transform: 'translateX(-50%)',
            fontSize: 10,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          Press <kbd style={kbdStyle}>1-8</kbd> or click to select
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 3,
  fontSize: 9,
  fontFamily: 'JetBrains Mono, monospace',
  marginLeft: 2,
  marginRight: 2,
};

// ============================================================================
// Legacy exports
// ============================================================================

export function openRadialMenu(x: number, y: number): void {
  useUiStore.getState().openRadialMenu(x, y);
}

export function closeRadialMenu(): void {
  useUiStore.getState().closeRadialMenu();
}

export function useRadialMenuHandler(): void {
  const openRadialMenu = useUiStore((s) => s.openRadialMenu);

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'CANVAS' ||
        target.closest('[data-radial-menu-area]')
      ) {
        // Check if hardware was right-clicked recently (within 200ms)
        // If so, don't open RadialMenu - let HardwareContextMenu handle it
        const hardwareRightClickTime = useDrillMapStore.getState().hardwareRightClickTime;
        const timeSinceHardwareClick = Date.now() - hardwareRightClickTime;

        if (timeSinceHardwareClick < 200) {
          e.preventDefault();
          return; // Don't open RadialMenu
        }

        e.preventDefault();
        openRadialMenu(e.clientX, e.clientY);
      }
    }

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [openRadialMenu]);
}

export default RadialMenu;

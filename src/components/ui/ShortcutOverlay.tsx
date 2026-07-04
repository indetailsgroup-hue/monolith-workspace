/**
 * ShortcutOverlay - Keyboard Shortcuts Help Modal
 *
 * P001: CAD-style shortcut help overlay
 * Open: ? or Ctrl+/ (Cmd+/)
 * Close: Esc or X button
 *
 * Reads shortcuts from uiRegistry (single source of truth)
 *
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useUiStore } from '@/core/store/useUiStore';
import {
  getAllUiCommands,
  getUiCommandGroups,
  type UiCommand,
} from '@/core/commands/uiRegistry';

// ============================================================================
// Types
// ============================================================================

interface ShortcutGroup {
  name: string;
  commands: UiCommand[];
}

// ============================================================================
// Component
// ============================================================================

export function ShortcutOverlay() {
  const isOpen = useUiStore((s) => s.shortcutOverlay.isOpen);
  const closeOverlay = useUiStore((s) => s.closeShortcutOverlay);
  const panelRef = useRef<HTMLDivElement>(null);

  // Group commands by category, filter to those with hotkeys
  const groups = useMemo<ShortcutGroup[]>(() => {
    const allCommands = getAllUiCommands();
    const commandsWithHotkeys = allCommands.filter(
      (cmd) => cmd.hotkey && !cmd.id.endsWith(':num') // Exclude numeric alternates
    );

    const groupNames = getUiCommandGroups();
    const result: ShortcutGroup[] = [];

    // Priority order for groups
    const priorityOrder = ['Tools', 'View', 'Edit', 'Transform', 'Selection'];

    // Sort groups by priority
    const sortedGroups = [...groupNames].sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a);
      const bIdx = priorityOrder.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const name of sortedGroups) {
      const cmds = commandsWithHotkeys.filter((c) => c.group === name);
      if (cmds.length > 0) {
        result.push({ name, commands: cmds });
      }
    }

    // Add ungrouped
    const ungrouped = commandsWithHotkeys.filter((c) => !c.group);
    if (ungrouped.length > 0) {
      result.push({ name: 'General', commands: ungrouped });
    }

    return result;
  }, []);

  // Additional shortcuts not in registry (system-level)
  const systemShortcuts = useMemo(
    () => [
      { key: '?', label: 'Show this help', group: 'System' },
      { key: 'Ctrl+/', label: 'Show this help', group: 'System' },
      { key: 'F', label: 'Command Palette', group: 'System' },
      { key: 'Ctrl+K', label: 'Command Palette', group: 'System' },
      { key: 'Esc', label: 'Close overlay / Deselect', group: 'System' },
      { key: 'Tab', label: 'Cycle overlapping panels', group: 'Selection' },
      { key: '1-4', label: 'Selection mode (Point/Edge/Face/Object)', group: 'Selection' },
      { key: 'D', label: 'Toggle dimensions', group: 'View' },
      { key: 'H', label: 'Hide selected', group: 'View' },
      { key: 'Shift+H', label: 'Hide unselected', group: 'View' },
      { key: 'Alt+H', label: 'Show all', group: 'View' },
      { key: 'O', label: 'Toggle orthographic', group: 'View' },
      { key: 'X', label: 'X-Ray mode (drill patterns)', group: 'View' },
      { key: '.', label: 'Isolate selected', group: 'View' },
      { key: '/', label: 'Focus on selected', group: 'View' },
      { key: 'Q', label: 'Boolean Diff', group: 'Edit' },
      { key: 'W', label: 'Boolean Union', group: 'Edit' },
      { key: 'E', label: 'Boolean Intersect', group: 'Edit' },
      { key: 'Ctrl+S', label: 'Save project', group: 'System' },
    ],
    []
  );

  // Focus trap: close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay();
      }
    };

    // Use capture to catch before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeOverlay]);

  // Focus panel on open for accessibility
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — pointer-events-none so 3D scene stays interactive */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
          animation: 'fadeIn 120ms ease-out',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        className="shortcut-overlay"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 760,
          maxWidth: '90vw',
          maxHeight: '80vh',
          backgroundColor: 'rgb(var(--surface-2) / 0.95)',
          border: '1px solid rgb(var(--border-subtle))',
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          zIndex: 9999,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn 150ms ease-out',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgb(var(--border-subtle))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <KeyboardIcon />
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: 'rgb(var(--text-primary))',
                letterSpacing: '-0.01em',
              }}
            >
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={closeOverlay}
            aria-label="Close"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'rgb(var(--text-muted))',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 100ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgb(var(--surface-3))';
              e.currentTarget.style.color = 'rgb(var(--text-primary))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgb(var(--text-muted))';
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content - scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          {/* Two-column grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '24px 32px',
            }}
          >
            {/* Registry commands */}
            {groups.map((group) => (
              <ShortcutSection key={group.name} title={group.name}>
                {group.commands.map((cmd) => (
                  <ShortcutRow
                    key={cmd.id}
                    label={cmd.title}
                    keys={cmd.hotkey!}
                    icon={cmd.icon}
                  />
                ))}
              </ShortcutSection>
            ))}

            {/* System shortcuts */}
            <ShortcutSection title="System">
              {systemShortcuts
                .filter((s) => s.group === 'System')
                .map((s, i) => (
                  <ShortcutRow key={i} label={s.label} keys={s.key} />
                ))}
            </ShortcutSection>

            {/* Extra selection shortcuts */}
            <ShortcutSection title="Selection">
              {systemShortcuts
                .filter((s) => s.group === 'Selection')
                .map((s, i) => (
                  <ShortcutRow key={i} label={s.label} keys={s.key} />
                ))}
            </ShortcutSection>
          </div>
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid rgb(var(--border-subtle))',
            backgroundColor: 'rgb(var(--surface-1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: 'rgb(var(--text-muted))' }}>
            Press
          </span>
          <Keycap>Esc</Keycap>
          <span style={{ fontSize: 12, color: 'rgb(var(--text-muted))' }}>
            to close
          </span>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ShortcutSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 10px 0',
          fontSize: 11,
          fontWeight: 600,
          color: 'rgb(var(--text-muted))',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function ShortcutRow({
  label,
  keys,
  icon,
}: {
  label: string;
  keys: string;
  icon?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && (
          <span style={{ fontSize: 14, opacity: 0.6, width: 18, textAlign: 'center' }}>
            {icon}
          </span>
        )}
        <span
          style={{
            fontSize: 13,
            color: 'rgb(var(--text-secondary))',
          }}
        >
          {label}
        </span>
      </div>
      <KeycapGroup keys={keys} />
    </div>
  );
}

function KeycapGroup({ keys }: { keys: string }) {
  // Split by + for combinations like Ctrl+D
  const parts = keys.split('+');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span style={{ fontSize: 10, color: 'rgb(var(--text-muted))' }}>+</span>
          )}
          <Keycap>{formatKeyName(part)}</Keycap>
        </React.Fragment>
      ))}
    </div>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 22,
        padding: '0 6px',
        fontSize: 11,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontWeight: 500,
        color: 'rgb(var(--text-primary) / 0.7)',
        backgroundColor: 'rgb(var(--text-primary) / 0.05)',
        border: '1px solid rgb(var(--text-primary) / 0.1)',
        borderRadius: 4,
        textTransform: 'capitalize',
      }}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatKeyName(key: string): string {
  const keyMap: Record<string, string> = {
    ctrl: '⌃',
    alt: '⌥',
    shift: '⇧',
    meta: '⌘',
    delete: 'Del',
    backspace: '⌫',
    enter: '↵',
    escape: 'Esc',
    space: '␣',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    numpad1: 'Num1',
    numpad3: 'Num3',
    numpad5: 'Num5',
    numpad7: 'Num7',
  };

  const lower = key.toLowerCase();
  return keyMap[lower] || key.toUpperCase();
}

// ============================================================================
// Icons
// ============================================================================

function KeyboardIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'rgb(var(--accent-purple))' }}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M6 16h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

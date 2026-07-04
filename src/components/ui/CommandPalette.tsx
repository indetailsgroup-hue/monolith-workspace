/**
 * Command Palette - Deep Space Theme
 *
 * Press F or Cmd+K to open.
 * Type to filter commands, Enter to execute.
 *
 * Uses centralized command registry and UI store.
 * Shows "Frequent" section based on telemetry data.
 *
 * @version 3.0.0
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { useUiStore } from '@/core/store/useUiStore';
import {
  searchUiCommands,
  executeUiCommand,
  getUiCommandGroups,
  canExecuteUiCommand,
  getUiCommand,
  type UiCommand,
} from '@/core/commands/uiRegistry';
import { useCommandTelemetry } from '@/core/commands/telemetry';

// ============================================================================
// Component
// ============================================================================

export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);

  // Store state
  const isOpen = useUiStore((s) => s.commandPalette.isOpen);
  const query = useUiStore((s) => s.commandPalette.query);
  const selectedIndex = useUiStore((s) => s.commandPalette.selectedIndex);
  const setQuery = useUiStore((s) => s.setCommandPaletteQuery);
  const setSelectedIndex = useUiStore((s) => s.setCommandPaletteSelectedIndex);
  const closeCommandPalette = useUiStore((s) => s.closeCommandPalette);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    return searchUiCommands(query);
  }, [query]);

  // Get frequent commands from telemetry
  const frequentStats = useCommandTelemetry((s) => s.mostUsed(5));

  // Group commands by category with "Frequent" at top
  const groups = useMemo(() => {
    const grouped: Record<string, UiCommand[]> = {};

    // Add "Frequent" section when no query (show most used)
    if (!query && frequentStats.length > 0) {
      const frequentCmds: UiCommand[] = [];
      for (const stat of frequentStats) {
        const cmd = getUiCommand(stat.id);
        if (cmd) frequentCmds.push(cmd);
      }
      if (frequentCmds.length > 0) {
        grouped['⭐ Frequent'] = frequentCmds;
      }
    }

    // Add regular groups
    const groupNames = getUiCommandGroups();
    for (const name of groupNames) {
      const cmds = filteredCommands.filter((c) => c.group === name);
      if (cmds.length > 0) grouped[name] = cmds;
    }

    // Add ungrouped commands
    const ungrouped = filteredCommands.filter((c) => !c.group);
    if (ungrouped.length > 0) grouped['General'] = ungrouped;

    return grouped;
  }, [filteredCommands, query, frequentStats]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle close
  const handleClose = () => {
    closeCommandPalette();
  };

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          const cmd = filteredCommands[selectedIndex];
          if (canExecuteUiCommand(cmd.id)) {
            executeUiCommand(cmd.id);
            handleClose();
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleClose();
        break;
    }
  };

  // Handle command click
  const handleCommandClick = (cmd: UiCommand) => {
    if (canExecuteUiCommand(cmd.id)) {
      executeUiCommand(cmd.id);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — pointer-events-none so 3D scene stays interactive */}
      <div
        className="command-palette-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
          animation: 'fadeIn 120ms ease-out',
        }}
      />

      {/* Palette - 500px glass overlay */}
      <div
        className="command-palette glass-panel"
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500,
          maxWidth: '90vw',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'slideDown 150ms ease-out',
        }}
      >
        {/* Search Input */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (move, rotate, duplicate)"
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 15,
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                transition: 'color 80ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <ClearIcon />
            </button>
          )}
        </div>

        {/* Command List */}
        <div
          style={{
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              No commands found for "{query}"
            </div>
          ) : (
            <>
              {Object.entries(groups).map(([groupName, commands]) => (
                <div key={groupName}>
                  {/* Group Header */}
                  <div
                    style={{
                      padding: '6px 20px',
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  >
                    {groupName}
                  </div>
                  {commands.map((cmd) => {
                    const globalIndex = filteredCommands.indexOf(cmd);
                    const isSelected = globalIndex === selectedIndex;
                    const canExecute = canExecuteUiCommand(cmd.id);

                    return (
                      <div
                        key={cmd.id}
                        onClick={() => handleCommandClick(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        style={{
                          padding: '10px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: canExecute ? 'pointer' : 'not-allowed',
                          opacity: canExecute ? 1 : 0.5,
                          backgroundColor: isSelected
                            ? 'var(--accent-purple-20)'
                            : 'transparent',
                          borderLeft: isSelected
                            ? '2px solid var(--accent-purple)'
                            : '2px solid transparent',
                          transition: 'all 80ms ease',
                        }}
                      >
                        {/* Icon */}
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isSelected
                              ? 'var(--accent-purple-30)'
                              : 'var(--accent-purple-10)',
                            borderRadius: 6,
                            fontSize: 13,
                            transition: 'background-color 80ms ease',
                          }}
                        >
                          {cmd.icon || '⚡'}
                        </span>
                        {/* Label + Keywords */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: 'var(--text-primary)',
                              fontWeight: 500,
                              fontSize: 13,
                              lineHeight: 1.3,
                            }}
                          >
                            {cmd.title}
                          </div>
                          {cmd.keywords && cmd.keywords.length > 0 && (
                            <div
                              style={{
                                fontSize: 10,
                                color: 'var(--text-muted)',
                                marginTop: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {cmd.keywords.slice(0, 4).join(' · ')}
                            </div>
                          )}
                        </div>
                        {/* Hotkey badge */}
                        {cmd.hotkey && (
                          <span
                            style={{
                              fontSize: 10,
                              color: isSelected ? 'var(--accent-purple)' : 'var(--text-muted)',
                              backgroundColor: isSelected
                                ? 'var(--accent-purple-20)'
                                : 'rgba(255, 255, 255, 0.05)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            {cmd.hotkey}
                          </span>
                        )}
                        {/* Enter hint */}
                        {isSelected && (
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--accent-purple)',
                              backgroundColor: 'var(--accent-purple-20)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            ↵
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <span>
              <kbd style={kbdStyle}>↑↓</kbd> Navigate
            </span>
            <span>
              <kbd style={kbdStyle}>⏎</kbd> Execute
            </span>
            <span>
              <kbd style={kbdStyle}>Esc</kbd> Close
            </span>
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {filteredCommands.length} commands
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 3,
  fontSize: 9,
  fontFamily: 'JetBrains Mono, monospace',
  marginRight: 4,
};

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6b7280"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default CommandPalette;

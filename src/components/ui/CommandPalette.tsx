/**
 * Command Palette - Plasticity-Style Quick Actions
 *
 * Press Space or Cmd+K to open.
 * Type to filter commands, Enter to execute.
 *
 * "Designer types 'fillet' → System activates Edge Profile tool"
 *
 * v1.0: Initial command palette
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useModelingStore } from '@/core/modeling';
import { MODELING_COMMANDS, type CommandDefinition, type SelectionType } from '@/core/modeling/types';

interface CommandPaletteProps {
  /** Override open state (for controlled mode) */
  isOpen?: boolean;
  /** Callback when closed */
  onClose?: () => void;
}

export function CommandPalette({ isOpen: controlledOpen, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Store state
  const storeOpen = useModelingStore((s) => s.commandPaletteOpen);
  const query = useModelingStore((s) => s.commandPaletteQuery);
  const selection = useModelingStore((s) => s.selection);
  const setQuery = useModelingStore((s) => s.setCommandPaletteQuery);
  const closeCommandPalette = useModelingStore((s) => s.closeCommandPalette);
  const executeCommand = useModelingStore((s) => s.executeCommand);

  const isOpen = controlledOpen ?? storeOpen;
  const selectionType: SelectionType = selection?.type || 'none';

  // Local state for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on query and selection
  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();

    // Filter by selection type
    let commands = MODELING_COMMANDS.filter(
      (cmd) =>
        cmd.requiresSelection.includes(selectionType) ||
        cmd.requiresSelection.includes('panel') ||
        cmd.requiresSelection.includes('cabinet') ||
        selectionType === 'none' // Show all when nothing selected
    );

    // Filter by query
    if (q) {
      commands = commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    }

    return commands;
  }, [query, selectionType]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle close
  const handleClose = () => {
    closeCommandPalette();
    onClose?.();
  };

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex].id);
          handleClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleClose();
        break;
    }
  };

  // Handle command click
  const handleCommandClick = (cmd: CommandDefinition) => {
    executeCommand(cmd.id);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
        }}
      />

      {/* Palette */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 480,
          maxWidth: '90vw',
          backgroundColor: '#1a1a2e',
          border: '1px solid #3a3a5a',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Search Input */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3a3a5a',
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
            placeholder="Type a command... (fillet, bevel, groove)"
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <ClearIcon />
            </button>
          )}
        </div>

        {/* Selection Context */}
        {selectionType !== 'none' && (
          <div
            style={{
              padding: '8px 20px',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              borderBottom: '1px solid #3a3a5a',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#8b5cf6',
            }}
          >
            <SelectionIcon type={selectionType} />
            <span style={{ textTransform: 'capitalize' }}>{selectionType} Selected</span>
            <span style={{ color: '#6b7280', marginLeft: 'auto' }}>
              Showing relevant commands
            </span>
          </div>
        )}

        {/* Command List */}
        <div
          style={{
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: '#6b7280',
              }}
            >
              No commands found for "{query}"
            </div>
          ) : (
            <>
              {/* Group by category */}
              {['edge', 'face', 'panel', 'hole', 'pattern', 'general'].map((category) => {
                const categoryCommands = filteredCommands.filter(
                  (cmd) => cmd.category === category
                );
                if (categoryCommands.length === 0) return null;

                return (
                  <div key={category}>
                    <div
                      style={{
                        padding: '8px 20px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      {category} Operations
                    </div>
                    {categoryCommands.map((cmd) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <div
                          key={cmd.id}
                          onClick={() => handleCommandClick(cmd)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          style={{
                            padding: '12px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: 'pointer',
                            backgroundColor: isSelected
                              ? 'rgba(139, 92, 246, 0.2)'
                              : 'transparent',
                            borderLeft: isSelected ? '3px solid #8b5cf6' : '3px solid transparent',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(139, 92, 246, 0.2)',
                              borderRadius: 6,
                              fontSize: 14,
                            }}
                          >
                            {cmd.icon}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: '#fff', fontWeight: 500 }}>{cmd.label}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              {cmd.keywords.slice(0, 4).join(', ')}
                            </div>
                          </div>
                          {isSelected && (
                            <span
                              style={{
                                fontSize: 11,
                                color: '#8b5cf6',
                                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}
                            >
                              Enter ↵
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #3a3a5a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#6b7280',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <kbd style={kbdStyle}>↑↓</kbd> Navigate
            </span>
            <span>
              <kbd style={kbdStyle}>Enter</kbd> Execute
            </span>
            <span>
              <kbd style={kbdStyle}>Esc</kbd> Close
            </span>
          </div>
          <div>{filteredCommands.length} commands</div>
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
  padding: '2px 6px',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: 4,
  fontSize: 10,
  fontFamily: 'monospace',
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

function SelectionIcon({ type }: { type: SelectionType }) {
  const icons: Record<SelectionType, string> = {
    none: '○',
    panel: '▢',
    edge: '─',
    face: '▣',
    hole: '◉',
    compartment: '⬚',
    cabinet: '▦',
  };
  return <span style={{ fontSize: 14 }}>{icons[type]}</span>;
}

export default CommandPalette;

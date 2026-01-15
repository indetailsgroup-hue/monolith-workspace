/**
 * Context Toolbar - Plasticity-Style Selection Tools
 *
 * Shows relevant tools based on what's selected:
 * - Edge → Profile, Bevel, Round, Edge Band
 * - Panel → Groove, Reveal, Kerf
 * - Face → Pattern, Texture
 *
 * "Click surface → Tools appear → Click tool → Drag → Done"
 *
 * v1.0: Initial context toolbar
 */

import React from 'react';
import { useModelingStore, useSelectionType } from '@/core/modeling';
import type { SelectionType, ModelingCommand } from '@/core/modeling/types';

interface ToolButton {
  id: ModelingCommand;
  icon: string;
  label: string;
  shortcut?: string;
}

// Tool definitions per selection type
const TOOLS_BY_SELECTION: Record<SelectionType, ToolButton[]> = {
  none: [],
  edge: [
    { id: 'apply-edge-profile', icon: '◗', label: 'Profile', shortcut: 'P' },
    { id: 'bevel-edge', icon: '◢', label: 'Bevel', shortcut: 'B' },
    { id: 'round-edge', icon: '◠', label: 'Round', shortcut: 'R' },
    { id: 'add-edge-band', icon: '▬', label: 'Band', shortcut: 'E' },
  ],
  panel: [
    { id: 'add-groove', icon: '▭', label: 'Groove', shortcut: 'G' },
    { id: 'add-reveal', icon: '┃', label: 'Reveal', shortcut: 'V' },
    { id: 'add-shadow-gap', icon: '│', label: 'Shadow', shortcut: 'S' },
    { id: 'kerf-bend', icon: '◜', label: 'Kerf', shortcut: 'K' },
  ],
  face: [
    { id: 'add-groove', icon: '▭', label: 'Groove', shortcut: 'G' },
    { id: 'apply-pattern', icon: '▦', label: 'Pattern' },
    { id: 'apply-slat-pattern', icon: '|||', label: 'Slats' },
  ],
  hole: [
    { id: 'add-shelf-pin-holes', icon: '○○', label: 'Shelf Pins' },
    { id: 'add-hinge-bore', icon: '◎', label: 'Hinge' },
    { id: 'add-system-hole', icon: '●', label: 'System' },
  ],
  compartment: [
    { id: 'duplicate', icon: '⧉', label: 'Duplicate', shortcut: 'D' },
    { id: 'array', icon: '⋮⋮⋮', label: 'Array', shortcut: 'A' },
  ],
  cabinet: [
    { id: 'duplicate', icon: '⧉', label: 'Duplicate', shortcut: 'D' },
    { id: 'mirror', icon: '⧎', label: 'Mirror', shortcut: 'M' },
  ],
};

interface ContextToolbarProps {
  /** Position: 'right' | 'bottom' */
  position?: 'right' | 'bottom';
  /** Show even when nothing selected */
  alwaysShow?: boolean;
}

export function ContextToolbar({ position = 'right', alwaysShow = false }: ContextToolbarProps) {
  const selectionType = useSelectionType();
  const selection = useModelingStore((s) => s.selection);
  const executeCommand = useModelingStore((s) => s.executeCommand);
  const toolMode = useModelingStore((s) => s.tool.mode);
  const activeCommand = useModelingStore((s) => s.tool.params.activeCommand as ModelingCommand | undefined);

  const tools = TOOLS_BY_SELECTION[selectionType];

  // Don't render if nothing selected and not alwaysShow
  if (!alwaysShow && selectionType === 'none') {
    return null;
  }

  const isHorizontal = position === 'bottom';

  return (
    <div
      style={{
        position: 'absolute',
        ...(position === 'right'
          ? { right: 16, top: '50%', transform: 'translateY(-50%)' }
          : { bottom: 16, left: '50%', transform: 'translateX(-50%)' }),
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        gap: 4,
        padding: 8,
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid #3a3a5a',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: 100,
      }}
    >
      {/* Selection indicator */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(139, 92, 246, 0.2)',
          borderRadius: 8,
          marginBottom: isHorizontal ? 0 : 4,
          marginRight: isHorizontal ? 8 : 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <SelectionIcon type={selectionType} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#8b5cf6',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {selectionType}
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          width: isHorizontal ? 1 : '100%',
          height: isHorizontal ? 32 : 1,
          backgroundColor: '#3a3a5a',
          alignSelf: 'center',
        }}
      />

      {/* Tool buttons */}
      {tools.map((tool) => {
        const isActive = activeCommand === tool.id;

        return (
          <button
            key={tool.id}
            onClick={() => executeCommand(tool.id)}
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            style={{
              display: 'flex',
              flexDirection: isHorizontal ? 'column' : 'row',
              alignItems: 'center',
              gap: isHorizontal ? 4 : 10,
              padding: isHorizontal ? '8px 12px' : '10px 14px',
              backgroundColor: isActive ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
              border: isActive ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid transparent',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              minWidth: isHorizontal ? 60 : 120,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span
              style={{
                fontSize: 18,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
              }}
            >
              {tool.icon}
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isHorizontal ? 'center' : 'flex-start',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: isActive ? '#8b5cf6' : '#fff',
                }}
              >
                {tool.label}
              </span>
              {tool.shortcut && !isHorizontal && (
                <span
                  style={{
                    fontSize: 10,
                    color: '#6b7280',
                    fontFamily: 'monospace',
                  }}
                >
                  {tool.shortcut}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {/* Quick actions at bottom */}
      {tools.length > 0 && (
        <>
          <div
            style={{
              width: isHorizontal ? 1 : '100%',
              height: isHorizontal ? 32 : 1,
              backgroundColor: '#3a3a5a',
              alignSelf: 'center',
              marginTop: isHorizontal ? 0 : 4,
              marginLeft: isHorizontal ? 8 : 0,
            }}
          />
          <button
            onClick={() => useModelingStore.getState().openCommandPalette()}
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: '1px dashed #3a3a5a',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, color: '#6b7280' }}>More</span>
            <span
              style={{
                fontSize: 10,
                color: '#6b7280',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            >
              Space
            </span>
          </button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

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
  return <span style={{ fontSize: 16 }}>{icons[type]}</span>;
}

export default ContextToolbar;

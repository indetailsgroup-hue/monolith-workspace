/**
 * PanelList - Shows panels for active cabinet with hover/selection sync
 *
 * T015: Bidirectional sync with 3D canvas
 * - Hover in list -> highlights in 3D
 * - Hover in 3D -> highlights in list
 * - Click in list -> selects in 3D
 * - Click in 3D -> selects in list
 *
 * @version 1.0.0
 */

import React from 'react';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useSelectionStore } from '../../core/store/useSelectionStore';
import { Square, Layers, Check } from 'lucide-react';

// Panel type icons
const PANEL_ICONS: Record<string, React.ReactNode> = {
  LEFT_SIDE: <Layers size={14} className="rotate-90" />,
  RIGHT_SIDE: <Layers size={14} className="rotate-90" />,
  TOP: <Square size={14} />,
  BOTTOM: <Square size={14} />,
  BACK: <Square size={14} />,
  SHELF: <Layers size={14} />,
  DIVIDER: <Layers size={14} className="rotate-90" />,
};

const PANEL_COLORS: Record<string, string> = {
  LEFT_SIDE: 'text-blue-400',
  RIGHT_SIDE: 'text-blue-400',
  TOP: 'text-emerald-400',
  BOTTOM: 'text-emerald-400',
  BACK: 'text-gray-400',
  SHELF: 'text-amber-400',
  DIVIDER: 'text-purple-400',
};

interface PanelListProps {
  /** Optional: filter by panel role */
  filterRole?: string;
  /** Optional: show compact version */
  compact?: boolean;
}

export function PanelList({ filterRole, compact = false }: PanelListProps) {
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const cabinet = useCabinetStore((s) =>
    s.cabinets.find((c) => c.id === activeCabinetId)
  );
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);
  const selectPanel = useCabinetStore((s) => s.selectPanel);

  // T015: Global hover state for bidirectional sync
  const hoveredPanelId = useSelectionStore((s) => s.hoveredPanelId);
  const setHoveredPanel = useSelectionStore((s) => s.setHoveredPanel);

  if (!cabinet) {
    return (
      <div className="p-3 text-center text-gray-500 text-xs">
        เลือกตู้เพื่อดูรายการแผ่นไม้
      </div>
    );
  }

  // Filter panels by role if specified
  let panels = cabinet.panels || [];
  if (filterRole) {
    panels = panels.filter((p) => p.role === filterRole);
  }

  if (panels.length === 0) {
    return (
      <div className="p-3 text-center text-gray-500 text-xs">
        ไม่มีแผ่นไม้ในตู้นี้
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {panels.map((panel, index) => {
        const isSelected = panel.id === selectedPanelId;
        const isHovered = panel.id === hoveredPanelId;
        const icon = PANEL_ICONS[panel.role] || <Square size={14} />;
        const color = PANEL_COLORS[panel.role] || 'text-gray-400';

        return (
          <div
            key={panel.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 cursor-pointer
              ${isSelected
                ? 'bg-blue-500/10 border-blue-500/30'
                : isHovered
                  ? 'bg-cyan-500/10 border-cyan-500/30'
                  : 'bg-surface-2 border-[#333] hover:border-gray-500'
              }`}
            onClick={() => selectPanel(panel.id)}
            onMouseEnter={() => setHoveredPanel(panel.id)}
            onMouseLeave={() => setHoveredPanel(null)}
          >
            {/* Index & Icon */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-mono w-4">{index + 1}</span>
              <span className={color}>{icon}</span>
            </div>

            {/* Name & Dimensions */}
            <div className="flex-1 min-w-0">
              <div className={`text-sm truncate ${isHovered ? 'text-cyan-300' : 'text-white'}`}>
                {panel.name}
              </div>
              {!compact && (
                <div className="text-xs text-gray-500 font-mono">
                  {panel.finishWidth} × {panel.finishHeight} × {panel.computed.realThickness.toFixed(1)} mm
                </div>
              )}
            </div>

            {/* Selected indicator */}
            {isSelected && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-400 text-xs">
                <Check size={10} />
              </div>
            )}

            {/* Hover indicator */}
            {isHovered && !isSelected && (
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </div>
        );
      })}

      {/* Summary */}
      <div className="pt-2 mt-2 border-t border-[#333] flex items-center justify-between text-xs text-gray-500">
        <span>{panels.length} แผ่นไม้</span>
        <span className="font-mono text-cyan-400/60">
          {hoveredPanelId ? `Hover: ${panels.find(p => p.id === hoveredPanelId)?.name || '-'}` : ''}
        </span>
      </div>
    </div>
  );
}

export default PanelList;

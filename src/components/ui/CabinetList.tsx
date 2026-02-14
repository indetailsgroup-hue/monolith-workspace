/**
 * CabinetList - Shows all cabinets in scene with selection/removal
 *
 * Features:
 * - List all cabinets
 * - Click to select/activate
 * - Delete button to remove
 * - Show active indicator
 */

import React from 'react';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import {
  Box,
  Square,
  Columns,
  CornerDownRight,
  Refrigerator,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';

// Type icons
const TYPE_ICONS: Record<string, React.ReactNode> = {
  BASE: <Box size={14} />,
  WALL: <Square size={14} />,
  TALL: <Columns size={14} />,
  CORNER: <CornerDownRight size={14} />,
  DRAWER: <Box size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
  BASE: 'text-emerald-400',
  WALL: 'text-blue-400',
  TALL: 'text-purple-400',
  CORNER: 'text-amber-400',
  DRAWER: 'text-cyan-400',
};

export function CabinetList() {
  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const selectCabinet = useCabinetStore((s) => s.selectCabinet);
  const removeCabinet = useCabinetStore((s) => s.removeCabinet);
  const duplicateCabinet = useCabinetStore((s) => s.duplicateCabinet);

  if (cabinets.length === 0) {
    return (
      <div className="p-3 text-center text-gray-500 text-xs">
        ยังไม่มีตู้ในโปรเจค<br />
        เลือกประเภทตู้ด้านบนเพื่อเพิ่ม
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {cabinets.map((cab, index) => {
        const isActive = cab.id === activeCabinetId;
        const typeIcon = TYPE_ICONS[cab.type] || <Box size={14} />;
        const typeColor = TYPE_COLORS[cab.type] || 'text-gray-400';

        return (
          <div
            key={cab.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 cursor-pointer
              ${isActive
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-surface-2 border-[#333] hover:border-gray-500'
              }`}
            onClick={() => selectCabinet(cab.id)}
          >
            {/* Index & Icon */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-mono w-4">{index + 1}</span>
              <span className={typeColor}>{typeIcon}</span>
            </div>

            {/* Name & Dimensions */}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{cab.name}</div>
              <div className="text-xs text-gray-500 font-mono">
                {cab.dimensions.width} × {cab.dimensions.height} × {cab.dimensions.depth}
              </div>
            </div>

            {/* Active indicator */}
            {isActive && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 rounded text-green-400 text-xs">
                <Check size={10} />
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateCabinet(cab.id);
                }}
                className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                title="Duplicate"
              >
                <Copy size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeCabinet(cab.id);
                }}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div className="pt-2 mt-2 border-t border-[#333] flex items-center justify-between text-xs text-gray-500">
        <span>{cabinets.length} ตู้ในโปรเจค</span>
        <span className="font-mono">
          {cabinets.reduce((sum, c) => sum + (c.computed?.totalSurfaceArea || 0), 0).toFixed(2)} m²
        </span>
      </div>
    </div>
  );
}

export default CabinetList;

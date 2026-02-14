/**
 * CabinetTypeSelector - Select cabinet type and ADD to scene
 *
 * Features:
 * - Category filter (BASE, WALL, TALL, CORNER, APPLIANCE)
 * - Click to ADD new cabinet to scene (not replace)
 * - Shows count of cabinets added
 * - Show cabinet info
 */

import React, { useState, useMemo } from 'react';
import {
  CABINET_TYPES,
  getCabinetsByCategory,
  type CabinetCategory,
  type CabinetTypeDefinition,
} from '../../core/catalog';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import {
  LayoutGrid,
  Box,
  Square,
  Columns,
  CornerDownRight,
  Refrigerator,
  Info,
  Plus,
  ChevronRight,
} from 'lucide-react';

// Category icons and colors
const CATEGORY_CONFIG: Record<CabinetCategory, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  labelTH: string;
}> = {
  BASE: {
    icon: <Box size={14} />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    label: 'Base',
    labelTH: 'ตู้ล่าง',
  },
  WALL: {
    icon: <Square size={14} />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    label: 'Wall',
    labelTH: 'ตู้ลอย',
  },
  TALL: {
    icon: <Columns size={14} />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    label: 'Tall',
    labelTH: 'ตู้สูง',
  },
  CORNER: {
    icon: <CornerDownRight size={14} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    label: 'Corner',
    labelTH: 'ตู้มุม',
  },
  APPLIANCE: {
    icon: <Refrigerator size={14} />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    label: 'Appliance',
    labelTH: 'ตู้อุปกรณ์',
  },
};

const ALL_CATEGORIES: CabinetCategory[] = ['BASE', 'WALL', 'TALL', 'CORNER', 'APPLIANCE'];

interface CabinetTypeSelectorProps {
  onTypeSelected?: (type: CabinetTypeDefinition) => void;
}

export function CabinetTypeSelector({ onTypeSelected }: CabinetTypeSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<CabinetCategory | 'ALL'>('ALL');
  const [showList, setShowList] = useState(false);
  const [showInfo, setShowInfo] = useState<string | null>(null);

  const addCabinet = useCabinetStore((s) => s.addCabinet);
  const cabinets = useCabinetStore((s) => s.cabinets);

  // Get filtered cabinet types
  const filteredTypes = useMemo(() => {
    if (selectedCategory === 'ALL') {
      return Object.values(CABINET_TYPES);
    }
    return getCabinetsByCategory(selectedCategory);
  }, [selectedCategory]);

  // Add cabinet to scene
  const handleAddCabinet = (type: CabinetTypeDefinition) => {
    console.log('[CabinetTypeSelector] handleAddCabinet called with:', type.id);
    console.log('[CabinetTypeSelector] Current cabinets count:', cabinets.length);

    // Calculate position offset based on existing cabinets
    const offsetX = cabinets.length * 700; // Space cabinets 700mm apart

    try {
      const result = addCabinet(
        type.id as any,
        type.nameTH,
        {
          width: type.standards.width.default,
          height: type.standards.height.default,
          depth: type.standards.depth.default,
          toeKickHeight: type.toeKickHeight ?? 0,
        },
        [offsetX, 0, 0]
      );
      console.log('[CabinetTypeSelector] addCabinet result:', result);
      console.log('[CabinetTypeSelector] New cabinets count:', cabinets.length);
    } catch (error) {
      console.error('[CabinetTypeSelector] addCabinet error:', error);
    }

    // Callback
    onTypeSelected?.(type);
  };

  return (
    <div className="space-y-3">
      {/* Header with cabinet count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">เลือกประเภทตู้เพื่อเพิ่ม</span>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-3 rounded-lg">
          <Box size={12} className="text-green-400" />
          <span className="text-xs text-white font-mono">{cabinets.length}</span>
          <span className="text-xs text-gray-500">ตู้</span>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-2.5 py-1 text-xs rounded-lg border transition-all duration-200
            ${selectedCategory === 'ALL'
              ? 'bg-white/10 border-white/20 text-white'
              : 'bg-surface-2 border-[#333] text-gray-500 hover:text-white hover:border-gray-500'
            }`}
        >
          <div className="flex items-center gap-1.5">
            <LayoutGrid size={12} />
            <span>All</span>
          </div>
        </button>

        {ALL_CATEGORIES.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          const isSelected = selectedCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-all duration-200
                ${isSelected
                  ? `${config.bgColor} ${config.color}`
                  : 'bg-surface-2 border-[#333] text-gray-500 hover:text-white hover:border-gray-500'
                }`}
            >
              <div className="flex items-center gap-1.5">
                {config.icon}
                <span>{config.labelTH}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toggle List Button */}
      <button
        onClick={() => setShowList(!showList)}
        className="w-full px-3 py-2.5 bg-surface-2 border border-[#333] rounded-lg
          flex items-center justify-between text-left
          hover:border-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500/20
          transition-all duration-200"
      >
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-green-400" />
          <span className="text-sm text-white">เพิ่มตู้ใหม่...</span>
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-500 transition-transform duration-200 ${showList ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Inline Type List */}
      {showList && (
        <div className="bg-surface-2 border border-[#333] rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {filteredTypes.map((type) => {
              const catConfig = CATEGORY_CONFIG[type.category];
              const isInfoOpen = showInfo === type.id;

              return (
                <div
                  key={type.id}
                  className="border-b border-[#333] last:border-b-0"
                >
                  <div className="flex items-center">
                    {/* Add Button */}
                    <button
                      onClick={() => handleAddCabinet(type)}
                      className="flex-1 px-3 py-2.5 flex items-center gap-3 text-left
                        transition-all duration-150 hover:bg-surface-3"
                    >
                      <span className={catConfig.color}>{catConfig.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{type.nameTH}</div>
                        <div className="text-xs text-gray-500 truncate">{type.name}</div>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded text-green-400 text-xs">
                        <Plus size={12} />
                        <span>เพิ่ม</span>
                      </div>
                    </button>

                    {/* Info Toggle */}
                    <button
                      onClick={() => setShowInfo(isInfoOpen ? null : type.id)}
                      className={`p-2.5 transition-all duration-200
                        ${isInfoOpen ? 'bg-blue-500/10 text-blue-400' : 'text-gray-500 hover:text-white'}`}
                    >
                      <Info size={14} />
                    </button>
                  </div>

                  {/* Info Panel */}
                  {isInfoOpen && (
                    <div className="px-3 pb-3 space-y-2 text-xs border-t border-[#333] bg-surface-3/50">
                      <p className="text-gray-400 pt-2">{type.description}</p>

                      {/* Dimension Defaults */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <div className="text-center p-1.5 bg-surface-2 rounded">
                          <div className="text-xs text-gray-500">W</div>
                          <div className="text-xs text-emerald-400 font-mono">{type.standards.width.default}</div>
                        </div>
                        <div className="text-center p-1.5 bg-surface-2 rounded">
                          <div className="text-xs text-gray-500">H</div>
                          <div className="text-xs text-blue-400 font-mono">{type.standards.height.default}</div>
                        </div>
                        <div className="text-center p-1.5 bg-surface-2 rounded">
                          <div className="text-xs text-gray-500">D</div>
                          <div className="text-xs text-cyan-400 font-mono">{type.standards.depth.default}</div>
                        </div>
                        <div className="text-center p-1.5 bg-surface-2 rounded">
                          <div className="text-xs text-gray-500">Shelf</div>
                          <div className="text-xs text-amber-400 font-mono">{type.defaultShelfCount}</div>
                        </div>
                      </div>

                      {/* Features */}
                      {type.features && type.features.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {type.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-2 py-0.5 bg-surface-2 rounded text-gray-400 text-xs"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CabinetTypeSelector;

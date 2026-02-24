/**
 * ConstructionTypeSelector - Face Frame vs Frameless selection
 *
 * Features:
 * - Visual card selection for construction types
 * - Shows key specifications when selected
 * - Integrates with cabinet store
 */

import React from 'react';
import {
  CONSTRUCTION_TYPES,
  type ConstructionType,
  type ConstructionTypeSpec,
} from '../../core/catalog/CabinetTaxonomy';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { Check, Info, Grid3x3, Frame } from 'lucide-react';

interface ConstructionTypeSelectorProps {
  selectedType?: ConstructionType;
  onTypeSelected?: (type: ConstructionType) => void;
  compact?: boolean;
}

// Visual icons for each construction type
function FaceFrameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      {/* Outer frame */}
      <rect x="4" y="4" width="40" height="40" rx="2" />
      {/* Inner frame (face frame) */}
      <rect x="8" y="8" width="32" height="32" rx="1" />
      {/* Vertical stiles */}
      <line x1="16" y1="8" x2="16" y2="40" />
      <line x1="32" y1="8" x2="32" y2="40" />
      {/* Horizontal rails */}
      <line x1="8" y1="16" x2="40" y2="16" />
      <line x1="8" y1="32" x2="40" y2="32" />
    </svg>
  );
}

function FramelessIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      {/* Outer cabinet */}
      <rect x="4" y="4" width="40" height="40" rx="2" />
      {/* 32mm hole pattern */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
      <circle cx="12" cy="28" r="1.5" fill="currentColor" />
      <circle cx="12" cy="36" r="1.5" fill="currentColor" />
      <circle cx="36" cy="12" r="1.5" fill="currentColor" />
      <circle cx="36" cy="20" r="1.5" fill="currentColor" />
      <circle cx="36" cy="28" r="1.5" fill="currentColor" />
      <circle cx="36" cy="36" r="1.5" fill="currentColor" />
      {/* Center open space */}
      <rect x="16" y="8" width="16" height="32" rx="1" strokeDasharray="4 2" />
    </svg>
  );
}

const CONSTRUCTION_TYPE_CONFIG: Record<ConstructionType, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  selectedBg: string;
  selectedBorder: string;
}> = {
  FACE_FRAME: {
    icon: <FaceFrameIcon className="w-full h-full" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    selectedBg: 'bg-amber-500/20',
    selectedBorder: 'border-amber-500',
  },
  FRAMELESS: {
    icon: <FramelessIcon className="w-full h-full" />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    selectedBg: 'bg-cyan-500/20',
    selectedBorder: 'border-cyan-500',
  },
};

export function ConstructionTypeSelector({
  selectedType: controlledType,
  onTypeSelected,
  compact = false,
}: ConstructionTypeSelectorProps) {
  // Use store state if not controlled
  const storeConstructionType = useCabinetStore((s) => s.constructionType);
  const setConstructionType = useCabinetStore((s) => s.setConstructionType);

  const selectedType = controlledType ?? storeConstructionType ?? 'FRAMELESS';

  const handleSelect = (type: ConstructionType) => {
    if (onTypeSelected) {
      onTypeSelected(type);
    } else {
      setConstructionType?.(type);
    }
  };

  const selectedSpec = CONSTRUCTION_TYPES[selectedType];

  if (compact) {
    return (
      <div className="flex gap-2">
        {(Object.entries(CONSTRUCTION_TYPES) as [ConstructionType, ConstructionTypeSpec][]).map(
          ([type, spec]) => {
            const config = CONSTRUCTION_TYPE_CONFIG[type];
            const isSelected = selectedType === type;

            return (
              <button
                key={type}
                onClick={() => handleSelect(type)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200
                  ${isSelected
                    ? `${config.selectedBg} ${config.selectedBorder} ${config.color}`
                    : 'bg-surface-2 border-[#333] text-gray-400 hover:text-white hover:border-gray-500'
                  }
                `}
              >
                <div className={`w-5 h-5 ${config.color}`}>
                  {config.icon}
                </div>
                <span className="text-xs font-medium">{type === 'FACE_FRAME' ? 'Face Frame' : 'Frameless'}</span>
                {isSelected && <Check size={14} className={config.color} />}
              </button>
            );
          }
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selection Cards (Compact) */}
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.entries(CONSTRUCTION_TYPES) as [ConstructionType, ConstructionTypeSpec][]).map(
          ([type, spec]) => {
            const config = CONSTRUCTION_TYPE_CONFIG[type];
            const isSelected = selectedType === type;

            return (
              <button
                key={type}
                onClick={() => handleSelect(type)}
                className={`
                  relative p-2 rounded-lg border transition-all duration-200
                  ${isSelected
                    ? `${config.selectedBg} ${config.selectedBorder}`
                    : 'bg-surface-2 border-[#333] hover:border-gray-500'
                  }
                `}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className={`absolute top-1 right-1 w-4 h-4 rounded-full ${config.bgColor} flex items-center justify-center`}>
                    <Check size={10} className={config.color} />
                  </div>
                )}

                {/* Icon */}
                <div className={`w-8 h-8 mx-auto mb-1 ${config.color}`}>
                  {config.icon}
                </div>

                {/* Labels */}
                <div className="text-center">
                  <div className={`text-[10px] font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                    {type === 'FACE_FRAME' ? 'Face Frame' : 'Frameless'}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {type === 'FACE_FRAME' ? 'อเมริกัน' : 'ยุโรป 32mm'}
                  </div>
                </div>
              </button>
            );
          }
        )}
      </div>

      {/* Selected Type Details (Compact) */}
      {selectedSpec && (
        <div className="p-2 bg-surface-2 rounded-lg border border-[#333] space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Info size={10} />
            <span>ข้อกำหนด</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Min Panel</span>
              <span className="text-white font-mono">{selectedSpec.minSidePanelThickness}mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hinge</span>
              <span className="text-white">{selectedSpec.hingeType === 'frame-mount' ? 'Frame' : 'Side'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Overlay</span>
              <span className="text-white capitalize">{selectedSpec.typicalOverlay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Interior -</span>
              <span className={`font-mono ${selectedSpec.interiorWidthReduction > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {selectedSpec.interiorWidthReduction}mm
              </span>
            </div>
          </div>

          {selectedSpec.holePatternSpacing && (
            <div className="pt-1.5 border-t border-[#333] flex items-center gap-1.5">
              <Grid3x3 size={10} className="text-cyan-400" />
              <span className="text-[10px] text-gray-400">
                32mm hole pattern
              </span>
            </div>
          )}

          {selectedSpec.requiresFrontFrame && (
            <div className="pt-1.5 border-t border-[#333] flex items-center gap-1.5">
              <Frame size={10} className="text-amber-400" />
              <span className="text-[10px] text-gray-400">
                Front frame required
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConstructionTypeSelector;

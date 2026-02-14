/**
 * SlatCalculator - Slat wall/batten spacing calculator
 *
 * Features:
 * - Vertical/Horizontal orientation
 * - Wall dimension inputs
 * - Slat width and gap configuration
 * - Material quantity estimation
 */

import React, { useState, useMemo } from 'react';
import { calculateSlatSpacing, type SlatResult } from '../../core/catalog/WallDecoration';
import {
  StretchHorizontal,
  StretchVertical,
  RotateCcw,
  Ruler,
  Copy,
  Check,
} from 'lucide-react';

interface SlatCalculatorProps {
  compact?: boolean;
}

export function SlatCalculator({ compact = false }: SlatCalculatorProps) {
  const [orientation, setOrientation] = useState<'VERTICAL' | 'HORIZONTAL'>('VERTICAL');
  const [wallLength, setWallLength] = useState(2400);
  const [wallHeight, setWallHeight] = useState(2400);
  const [slatWidth, setSlatWidth] = useState(40);
  const [targetGap, setTargetGap] = useState(20);
  const [copied, setCopied] = useState(false);

  const result = useMemo<SlatResult>(() => {
    return calculateSlatSpacing({
      wallLength,
      wallHeight,
      slatWidth,
      targetGap,
      orientation,
    });
  }, [wallLength, wallHeight, slatWidth, targetGap, orientation]);

  // Derived values not in SlatResult type
  const slatLength = orientation === 'VERTICAL' ? wallHeight : wallLength;
  const totalSlatArea = (slatWidth * slatLength * result.slatCount) / 1000000; // Convert mm² to m²

  const handleReset = () => {
    setOrientation('VERTICAL');
    setWallLength(2400);
    setWallHeight(2400);
    setSlatWidth(40);
    setTargetGap(20);
  };

  const handleCopy = () => {
    const text = `Slat Wall Calculation
Orientation: ${orientation}
Wall: ${wallLength}mm x ${wallHeight}mm
Slat Width: ${slatWidth}mm
Gap: ${result.actualGap}mm

Slat Count: ${result.slatCount}
Slat Length: ${slatLength}mm
Total Area: ${totalSlatArea.toFixed(2)} m²`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <StretchVertical className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Slat Wall Calculator</h3>
            <p className="text-xs text-gray-500">Batten spacing</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="p-2 rounded-lg hover:bg-surface-3 text-gray-500 hover:text-white transition-all"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Orientation Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setOrientation('VERTICAL')}
          className={`flex-1 p-2.5 rounded-lg border transition-all flex items-center justify-center gap-2 ${
            orientation === 'VERTICAL'
              ? 'bg-green-500/20 border-green-500/30 text-green-400'
              : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
          }`}
        >
          <StretchVertical size={16} />
          <span className="text-xs font-medium">Vertical</span>
        </button>
        <button
          onClick={() => setOrientation('HORIZONTAL')}
          className={`flex-1 p-2.5 rounded-lg border transition-all flex items-center justify-center gap-2 ${
            orientation === 'HORIZONTAL'
              ? 'bg-green-500/20 border-green-500/30 text-green-400'
              : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
          }`}
        >
          <StretchHorizontal size={16} />
          <span className="text-xs font-medium">Horizontal</span>
        </button>
      </div>

      {/* Wall Dimensions */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Ruler size={12} />
          <span>Wall Dimensions</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              {orientation === 'VERTICAL' ? 'Width' : 'Length'}
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wallLength}
                onChange={(e) => setWallLength(Number(e.target.value))}
                min={300}
                max={10000}
                step={100}
                className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-green-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Height</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wallHeight}
                onChange={(e) => setWallHeight(Number(e.target.value))}
                min={300}
                max={5000}
                step={100}
                className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-green-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Slat Settings */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="text-xs text-gray-400">Slat Settings</div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Slat Width</label>
              <span className="text-xs font-mono text-green-400">{slatWidth}mm</span>
            </div>
            <input
              type="range"
              value={slatWidth}
              onChange={(e) => setSlatWidth(Number(e.target.value))}
              min={20}
              max={100}
              step={5}
              className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Target Gap</label>
              <span className="text-xs font-mono text-green-400">{targetGap}mm</span>
            </div>
            <input
              type="range"
              value={targetGap}
              onChange={(e) => setTargetGap(Number(e.target.value))}
              min={5}
              max={100}
              step={5}
              className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">Result</div>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors"
            title="Copy"
          >
            {copied ? (
              <Check size={12} className="text-green-400" />
            ) : (
              <Copy size={12} className="text-gray-500" />
            )}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-surface-3 rounded-lg text-center">
            <div className="text-xs text-gray-500">Slats</div>
            <div className="text-lg font-mono text-green-400">{result.slatCount}</div>
          </div>
          <div className="p-2 bg-surface-3 rounded-lg text-center">
            <div className="text-xs text-gray-500">Actual Gap</div>
            <div className="text-lg font-mono text-white">{result.actualGap}mm</div>
          </div>
          <div className="p-2 bg-surface-3 rounded-lg text-center">
            <div className="text-xs text-gray-500">Length</div>
            <div className="text-lg font-mono text-white">{slatLength}mm</div>
          </div>
        </div>

        <div className="pt-2 border-t border-[#333] flex justify-between text-xs">
          <span className="text-gray-500">Total Slat Area</span>
          <span className="font-mono text-green-400">{totalSlatArea.toFixed(2)} m²</span>
        </div>
      </div>
    </div>
  );
}

export default SlatCalculator;

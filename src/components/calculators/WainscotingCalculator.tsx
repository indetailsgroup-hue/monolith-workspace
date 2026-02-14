/**
 * WainscotingCalculator - Panel distribution calculator
 *
 * Features:
 * - Style selection (Raised Panel, Recessed, Board & Batten, Shaker)
 * - Wall dimension inputs
 * - Panel width preferences
 * - Cut list generation
 */

import React, { useState, useMemo } from 'react';
import {
  calculateWainscoting,
  type WainscotingStyle,
  type WainscotingResult,
} from '../../core/catalog/WallDecoration';
import {
  LayoutPanelLeft,
  Copy,
  Check,
  RotateCcw,
  Ruler,
  ListChecks,
} from 'lucide-react';

const WAINSCOTING_STYLES: {
  id: WainscotingStyle;
  name: string;
  nameTH: string;
  description: string;
}[] = [
  { id: 'RAISED_PANEL', name: 'Raised Panel', nameTH: 'ลูกฟักนูน', description: 'Classic raised center' },
  { id: 'RECESSED_PANEL', name: 'Recessed', nameTH: 'ลูกฟักบุ๋ม', description: 'Flat recessed panel' },
  { id: 'BOARD_BATTEN', name: 'Board & Batten', nameTH: 'ระแนงตั้ง', description: 'Vertical planks' },
  { id: 'SHAKER', name: 'Shaker', nameTH: 'เชคเกอร์', description: 'Simple flat frame' },
];

interface WainscotingCalculatorProps {
  compact?: boolean;
}

export function WainscotingCalculator({ compact = false }: WainscotingCalculatorProps) {
  const [style, setStyle] = useState<WainscotingStyle>('RAISED_PANEL');
  const [wallLength, setWallLength] = useState(3600);
  const [wallHeight, setWallHeight] = useState(2400);
  const [wainscotHeight, setWainscotHeight] = useState(900);
  const [targetPanelWidth, setTargetPanelWidth] = useState(400);
  const [stileWidth, setStileWidth] = useState(75);
  const [copied, setCopied] = useState(false);

  const result = useMemo<WainscotingResult>(() => {
    return calculateWainscoting({
      wallLength,
      wallHeight,
      wainscotHeight,
      style,
      targetPanelWidth,
      stileWidth,
      panelThickness: 18,
      frameThickness: 18,
    });
  }, [wallLength, wallHeight, wainscotHeight, style, targetPanelWidth, stileWidth]);

  const handleReset = () => {
    setStyle('RAISED_PANEL');
    setWallLength(3600);
    setWallHeight(2400);
    setWainscotHeight(900);
    setTargetPanelWidth(400);
    setStileWidth(75);
  };

  const handleCopyCutList = () => {
    const cutListText = result.cutList
      .map((item) => `${item.name}: ${item.quantity}x ${item.width}mm x ${item.height}mm`)
      .join('\n');
    navigator.clipboard.writeText(cutListText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <LayoutPanelLeft className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Wainscoting Calculator</h3>
            <p className="text-xs text-gray-500">Panel distribution</p>
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

      {/* Style Selection */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Style</label>
        <div className="grid grid-cols-2 gap-2">
          {WAINSCOTING_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`p-2 text-xs rounded-lg border transition-all text-left ${
                style === s.id
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                  : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-medium">{s.nameTH}</div>
              <div className="text-[10px] opacity-70">{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Wall Dimensions */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Ruler size={12} />
          <span>Wall Dimensions</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Wall Length</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wallLength}
                onChange={(e) => setWallLength(Number(e.target.value))}
                min={500}
                max={10000}
                step={100}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Wainscot Height</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wainscotHeight}
                onChange={(e) => setWainscotHeight(Number(e.target.value))}
                min={300}
                max={1500}
                step={50}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Panel Settings */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="text-xs text-gray-400">Panel Settings</div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Target Panel Width</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={targetPanelWidth}
                onChange={(e) => setTargetPanelWidth(Number(e.target.value))}
                min={200}
                max={800}
                step={10}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Stile Width</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={stileWidth}
                onChange={(e) => setStileWidth(Number(e.target.value))}
                min={50}
                max={150}
                step={5}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600">mm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Result</span>
          <div className="text-amber-400 font-medium">
            {result.panelCount} panels @ {result.actualPanelWidth}mm
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-surface-3 rounded-lg text-center">
            <div className="text-xs text-gray-500">Panels</div>
            <div className="text-lg font-mono text-amber-400">{result.panelCount}</div>
          </div>
          <div className="p-2 bg-surface-3 rounded-lg text-center">
            <div className="text-xs text-gray-500">Stiles</div>
            <div className="text-lg font-mono text-white">{result.panelCount + 1}</div>
          </div>
        </div>
      </div>

      {/* Cut List */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ListChecks size={12} />
            <span>Cut List</span>
          </div>
          <button
            onClick={handleCopyCutList}
            className="p-1.5 rounded hover:bg-surface-3 transition-colors"
            title="Copy cut list"
          >
            {copied ? (
              <Check size={12} className="text-green-400" />
            ) : (
              <Copy size={12} className="text-gray-500" />
            )}
          </button>
        </div>

        <div className="space-y-1.5">
          {result.cutList.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-xs">
              <span className="text-gray-400">
                {item.name} <span className="text-gray-600">x{item.quantity}</span>
              </span>
              <span className="font-mono text-white">
                {item.width} x {item.height}mm
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WainscotingCalculator;

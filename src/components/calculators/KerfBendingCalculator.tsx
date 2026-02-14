/**
 * KerfBendingCalculator - Interactive calculator for kerf bending parameters
 *
 * Features:
 * - Material selection with constraints
 * - Panel dimension inputs
 * - Bend radius and angle parameters
 * - Real-time calculation display
 * - CNC parameter output
 * - Warning/recommendation system
 */

import React, { useState, useMemo } from 'react';
import {
  calculateKerfBending,
  getMinimumBendRadius,
  WEB_THICKNESS_LIMITS,
  type KerfMaterial,
  type KerfProfile,
  type KerfBendingResult,
} from '../../core/catalog/KerfBending';
import { DimensionSlider } from '../ui/DimensionSlider';
import {
  CircleDot,
  Ruler,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  RotateCcw,
  Settings2,
  Info,
  Layers,
} from 'lucide-react';

// Material options with display info
const MATERIALS: { id: KerfMaterial; name: string; nameTH: string; color: string }[] = [
  { id: 'MDF', name: 'MDF', nameTH: 'MDF', color: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
  { id: 'PLYWOOD', name: 'Plywood', nameTH: 'ไม้อัด', color: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
  { id: 'PARTICLE_BOARD', name: 'Particle Board', nameTH: 'ปาร์ติเกิล', color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' },
  { id: 'HMR', name: 'HMR', nameTH: 'HMR กันชื้น', color: 'bg-green-500/20 border-green-500/30 text-green-400' },
];

// Kerf profile options
const PROFILES: { id: KerfProfile; name: string; description: string }[] = [
  { id: 'STRAIGHT', name: 'Straight', description: 'Parallel cuts - most common' },
  { id: 'CROSS_HATCH', name: 'Cross-Hatch', description: 'X pattern for compound curves' },
  { id: 'LIVING_HINGE', name: 'Living Hinge', description: 'Max flexibility' },
];

interface KerfBendingCalculatorProps {
  defaultMaterial?: KerfMaterial;
  compact?: boolean;
  onCalculate?: (result: KerfBendingResult) => void;
}

export function KerfBendingCalculator({
  defaultMaterial = 'MDF',
  compact = false,
  onCalculate,
}: KerfBendingCalculatorProps) {
  // State
  const [material, setMaterial] = useState<KerfMaterial>(defaultMaterial);
  const [profile, setProfile] = useState<KerfProfile>('STRAIGHT');
  const [thickness, setThickness] = useState(18);
  const [width, setWidth] = useState(600);
  const [length, setLength] = useState(1200);
  const [bendRadius, setBendRadius] = useState(150);
  const [bendAngle, setBendAngle] = useState(90);
  const [kerfWidth, setKerfWidth] = useState(3.2);
  const [copied, setCopied] = useState<string | null>(null);

  // Calculate result
  const result = useMemo(() => {
    try {
      const calc = calculateKerfBending({
        panelThickness: thickness,
        panelWidth: width,
        panelLength: length,
        bendRadius,
        bendAngle,
        material,
        profile,
        kerfWidth,
      });
      onCalculate?.(calc);
      return { success: true, data: calc };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, [material, profile, thickness, width, length, bendRadius, bendAngle, kerfWidth, onCalculate]);

  // Get minimum bend radius for current settings
  const minRadius = getMinimumBendRadius(thickness, material);
  const webLimits = WEB_THICKNESS_LIMITS[material];

  // Copy to clipboard helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Reset to defaults
  const handleReset = () => {
    setMaterial('MDF');
    setProfile('STRAIGHT');
    setThickness(18);
    setWidth(600);
    setLength(1200);
    setBendRadius(150);
    setBendAngle(90);
    setKerfWidth(3.2);
  };

  // Generate summary text for copying
  const generateSummary = () => {
    if (!result.success || !result.data) return '';
    const r = result.data;
    return `Kerf Bending Parameters
Material: ${material}
Panel: ${thickness}mm x ${width}mm x ${length}mm
Bend: R${bendRadius}mm @ ${bendAngle}°

Kerf Count: ${r.kerfCount}
Kerf Spacing: ${r.kerfSpacing}mm
Kerf Depth: ${r.kerfDepth}mm
Web Thickness: ${r.webThickness}mm

CNC Parameters:
Tool: ${r.cncParams.toolDiameter}mm
Feed Rate: ${r.cncParams.feedRate} mm/min
Spindle: ${r.cncParams.spindleSpeed} RPM
Passes: ${r.cncParams.passes}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <CircleDot className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Kerf Bending Calculator</h3>
            <p className="text-xs text-gray-500">Curved panel manufacturing</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="p-2 rounded-lg hover:bg-surface-3 text-gray-500 hover:text-white transition-all"
          title="Reset to defaults"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Material Selection */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Material</label>
        <div className="flex flex-wrap gap-2">
          {MATERIALS.map((mat) => (
            <button
              key={mat.id}
              onClick={() => setMaterial(mat.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                material === mat.id
                  ? mat.color
                  : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
              }`}
            >
              {mat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Panel Dimensions */}
      <div className="space-y-3 p-3 bg-surface-2 rounded-xl border border-[#333]">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Layers size={12} />
          <span>Panel Dimensions</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Thickness</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                min={6}
                max={25}
                className="w-16 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-purple-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600 w-6">mm</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Width</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                min={100}
                max={2400}
                step={10}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-purple-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600 w-6">mm</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Length (bend zone)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                min={100}
                max={3000}
                step={10}
                className="w-20 px-2 py-1 text-right text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-purple-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600 w-6">mm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bend Parameters */}
      <div className="space-y-3 p-3 bg-surface-2 rounded-xl border border-[#333]">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <CircleDot size={12} />
          <span>Bend Parameters</span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">
                Bend Radius (R)
                <span className="ml-1 text-gray-600">min: {minRadius}mm</span>
              </label>
              <span className={`text-xs font-mono ${bendRadius < minRadius ? 'text-red-400' : 'text-purple-400'}`}>
                {bendRadius}mm
              </span>
            </div>
            <input
              type="range"
              value={bendRadius}
              onChange={(e) => setBendRadius(Number(e.target.value))}
              min={Math.max(50, minRadius - 50)}
              max={500}
              step={5}
              className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Bend Angle</label>
              <span className="text-xs font-mono text-purple-400">{bendAngle}°</span>
            </div>
            <input
              type="range"
              value={bendAngle}
              onChange={(e) => setBendAngle(Number(e.target.value))}
              min={15}
              max={180}
              step={5}
              className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Kerf Width (tool)</label>
            <select
              value={kerfWidth}
              onChange={(e) => setKerfWidth(Number(e.target.value))}
              className="px-2 py-1 text-sm bg-surface-3 border border-[#333] rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value={2.0}>2.0mm</option>
              <option value={3.0}>3.0mm</option>
              <option value={3.2}>3.2mm (1/8")</option>
              <option value={4.0}>4.0mm</option>
              <option value={6.0}>6.0mm (1/4")</option>
            </select>
          </div>
        </div>
      </div>

      {/* Kerf Profile Selection */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Kerf Profile</label>
        <div className="grid grid-cols-3 gap-2">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              className={`p-2 text-xs rounded-lg border transition-all text-center ${
                profile === p.id
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-medium">{p.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {result.success && result.data && (
        <>
          {/* Kerf Calculations */}
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Ruler size={12} />
                <span>Kerf Calculations</span>
              </div>
              <button
                onClick={() => handleCopy(generateSummary(), 'summary')}
                className="p-1.5 rounded hover:bg-surface-3 transition-colors"
                title="Copy all"
              >
                {copied === 'summary' ? (
                  <Check size={12} className="text-green-400" />
                ) : (
                  <Copy size={12} className="text-gray-500" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-surface-3 rounded-lg">
                <div className="text-xs text-gray-500">Kerf Count</div>
                <div className="text-lg font-mono text-white">{result.data.kerfCount}</div>
              </div>
              <div className="p-2 bg-surface-3 rounded-lg">
                <div className="text-xs text-gray-500">Spacing</div>
                <div className="text-lg font-mono text-white">{result.data.kerfSpacing}mm</div>
              </div>
              <div className="p-2 bg-surface-3 rounded-lg">
                <div className="text-xs text-gray-500">Kerf Depth</div>
                <div className="text-lg font-mono text-cyan-400">{result.data.kerfDepth}mm</div>
              </div>
              <div className="p-2 bg-surface-3 rounded-lg">
                <div className="text-xs text-gray-500">Web Thickness</div>
                <div className="text-lg font-mono text-green-400">{result.data.webThickness}mm</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-[#333]">
              <span className="text-gray-500">Min Bend Radius</span>
              <span className={result.data.safetyFactor >= 1 ? 'text-green-400' : 'text-red-400'}>
                {result.data.minBendRadius}mm
                {result.data.safetyFactor >= 1 ? (
                  <CheckCircle size={12} className="inline ml-1" />
                ) : (
                  <AlertTriangle size={12} className="inline ml-1" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Safety Factor</span>
              <span className={`font-mono ${result.data.safetyFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                {result.data.safetyFactor.toFixed(2)}x
              </span>
            </div>
          </div>

          {/* CNC Parameters */}
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Settings2 size={12} />
              <span>CNC Parameters</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Tool Diameter</span>
                <span className="font-mono text-white">{result.data.cncParams.toolDiameter}mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Feed Rate</span>
                <span className="font-mono text-white">{result.data.cncParams.feedRate} mm/min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Spindle Speed</span>
                <span className="font-mono text-white">{result.data.cncParams.spindleSpeed} RPM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Passes</span>
                <span className="font-mono text-white">{result.data.cncParams.passes}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.data.warnings.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle size={12} />
                <span>Warnings</span>
              </div>
              <ul className="text-xs text-amber-300/80 space-y-1">
                {result.data.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tips */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-2 text-xs">
              <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-blue-300/80">
                {material === 'MDF' && 'Consider lightly wetting the face side before bending MDF to prevent cracking.'}
                {material === 'PLYWOOD' && 'Plywood bends best with kerfs across the grain direction.'}
                {material === 'PARTICLE_BOARD' && 'Particle board is brittle - use wider spacing and larger radius.'}
                {material === 'HMR' && 'HMR bends similar to MDF. Ensure cuts are clean and free of tearout.'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Error State */}
      {!result.success && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle size={12} />
            <span>Calculation Error</span>
          </div>
          <p className="text-xs text-red-300/80 mt-1">{result.error}</p>
        </div>
      )}
    </div>
  );
}

export default KerfBendingCalculator;

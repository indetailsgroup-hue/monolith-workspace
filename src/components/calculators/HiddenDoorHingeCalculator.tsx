/**
 * HiddenDoorHingeCalculator - Calculate hinge requirements for hidden doors
 *
 * Features:
 * - Door dimension inputs
 * - Cladding configuration
 * - Hinge type selection (SOSS, Pivot, etc.)
 * - Weight calculation
 * - Hinge spacing and position
 * - Floor clearance recommendation
 */

import React, { useState, useMemo } from 'react';
import {
  HIDDEN_HINGE_SPECS,
  calculateHingeSpacing,
  calculateFloorClearance,
  calculateDoorWeight,
  type HiddenHingeType,
  type HiddenHingeSpec,
} from '../../core/catalog/WallDecoration';
import {
  DoorOpen,
  AlertTriangle,
  CheckCircle,
  Info,
  Scale,
  Ruler,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Material density options
const MATERIAL_DENSITIES = {
  MDF: { name: 'MDF', density: 750 },
  PLYWOOD: { name: 'Plywood', density: 550 },
  PARTICLE_BOARD: { name: 'Particle Board', density: 650 },
  SOLID_WOOD: { name: 'Solid Wood', density: 700 },
  HMR: { name: 'HMR', density: 780 },
};

// Floor types
const FLOOR_TYPES = ['TILE', 'WOOD', 'CARPET', 'CONCRETE'] as const;

interface HiddenDoorHingeCalculatorProps {
  compact?: boolean;
}

export function HiddenDoorHingeCalculator({ compact = false }: HiddenDoorHingeCalculatorProps) {
  // Door dimensions
  const [doorWidth, setDoorWidth] = useState(900);
  const [doorHeight, setDoorHeight] = useState(2400);
  const [doorThickness, setDoorThickness] = useState(40);
  const [doorMaterial, setDoorMaterial] = useState<keyof typeof MATERIAL_DENSITIES>('MDF');

  // Cladding
  const [hasCladding, setHasCladding] = useState(true);
  const [claddingThickness, setCladdingThickness] = useState(18);
  const [claddingMaterial, setCladdingMaterial] = useState<keyof typeof MATERIAL_DENSITIES>('MDF');
  const [claddingCoverage, setCladdingCoverage] = useState(100);

  // Hinge selection
  const [hingeType, setHingeType] = useState<HiddenHingeType>('SOSS');
  const [selectedHingeIndex, setSelectedHingeIndex] = useState(2); // Default to SOSS 218

  // Floor
  const [floorType, setFloorType] = useState<typeof FLOOR_TYPES[number]>('TILE');

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get available hinges for selected type
  const availableHinges = HIDDEN_HINGE_SPECS[hingeType] || [];
  const selectedHinge = availableHinges[selectedHingeIndex] || availableHinges[0];

  // Calculate results
  const results = useMemo(() => {
    // Weight calculation
    const weight = calculateDoorWeight(
      doorWidth,
      doorHeight,
      doorThickness,
      MATERIAL_DENSITIES[doorMaterial].density,
      hasCladding ? claddingThickness : 0,
      hasCladding ? MATERIAL_DENSITIES[claddingMaterial].density : 0,
      claddingCoverage / 100
    );

    // Hinge spacing
    const spacing = calculateHingeSpacing(doorHeight, hingeType);

    // Floor clearance
    const clearance = calculateFloorClearance({
      floorType,
      floorLevelTolerance: 3,
      doorSagAllowance: 1,
    });

    // Capacity check
    const hingesForWeight = Math.max(spacing.hingeCount, weight.hingeCountRequired);
    const capacityOk = selectedHinge && (weight.totalWeight / hingesForWeight) <= selectedHinge.maxDoorWeight;

    // Dimension checks
    const widthOk = !selectedHinge || doorWidth <= selectedHinge.maxDoorWidth;
    const heightOk = !selectedHinge || doorHeight <= selectedHinge.maxDoorHeight * hingesForWeight;

    // Total thickness
    const totalThickness = doorThickness + (hasCladding ? claddingThickness : 0);

    return {
      weight,
      spacing,
      clearance,
      hingesForWeight,
      capacityOk,
      widthOk,
      heightOk,
      totalThickness,
      warnings: [
        ...spacing.warnings,
        ...clearance.notes,
        !capacityOk && `Door weight (${weight.totalWeight}kg) may exceed hinge capacity`,
        !widthOk && `Door width (${doorWidth}mm) exceeds hinge max (${selectedHinge?.maxDoorWidth}mm)`,
        !heightOk && `Door height (${doorHeight}mm) may require more hinges`,
      ].filter(Boolean) as string[],
    };
  }, [
    doorWidth,
    doorHeight,
    doorThickness,
    doorMaterial,
    hasCladding,
    claddingThickness,
    claddingMaterial,
    claddingCoverage,
    hingeType,
    selectedHingeIndex,
    floorType,
    selectedHinge,
  ]);

  const handleReset = () => {
    setDoorWidth(900);
    setDoorHeight(2400);
    setDoorThickness(40);
    setDoorMaterial('MDF');
    setHasCladding(true);
    setCladdingThickness(18);
    setCladdingMaterial('MDF');
    setCladdingCoverage(100);
    setHingeType('SOSS');
    setSelectedHingeIndex(2);
    setFloorType('TILE');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <DoorOpen className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Hidden Door Hinge Calculator</h3>
            <p className="text-xs text-gray-500">SOSS, Pivot & concealed hinges</p>
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

      {/* Door Dimensions */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Ruler size={12} />
          <span>Door Dimensions</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Width</label>
            <div className="flex items-center">
              <input
                type="number"
                value={doorWidth}
                onChange={(e) => setDoorWidth(Number(e.target.value))}
                min={300}
                max={1500}
                step={10}
                className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Height</label>
            <input
              type="number"
              value={doorHeight}
              onChange={(e) => setDoorHeight(Number(e.target.value))}
              min={600}
              max={3000}
              step={10}
              className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Thickness</label>
            <input
              type="number"
              value={doorThickness}
              onChange={(e) => setDoorThickness(Number(e.target.value))}
              min={18}
              max={80}
              step={1}
              className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Door Material</label>
          <select
            value={doorMaterial}
            onChange={(e) => setDoorMaterial(e.target.value as keyof typeof MATERIAL_DENSITIES)}
            className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white focus:border-blue-500 focus:outline-none"
          >
            {Object.entries(MATERIAL_DENSITIES).map(([key, { name }]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cladding Options */}
      <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Cladding (optional)</span>
          <button
            onClick={() => setHasCladding(!hasCladding)}
            className={`w-10 h-5 rounded-full transition-all duration-200 relative ${
              hasCladding ? 'bg-blue-500' : 'bg-surface-4 border border-[#333]'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                hasCladding ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {hasCladding && (
          <div className="space-y-2 pt-2 border-t border-[#333]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Thickness</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={claddingThickness}
                    onChange={(e) => setCladdingThickness(Number(e.target.value))}
                    min={6}
                    max={50}
                    className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-600">mm</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Coverage</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={claddingCoverage}
                    onChange={(e) => setCladdingCoverage(Number(e.target.value))}
                    min={0}
                    max={100}
                    className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-600">%</span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cladding Material</label>
              <select
                value={claddingMaterial}
                onChange={(e) => setCladdingMaterial(e.target.value as keyof typeof MATERIAL_DENSITIES)}
                className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(MATERIAL_DENSITIES).map(([key, { name }]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Hinge Type Selection */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Hinge Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['SOSS', 'PIVOT'] as HiddenHingeType[]).map((type) => {
            const specs = HIDDEN_HINGE_SPECS[type] || [];
            const maxWeight = specs.reduce((max, s) => Math.max(max, s.maxDoorWeight), 0);

            return (
              <button
                key={type}
                onClick={() => {
                  setHingeType(type);
                  setSelectedHingeIndex(type === 'SOSS' ? 2 : 0);
                }}
                className={`p-3 rounded-xl border transition-all ${
                  hingeType === type
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-surface-2 border-[#333] text-gray-400 hover:border-gray-500'
                }`}
              >
                <div className="text-sm font-medium">{type}</div>
                <div className="text-xs opacity-70">Max: {maxWeight}kg</div>
              </button>
            );
          })}
        </div>

        {/* Hinge Model Selection */}
        {availableHinges.length > 1 && (
          <div className="mt-2">
            <label className="text-xs text-gray-500 block mb-1">Model</label>
            <div className="flex flex-wrap gap-1.5">
              {availableHinges.map((hinge, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedHingeIndex(index)}
                  className={`px-2 py-1 text-xs rounded-lg border transition-all ${
                    selectedHingeIndex === index
                      ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                      : 'bg-surface-3 border-[#333] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {hinge.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-3">
        {/* Weight Calculation */}
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Scale size={12} />
            <span>Weight Calculation</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-surface-3 rounded-lg text-center">
              <div className="text-xs text-gray-500">Door</div>
              <div className="text-sm font-mono text-white">{results.weight.doorWeight}kg</div>
            </div>
            <div className="p-2 bg-surface-3 rounded-lg text-center">
              <div className="text-xs text-gray-500">Cladding</div>
              <div className="text-sm font-mono text-white">{results.weight.claddingWeight}kg</div>
            </div>
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
              <div className="text-xs text-blue-400">Total</div>
              <div className="text-sm font-mono text-blue-400 font-medium">{results.weight.totalWeight}kg</div>
            </div>
          </div>
        </div>

        {/* Hinge Requirements */}
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400">Hinges Required</span>
            <span className={`font-mono ${results.capacityOk ? 'text-green-400' : 'text-red-400'}`}>
              {results.hingesForWeight} pcs
              {results.capacityOk ? (
                <CheckCircle size={12} className="inline ml-1" />
              ) : (
                <AlertTriangle size={12} className="inline ml-1" />
              )}
            </span>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            Positions (from top):
          </div>
          <div className="flex flex-wrap gap-1">
            {results.spacing.positions.map((pos, i) => (
              <span key={i} className="px-2 py-0.5 bg-surface-3 rounded text-xs font-mono text-white">
                {Math.round(pos)}mm
              </span>
            ))}
          </div>
        </div>

        {/* Floor Clearance */}
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <span>Floor Clearance</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Floor Type</label>
              <select
                value={floorType}
                onChange={(e) => setFloorType(e.target.value as typeof FLOOR_TYPES[number])}
                className="w-full px-2 py-1 text-xs bg-surface-3 border border-[#333] rounded-lg text-white focus:border-blue-500 focus:outline-none"
              >
                {FLOOR_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-xs text-gray-500">Min</div>
                <div className="text-sm font-mono text-white">{results.clearance.minClearance}mm</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Recommended</div>
                <div className="text-sm font-mono text-green-400">{results.clearance.recommendedClearance}mm</div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Hinge Specs */}
        {selectedHinge && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full p-3 bg-surface-2 rounded-xl border border-[#333] text-left"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">Hinge Specifications</div>
              {showAdvanced ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
            </div>

            {showAdvanced && (
              <div className="mt-2 pt-2 border-t border-[#333] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Model</span>
                  <span className="text-white">{selectedHinge.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Max Weight/Hinge</span>
                  <span className="text-white">{selectedHinge.maxDoorWeight}kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mortise Depth</span>
                  <span className="font-mono text-white">{selectedHinge.mortiseDepth}mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mortise Size</span>
                  <span className="font-mono text-white">{selectedHinge.mortiseWidth} x {selectedHinge.mortiseHeight}mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Closed Gap</span>
                  <span className="font-mono text-white">{selectedHinge.closedGap}mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Opening Angle</span>
                  <span className="font-mono text-white">{selectedHinge.openingAngle}°</span>
                </div>
              </div>
            )}
          </button>
        )}

        {/* Warnings */}
        {results.warnings.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-amber-400 mb-2">
              <AlertTriangle size={12} />
              <span>Notes & Warnings</span>
            </div>
            <ul className="text-xs text-amber-300/80 space-y-1">
              {results.warnings.map((warning, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-500">•</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tip */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-2 text-xs">
            <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-blue-300/80">
              Rule of thumb: Install 1 hinge per 762mm (30") of door height.
              Place second hinge close to top for better tension support.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HiddenDoorHingeCalculator;

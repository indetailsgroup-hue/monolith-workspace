/**
 * CNCToolPanel - CNC Tool Selection and Feed/Speed Calculator
 *
 * Features:
 * - Tool selection by application
 * - Material-aware feed/speed calculation
 * - Cut type settings
 * - CNC parameter display
 */

import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Gauge,
  RotateCcw,
  Copy,
  Check,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  COMMON_CNC_TOOLS,
  BOARD_MATERIALS,
  calculateFeedAndSpeed,
  type BoardMaterial,
  type CNCToolSpec,
} from '../../core/catalog/ManufacturingConstraints';

// Tool categories for filtering
const TOOL_APPLICATIONS = [
  { id: 'ALL', label: 'All Tools', labelTH: 'ทั้งหมด' },
  { id: 'ROUTING', label: 'Routing', labelTH: 'กัดร่อง' },
  { id: 'KERF', label: 'Kerf Bending', labelTH: 'เคิร์ฟ' },
  { id: 'POCKET', label: 'Pocketing', labelTH: 'เจาะร่อง' },
  { id: 'PROFILE', label: 'Profiling', labelTH: 'ตัดขอบ' },
] as const;

type ToolApplication = typeof TOOL_APPLICATIONS[number]['id'];
type CutType = 'PROFILE' | 'POCKET' | 'GROOVE' | 'KERF';

// Group tools by application
function getToolsForApplication(app: ToolApplication): string[] {
  const tools = Object.keys(COMMON_CNC_TOOLS);

  if (app === 'ALL') return tools;

  const toolAppMap: Record<string, ToolApplication[]> = {
    FLAT_3MM: ['ROUTING', 'KERF'],
    FLAT_6MM: ['ROUTING', 'POCKET', 'PROFILE'],
    FLAT_8MM: ['ROUTING', 'POCKET', 'PROFILE'],
    BALL_3MM: ['KERF', 'ROUTING'],
    BALL_6MM: ['KERF', 'ROUTING'],
    V_60: ['ROUTING', 'PROFILE'],
    V_90: ['ROUTING', 'PROFILE'],
    COMPRESSION_6MM: ['PROFILE', 'ROUTING'],
    STRAIGHT_6MM: ['ROUTING', 'POCKET'],
  };

  return tools.filter((t) => toolAppMap[t]?.includes(app));
}

// Profile icon based on tool type
function ToolProfileIcon({ profile }: { profile: string }) {
  const icons: Record<string, React.ReactNode> = {
    FLAT: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <rect x="10" y="2" width="4" height="20" fill="currentColor" />
        <rect x="8" y="18" width="8" height="4" fill="currentColor" opacity="0.5" />
      </svg>
    ),
    BALL_NOSE: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <rect x="10" y="2" width="4" height="16" fill="currentColor" />
        <ellipse cx="12" cy="20" rx="4" ry="3" fill="currentColor" opacity="0.5" />
      </svg>
    ),
    V_BIT: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <polygon points="12,22 8,8 16,8" fill="currentColor" opacity="0.5" />
        <rect x="10" y="2" width="4" height="8" fill="currentColor" />
      </svg>
    ),
    COMPRESSION: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <rect x="10" y="2" width="4" height="20" fill="currentColor" />
        <path d="M10 6 L14 10 M10 10 L14 14 M10 14 L14 18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
      </svg>
    ),
    STRAIGHT: (
      <svg viewBox="0 0 24 24" className="w-4 h-4">
        <rect x="10" y="2" width="4" height="20" fill="currentColor" />
        <line x1="10" y1="6" x2="10" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="14" y1="6" x2="14" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>
    ),
  };
  return icons[profile] || icons.FLAT;
}

interface CNCToolPanelProps {
  compact?: boolean;
  onToolSelect?: (toolId: string) => void;
}

export function CNCToolPanel({ compact = false, onToolSelect }: CNCToolPanelProps) {
  const [selectedApp, setSelectedApp] = useState<ToolApplication>('ALL');
  const [selectedTool, setSelectedTool] = useState<string>('FLAT_6MM');
  const [selectedMaterial, setSelectedMaterial] = useState<BoardMaterial>('MDF');
  const [cutType, setCutType] = useState<CutType>('PROFILE');
  const [showToolList, setShowToolList] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get filtered tools
  const filteredTools = useMemo(() => getToolsForApplication(selectedApp), [selectedApp]);

  // Get selected tool spec
  const toolSpec = COMMON_CNC_TOOLS[selectedTool];

  // Calculate feed and speed
  const feedSpeed = useMemo(() => {
    if (!toolSpec) return null;
    try {
      return calculateFeedAndSpeed(selectedTool, selectedMaterial, cutType);
    } catch {
      return null;
    }
  }, [selectedTool, selectedMaterial, cutType]);

  const handleReset = () => {
    setSelectedApp('ALL');
    setSelectedTool('FLAT_6MM');
    setSelectedMaterial('MDF');
    setCutType('PROFILE');
  };

  const handleCopy = () => {
    if (!feedSpeed || !toolSpec) return;

    const text = `CNC Parameters
Tool: ${toolSpec.name} (${toolSpec.diameter}mm)
Material: ${selectedMaterial}
Cut Type: ${cutType}

Feed Rate: ${feedSpeed.feedRate} mm/min
Spindle: ${feedSpeed.spindleSpeed} RPM
Depth/Pass: ${feedSpeed.depthPerPass} mm
Stepover: ${feedSpeed.stepover} mm`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectTool = (toolId: string) => {
    setSelectedTool(toolId);
    setShowToolList(false);
    onToolSelect?.(toolId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">CNC Tool & Feed/Speed</h3>
            <p className="text-xs text-gray-500">Calculate machining parameters</p>
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

      {/* Application Filter */}
      <div className="flex flex-wrap gap-1.5">
        {TOOL_APPLICATIONS.map((app) => (
          <button
            key={app.id}
            onClick={() => setSelectedApp(app.id)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-all duration-200
              ${selectedApp === app.id
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-surface-2 border-[#333] text-gray-500 hover:text-white hover:border-gray-500'
              }`}
          >
            {app.labelTH}
          </button>
        ))}
      </div>

      {/* Tool Selector */}
      <div className="relative">
        <button
          onClick={() => setShowToolList(!showToolList)}
          className="w-full px-3 py-2.5 bg-surface-2 border border-[#333] rounded-lg
            flex items-center justify-between text-left
            hover:border-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20
            transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-purple-400">
              <ToolProfileIcon profile={toolSpec?.profile || 'FLAT'} />
            </span>
            <div>
              <div className="text-sm text-white">{toolSpec?.nameTH || 'Select Tool'}</div>
              <div className="text-xs text-gray-500">{toolSpec?.diameter}mm {toolSpec?.profile}</div>
            </div>
          </div>
          {showToolList ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        </button>

        {/* Tool Dropdown */}
        {showToolList && (
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-surface-2 border border-[#333] rounded-lg overflow-hidden shadow-xl">
            <div className="max-h-48 overflow-y-auto">
              {filteredTools.map((toolId) => {
                const tool = COMMON_CNC_TOOLS[toolId];
                const isSelected = toolId === selectedTool;

                return (
                  <button
                    key={toolId}
                    onClick={() => handleSelectTool(toolId)}
                    className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-all
                      ${isSelected
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'hover:bg-surface-3 text-gray-300'
                      }`}
                  >
                    <span className={isSelected ? 'text-purple-400' : 'text-gray-500'}>
                      <ToolProfileIcon profile={tool.profile} />
                    </span>
                    <div className="flex-1">
                      <div className="text-sm">{tool.nameTH}</div>
                      <div className="text-xs text-gray-500">{tool.diameter}mm - {tool.fluteCount} flutes</div>
                    </div>
                    {isSelected && <Check size={14} className="text-purple-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Material & Cut Type */}
      <div className="grid grid-cols-2 gap-3">
        {/* Material Select */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Material</label>
          <select
            value={selectedMaterial}
            onChange={(e) => setSelectedMaterial(e.target.value as BoardMaterial)}
            className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white focus:border-purple-500 focus:outline-none"
          >
            {Object.entries(BOARD_MATERIALS).map(([id, mat]) => (
              <option key={id} value={id}>{mat.nameTH}</option>
            ))}
          </select>
        </div>

        {/* Cut Type Select */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Cut Type</label>
          <select
            value={cutType}
            onChange={(e) => setCutType(e.target.value as CutType)}
            className="w-full px-2 py-1.5 text-sm bg-surface-3 border border-[#333] rounded-lg text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="PROFILE">Profile Cut</option>
            <option value="POCKET">Pocket</option>
            <option value="GROOVE">Groove/Dado</option>
            <option value="KERF">Kerf Bending</option>
          </select>
        </div>
      </div>

      {/* Tool Info (Expandable) */}
      {toolSpec && (
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full flex items-center justify-between text-xs text-gray-400"
          >
            <span className="flex items-center gap-1.5">
              <Info size={12} />
              Tool Specifications
            </span>
            {showInfo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {showInfo && (
            <div className="mt-2 pt-2 border-t border-[#333] space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-1.5 bg-surface-3 rounded">
                  <div className="text-gray-500">Diameter</div>
                  <div className="text-white font-mono">{toolSpec.diameter}mm</div>
                </div>
                <div className="text-center p-1.5 bg-surface-3 rounded">
                  <div className="text-gray-500">Flutes</div>
                  <div className="text-white font-mono">{toolSpec.fluteCount}</div>
                </div>
                <div className="text-center p-1.5 bg-surface-3 rounded">
                  <div className="text-gray-500">Cut Length</div>
                  <div className="text-white font-mono">{toolSpec.cuttingLength}mm</div>
                </div>
              </div>

              <div>
                <div className="text-gray-500 mb-1">Best For:</div>
                <div className="flex flex-wrap gap-1">
                  {toolSpec.bestFor.map((use, i) => (
                    <span key={i} className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px]">
                      {use}
                    </span>
                  ))}
                </div>
              </div>

              {toolSpec.avoidFor.length > 0 && (
                <div>
                  <div className="text-gray-500 mb-1">Avoid For:</div>
                  <div className="flex flex-wrap gap-1">
                    {toolSpec.avoidFor.map((use, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">
                        {use}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feed & Speed Results */}
      {feedSpeed && (
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Gauge size={12} />
              Calculated Parameters
            </div>
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

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-surface-3 rounded-lg">
              <div className="text-xs text-gray-500">Feed Rate</div>
              <div className="text-lg font-mono text-purple-400">{feedSpeed.feedRate}</div>
              <div className="text-[10px] text-gray-600">mm/min</div>
            </div>
            <div className="p-2 bg-surface-3 rounded-lg">
              <div className="text-xs text-gray-500">Spindle</div>
              <div className="text-lg font-mono text-white">{feedSpeed.spindleSpeed}</div>
              <div className="text-[10px] text-gray-600">RPM</div>
            </div>
            <div className="p-2 bg-surface-3 rounded-lg">
              <div className="text-xs text-gray-500">Depth/Pass</div>
              <div className="text-lg font-mono text-white">{feedSpeed.depthPerPass}</div>
              <div className="text-[10px] text-gray-600">mm</div>
            </div>
            <div className="p-2 bg-surface-3 rounded-lg">
              <div className="text-xs text-gray-500">Stepover</div>
              <div className="text-lg font-mono text-white">{feedSpeed.stepover}</div>
              <div className="text-[10px] text-gray-600">mm ({Math.round(feedSpeed.stepover / toolSpec.diameter * 100)}%)</div>
            </div>
          </div>

          {feedSpeed.notes.length > 0 && (
            <div className="pt-2 border-t border-[#333]">
              {feedSpeed.notes.map((note, i) => (
                <div key={i} className="text-xs text-amber-400/80 flex items-start gap-1.5">
                  <span className="text-amber-500">*</span>
                  {note}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CNCToolPanel;

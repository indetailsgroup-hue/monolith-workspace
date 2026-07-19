/**
 * ExportPanel - Gate & Export System (P2.2 + Phase B1)
 *
 * SPEC-08 Compliant export workflow:
 * - Validation checks (dimensional, structural, machine compatibility)
 * - Gate status management (DRAFT → FROZEN → RELEASED)
 * - Export formats (DXF, Cut List, BOM, CNC)
 * - Safety Gate enforcement (Phase B1)
 *
 * WIRED TO:
 * - useSpecStore for gate state (DRAFT/FROZEN/RELEASED)
 * - useExportGate for Safety Gate enforcement
 * - Real export generators (buildCutListCsv, etc.)
 *
 * @version 1.1.0 - Phase B1: Gate Enforcement
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useCabinet } from '../../core/store/useCabinetStore';
import { useSpecStore, useSpecState, MACHINE_PROFILES, useMachineProfile } from '../../core/store/useSpecStore';
import { quickDxfExport } from '../../core/export/exportPipeline';
import { downloadDxfZipFromPacket, canExportDxfFromOperationGraph } from '../../core/export/dxfExportFromOperationGraph';
import type { CabinetPanel } from '../../core/types/Cabinet';
import { useExportGate, GateBlockerModal } from '../../gate/ui';
import { useFactoryPacket, PacketPreviewModal } from '../../factory/packet';
import { NestingPanel } from '../nesting/NestingPanel';
import type { NestingCompletion } from '../nesting/NestingPanel';
import { useNestingStore } from '../../core/store/useNestingStore';
import type { CutListRow } from '../../core/export/monolith/monolithExportContext';

// Validation types
interface ValidationResult {
  id: string;
  category: 'dimension' | 'structure' | 'material' | 'machine' | 'safety';
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
}

// Gate status
export type GateStatus = 'DRAFT' | 'FROZEN' | 'RELEASED';

// Export format types
type ExportFormat = 'dxf' | 'cutlist' | 'bom' | 'cnc' | 'pdf';

interface ExportOption {
  id: ExportFormat;
  name: string;
  description: string;
  icon: string;
  requiresGate: GateStatus;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { id: 'cutlist', name: 'Cut List', description: 'Panel dimensions for manual cutting', icon: '📋', requiresGate: 'DRAFT' },
  { id: 'bom', name: 'Bill of Materials', description: 'Complete material requirements', icon: '📦', requiresGate: 'DRAFT' },
  { id: 'dxf', name: 'DXF Files', description: 'CAD-ready panel drawings', icon: '📐', requiresGate: 'FROZEN' },
  { id: 'cnc', name: 'CNC Program', description: 'Machine-ready G-code', icon: '🔧', requiresGate: 'RELEASED' },
  { id: 'pdf', name: 'Production PDF', description: 'Print-ready documentation', icon: '📄', requiresGate: 'FROZEN' },
];

// Validation rules
function runValidation(cabinet: any): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!cabinet) return results;

  // Dimensional checks
  if (cabinet.dimensions.width < 300) {
    results.push({
      id: 'dim-width-min',
      category: 'dimension',
      severity: 'error',
      message: 'Width too small',
      details: `Minimum width is 300mm, current: ${cabinet.dimensions.width}mm`
    });
  }
  if (cabinet.dimensions.width > 1200) {
    results.push({
      id: 'dim-width-max',
      category: 'dimension',
      severity: 'warning',
      message: 'Width exceeds standard',
      details: `Standard max is 1200mm, current: ${cabinet.dimensions.width}mm`
    });
  }
  if (cabinet.dimensions.height > 2400) {
    results.push({
      id: 'dim-height-max',
      category: 'dimension',
      severity: 'error',
      message: 'Height exceeds machine limit',
      details: `Machine limit is 2400mm, current: ${cabinet.dimensions.height}mm`
    });
  }

  // Structural checks
  if (cabinet.structure.shelfCount > 6) {
    results.push({
      id: 'struct-shelves',
      category: 'structure',
      severity: 'warning',
      message: 'Many shelves may cause sagging',
      details: `Consider adding vertical dividers for ${cabinet.structure.shelfCount} shelves`
    });
  }

  const shelfSpacing = cabinet.dimensions.height / (cabinet.structure.shelfCount + 1);
  if (shelfSpacing < 150) {
    results.push({
      id: 'struct-spacing',
      category: 'structure',
      severity: 'warning',
      message: 'Shelf spacing too tight',
      details: `Current spacing: ${shelfSpacing.toFixed(0)}mm, minimum recommended: 150mm`
    });
  }

  // Material checks
  if (!cabinet.materials.defaultCore) {
    results.push({
      id: 'mat-core',
      category: 'material',
      severity: 'error',
      message: 'No core material selected',
      details: 'Select a core material before export'
    });
  }

  // Machine compatibility
  const panelCount = cabinet.panels?.length || 0;
  if (panelCount > 20) {
    results.push({
      id: 'machine-panels',
      category: 'machine',
      severity: 'info',
      message: 'Large panel count',
      details: `${panelCount} panels - consider batch processing`
    });
  }

  // Safety checks
  if (!cabinet.structure.hasBackPanel) {
    results.push({
      id: 'safety-back',
      category: 'safety',
      severity: 'warning',
      message: 'No back panel',
      details: 'Cabinet may lack structural rigidity'
    });
  }

  // Add success if no errors
  if (results.filter(r => r.severity === 'error').length === 0) {
    results.push({
      id: 'validation-pass',
      category: 'structure',
      severity: 'info',
      message: 'All critical checks passed',
      details: 'Cabinet is ready for export'
    });
  }

  return results;
}

// Section Component
function Section({ title, children, status }: { title: string; children: React.ReactNode; status?: 'ok' | 'warning' | 'error' }) {
  const [isOpen, setIsOpen] = useState(true);

  const statusColors = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{title}</span>
          {status && <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Validation Item
function ValidationItem({ result }: { result: ValidationResult }) {
  const severityStyles = {
    error: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '✕' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '⚠' },
    info: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'ℹ' },
  };

  const style = severityStyles[result.severity];

  return (
    <div className={`p-3 rounded-lg ${style.bg}`}>
      <div className="flex items-start gap-2">
        <span className={style.text}>{style.icon}</span>
        <div className="flex-1">
          <div className={`text-sm ${style.text}`}>{result.message}</div>
          {result.details && (
            <div className="text-xs text-zinc-500 mt-1">{result.details}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export Button
function ExportButton({
  option,
  gateStatus,
  onExport
}: {
  option: ExportOption;
  gateStatus: GateStatus;
  onExport: (format: ExportFormat) => void;
}) {
  const gateOrder: GateStatus[] = ['DRAFT', 'FROZEN', 'RELEASED'];
  const currentGateIndex = gateOrder.indexOf(gateStatus);
  const requiredGateIndex = gateOrder.indexOf(option.requiresGate);
  const isEnabled = currentGateIndex >= requiredGateIndex;

  return (
    <button
      onClick={() => isEnabled && onExport(option.id)}
      disabled={!isEnabled}
      className={`w-full p-4 rounded-lg border transition-colors text-left
        ${isEnabled
          ? 'bg-zinc-800/50 border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-800 cursor-pointer'
          : 'bg-zinc-900/50 border-zinc-800 cursor-not-allowed opacity-50'
        }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{option.icon}</span>
        <div className="flex-1">
          <div className={`text-sm font-medium ${isEnabled ? 'text-white' : 'text-zinc-500'}`}>
            {option.name}
          </div>
          <div className="text-xs text-zinc-500">{option.description}</div>
        </div>
        {!isEnabled && (
          <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
            Requires {option.requiresGate}
          </span>
        )}
      </div>
    </button>
  );
}

// Machine Profile Selector Component
function MachineProfileSelector({
  selectedId,
  onChange,
  disabled
}: {
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const profiles = Object.values(MACHINE_PROFILES);
  const selected = MACHINE_PROFILES[selectedId];

  return (
    <div className="space-y-2">
      <label className="text-xs text-zinc-400 font-medium">Target Machine</label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200
          focus:outline-none focus:border-emerald-500/50 transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name} ({profile.maxWidth}×{profile.maxHeight}mm)
          </option>
        ))}
      </select>
      {/* Machine details summary */}
      {selected && (
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {selected.manufacturer && (
            <span className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">
              {selected.manufacturer}
            </span>
          )}
          {selected.dialect && (
            <span className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">
              {selected.dialect}
            </span>
          )}
          <span>
            {selected.supportedOperations.length} operations
          </span>
        </div>
      )}
    </div>
  );
}

// Panel Selection Component for DXF Export
interface PanelExportState {
  panelId: string;
  selected: boolean;
  status: 'pending' | 'exporting' | 'done' | 'error';
}

// Panel role icons and colors
const PANEL_ROLE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  'left-side': { icon: '◧', color: 'text-blue-400', label: 'Side' },
  'right-side': { icon: '◨', color: 'text-blue-400', label: 'Side' },
  'side': { icon: '▯', color: 'text-blue-400', label: 'Side' },
  'top': { icon: '⬓', color: 'text-purple-400', label: 'Top' },
  'bottom': { icon: '⬒', color: 'text-purple-400', label: 'Bottom' },
  'shelf': { icon: '═', color: 'text-amber-400', label: 'Shelf' },
  'back': { icon: '▢', color: 'text-zinc-400', label: 'Back' },
  'divider': { icon: '│', color: 'text-cyan-400', label: 'Divider' },
  'door': { icon: '▣', color: 'text-emerald-400', label: 'Door' },
  'drawer-front': { icon: '▤', color: 'text-emerald-400', label: 'Drawer' },
  'drawer-side': { icon: '▥', color: 'text-emerald-400', label: 'Drawer' },
  'drawer-bottom': { icon: '▦', color: 'text-emerald-400', label: 'Drawer' },
  'stretcher': { icon: '―', color: 'text-zinc-500', label: 'Stretcher' },
  'default': { icon: '◻', color: 'text-zinc-400', label: 'Panel' },
};

function getPanelRoleConfig(role?: string) {
  if (!role) return PANEL_ROLE_CONFIG['default'];
  const normalized = role.toLowerCase().replace(/[_\s]+/g, '-');
  return PANEL_ROLE_CONFIG[normalized] || PANEL_ROLE_CONFIG['default'];
}

// Group panels by role category
function groupPanelsByRole(panels: CabinetPanel[]): Map<string, CabinetPanel[]> {
  const groups = new Map<string, CabinetPanel[]>();
  for (const panel of panels) {
    const config = getPanelRoleConfig(panel.role);
    const groupKey = config.label;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(panel);
  }
  return groups;
}

// Calculate total area of selected panels
function calculateSelectedArea(panels: CabinetPanel[], panelStates: Map<string, PanelExportState>): number {
  let area = 0;
  for (const panel of panels) {
    const state = panelStates.get(panel.id);
    if (state?.selected ?? true) {
      const w = panel.finishWidth || 0;
      const h = panel.finishHeight || 0;
      area += w * h;
    }
  }
  return area;
}

type RoleFilter = 'all' | 'structural' | 'drawer' | 'door' | 'back';

function PanelSelectionList({
  panels,
  panelStates,
  onToggle,
  onToggleAll,
  disabled,
}: {
  panels: CabinetPanel[];
  panelStates: Map<string, PanelExportState>;
  onToggle: (panelId: string) => void;
  onToggleAll: (selected: boolean) => void;
  disabled?: boolean;
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [showGrouped, setShowGrouped] = useState(true);

  // Filter panels by role
  const filteredPanels = useMemo(() => {
    if (roleFilter === 'all') return panels;
    return panels.filter((panel) => {
      const role = panel.role?.toLowerCase() || '';
      switch (roleFilter) {
        case 'structural':
          return ['side', 'left-side', 'right-side', 'top', 'bottom', 'shelf', 'divider'].some(r => role.includes(r.replace('-', '')));
        case 'drawer':
          return role.includes('drawer');
        case 'door':
          return role.includes('door');
        case 'back':
          return role.includes('back');
        default:
          return true;
      }
    });
  }, [panels, roleFilter]);

  const selectedCount = Array.from(panelStates.values()).filter(s => s.selected).length;
  const allSelected = selectedCount === panels.length;
  const selectedArea = calculateSelectedArea(panels, panelStates);
  const formattedArea = selectedArea >= 1000000
    ? `${(selectedArea / 1000000).toFixed(2)} m²`
    : `${(selectedArea / 1000).toFixed(1)} cm²`;

  // Group panels for display
  const groupedPanels = useMemo(() => groupPanelsByRole(filteredPanels), [filteredPanels]);

  // Handle role-based selection
  const handleSelectByRole = useCallback((groupLabel: string, selected: boolean) => {
    const panelsInGroup = groupedPanels.get(groupLabel) || [];
    for (const panel of panelsInGroup) {
      const state = panelStates.get(panel.id);
      if (state && state.selected !== selected) {
        onToggle(panel.id);
      }
    }
  }, [groupedPanels, panelStates, onToggle]);

  return (
    <div className="space-y-2">
      {/* Header with filter and controls */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-zinc-400 font-medium">Panels to Export</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrouped(!showGrouped)}
            disabled={disabled}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50 px-1"
            title={showGrouped ? 'Show flat list' : 'Group by role'}
          >
            {showGrouped ? '≡' : '☰'}
          </button>
          <button
            onClick={() => onToggleAll(!allSelected)}
            disabled={disabled}
            className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-1">
        {(['all', 'structural', 'drawer', 'door', 'back'] as RoleFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setRoleFilter(filter)}
            disabled={disabled}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${roleFilter === filter
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'
              } ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
          >
            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Panel list */}
      <div className="max-h-56 overflow-y-auto border border-zinc-700 rounded-lg">
        {showGrouped ? (
          // Grouped view
          Array.from(groupedPanels.entries()).map(([groupLabel, groupPanels]) => {
            const groupSelectedCount = groupPanels.filter(p => panelStates.get(p.id)?.selected ?? true).length;
            const allGroupSelected = groupSelectedCount === groupPanels.length;

            return (
              <div key={groupLabel} className="border-b border-zinc-800 last:border-b-0">
                {/* Group header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 sticky top-0">
                  <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                    {groupLabel} ({groupPanels.length})
                  </span>
                  <button
                    onClick={() => handleSelectByRole(groupLabel, !allGroupSelected)}
                    disabled={disabled}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                  >
                    {allGroupSelected ? 'None' : 'All'}
                  </button>
                </div>

                {/* Group panels */}
                {groupPanels.map((panel) => (
                  <PanelRow
                    key={panel.id}
                    panel={panel}
                    state={panelStates.get(panel.id)}
                    onToggle={onToggle}
                    disabled={disabled}
                  />
                ))}
              </div>
            );
          })
        ) : (
          // Flat view
          filteredPanels.map((panel) => (
            <PanelRow
              key={panel.id}
              panel={panel}
              state={panelStates.get(panel.id)}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))
        )}

        {filteredPanels.length === 0 && (
          <div className="p-4 text-center text-xs text-zinc-500">
            No panels match filter
          </div>
        )}
      </div>

      {/* Statistics footer */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{selectedCount} of {panels.length} panels</span>
        <span className="text-zinc-400">{formattedArea}</span>
      </div>
    </div>
  );
}

// Individual panel row component
function PanelRow({
  panel,
  state,
  onToggle,
  disabled,
}: {
  panel: CabinetPanel;
  state?: PanelExportState;
  onToggle: (panelId: string) => void;
  disabled?: boolean;
}) {
  const isSelected = state?.selected ?? true;
  const status = state?.status ?? 'pending';
  const config = getPanelRoleConfig(panel.role);

  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
        hover:bg-zinc-800/50 border-b border-zinc-800/50 last:border-b-0
        ${isSelected ? 'bg-zinc-800/20' : ''}
        ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(panel.id)}
        disabled={disabled}
        className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/30"
      />
      <span className={`text-base ${config.color}`} title={config.label}>
        {config.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200 truncate">
          {panel.name || panel.role || 'Panel'}
        </div>
        <div className="text-[10px] text-zinc-500 flex items-center gap-2">
          <span>{panel.finishWidth?.toFixed(0)}×{panel.finishHeight?.toFixed(0)}mm</span>
          {panel.computed?.realThickness && (
            <span className="text-zinc-600">T{panel.computed.realThickness}</span>
          )}
        </div>
      </div>
      {/* Status indicator */}
      {status === 'exporting' && (
        <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      )}
      {status === 'done' && (
        <span className="text-emerald-400 text-sm">✓</span>
      )}
      {status === 'error' && (
        <span className="text-red-400 text-sm">✕</span>
      )}
    </label>
  );
}

// DXF Export Progress Component
function DxfExportProgress({
  currentPanel,
  totalPanels,
  currentName,
  isExporting,
}: {
  currentPanel: number;
  totalPanels: number;
  currentName: string;
  isExporting: boolean;
}) {
  if (!isExporting) return null;

  const progress = totalPanels > 0 ? (currentPanel / totalPanels) * 100 : 0;

  return (
    <div className="p-4 bg-emerald-500/10 border-t border-emerald-500/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-emerald-400">Generating DXF...</span>
        <span className="text-xs text-zinc-400">
          {currentPanel}/{totalPanels}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current panel name */}
      <div className="text-xs text-zinc-400 truncate">
        {currentName}
      </div>
    </div>
  );
}

interface ExportPanelProps {
  /** @deprecated - now uses useSpecStore directly */
  gateStatus?: GateStatus;
  /** @deprecated - now uses useSpecStore directly */
  onGateChange?: (status: GateStatus) => void;
}

/**
 * Generate Cut List CSV from cabinet panels
 */
function generateCutListCsv(cabinet: any): string {
  if (!cabinet?.panels) return '';

  const headers = [
    'ROW_NO', 'PART_ID', 'NAME', 'MATERIAL', 'QTY',
    'FINISH_W', 'FINISH_H', 'CUT_W', 'CUT_H',
    'EDGE_L', 'EDGE_R', 'EDGE_T', 'EDGE_B', 'GRAIN'
  ];

  const rows = cabinet.panels.map((panel: any, idx: number) => {
    const computed = panel.computed || {};
    return [
      idx + 1,
      panel.id?.slice(0, 8) || `P${idx + 1}`,
      panel.name || panel.role,
      panel.coreMaterialId || 'MDF_18',
      1,
      panel.finishWidth?.toFixed(1) || 0,
      panel.finishHeight?.toFixed(1) || 0,
      computed.cutWidth?.toFixed(1) || panel.finishWidth?.toFixed(1) || 0,
      computed.cutHeight?.toFixed(1) || panel.finishHeight?.toFixed(1) || 0,
      panel.edges?.left || '',
      panel.edges?.right || '',
      panel.edges?.top || '',
      panel.edges?.bottom || '',
      panel.grainDirection || 'NONE'
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Download content as file
 */
function downloadFile(content: string, filename: string, mimeType: string = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportPanel({ gateStatus: _gateStatus, onGateChange: _onGateChange }: ExportPanelProps) {
  const cabinet = useCabinet();

  // Use store for gate state (P2.2 - wired to real state machine)
  const specState = useSpecState();
  const gateStatus = specState as GateStatus; // Map spec state to gate status

  // Store actions
  const freezeSpec = useSpecStore((s) => s.freezeSpec);
  const releaseSpec = useSpecStore((s) => s.releaseSpec);
  const unfreezeSpec = useSpecStore((s) => s.unfreezeSpec);

  const [_isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // DXF Export state (T008 enhancement)
  const [machineProfileId, setMachineProfileId] = useState<string>('homag-centateq');
  const [panelStates, setPanelStates] = useState<Map<string, PanelExportState>>(new Map());
  const [dxfProgress, setDxfProgress] = useState<{ current: number; total: number; name: string }>({
    current: 0,
    total: 0,
    name: '',
  });
  const [isDxfExporting, setIsDxfExporting] = useState(false);

  // Safety Gate enforcement (Phase B1)
  const exportGate = useExportGate();
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [blockerModalAction, setBlockerModalAction] = useState<'freeze' | 'release' | 'export'>('freeze');

  // Factory Packet Preview (Phase B3)
  const factoryPacket = useFactoryPacket();
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Nesting state (T027 Step 8 wiring)
  const nestingStore = useNestingStore();
  const nestingSheetsAvailable = nestingStore.nestingSheets !== null;
  // A run that dropped parts is NOT an 'ok' gate, even though it produced a
  // non-null array. A run where every part was dropped stores [] — non-null —
  // and would otherwise render a green ✓ over a layout that placed nothing.
  const nestingIncomplete = nestingStore.unplacedParts.length > 0;

  // Build CutListRow[] from cabinet panels for NestingPanel
  const cutListRows = useMemo((): CutListRow[] => {
    if (!cabinet?.panels) return [];
    return cabinet.panels.map((panel: CabinetPanel, idx: number) => {
      const computed = panel.computed || {};
      return {
        partId: panel.id?.slice(0, 8) || `P${idx + 1}`,
        cabinetId: cabinet.id || 'unknown',
        materialId: panel.coreMaterialId || 'MAT_DEFAULT',
        finishW: panel.finishWidth || 0,
        finishH: panel.finishHeight || 0,
        edgeL: panel.edges?.left ? 1 : 0,
        edgeR: panel.edges?.right ? 1 : 0,
        edgeT: panel.edges?.top ? 1 : 0,
        edgeB: panel.edges?.bottom ? 1 : 0,
        premillL: 0.5,
        premillR: 0.5,
        premillT: 0,
        premillB: 0,
        cutW: computed.cutWidth || panel.finishWidth || 0,
        cutH: computed.cutHeight || panel.finishHeight || 0,
        qty: 1,
        grain: (panel.grainDirection || 'NONE') as 'VERTICAL' | 'HORIZONTAL' | 'NONE',
      };
    });
  }, [cabinet?.id, cabinet?.panels]);

  // Handle nesting completion → store results
  // Both halves of the result go into the store. Storing `sheets` alone would
  // persist a layout that is missing parts but looks complete to every reader.
  const handleNestingComplete = useCallback((result: NestingCompletion) => {
    nestingStore.setNestingSheets(result.sheets, result.unplacedParts);
  }, []);

  // Initialize panel states when cabinet changes
  React.useEffect(() => {
    if (!cabinet?.panels) return;

    const newStates = new Map<string, PanelExportState>();
    cabinet.panels.forEach((panel: CabinetPanel) => {
      newStates.set(panel.id, {
        panelId: panel.id,
        selected: true,
        status: 'pending',
      });
    });
    setPanelStates(newStates);
  }, [cabinet?.id, cabinet?.panels?.length]);

  // Panel selection handlers
  const handlePanelToggle = useCallback((panelId: string) => {
    setPanelStates((prev) => {
      const newMap = new Map(prev);
      const state = newMap.get(panelId);
      if (state) {
        newMap.set(panelId, { ...state, selected: !state.selected });
      }
      return newMap;
    });
  }, []);

  const handlePanelToggleAll = useCallback((selected: boolean) => {
    setPanelStates((prev) => {
      const newMap = new Map(prev);
      for (const [id, state] of newMap) {
        newMap.set(id, { ...state, selected });
      }
      return newMap;
    });
  }, []);

  // Run validation
  const validationResults = useMemo(() => runValidation(cabinet), [cabinet]);

  const errorCount = validationResults.filter(r => r.severity === 'error').length;
  const warningCount = validationResults.filter(r => r.severity === 'warning').length;

  // Combined gate check: Local validation + Safety Gate (Phase B1)
  const localValidationPass = errorCount === 0;
  const safetyGatePass = exportGate.hasRun && exportGate.canFreeze;

  // canFreeze requires both local validation and Safety Gate pass
  const canFreeze = localValidationPass && safetyGatePass;
  const canRelease = localValidationPass && safetyGatePass && gateStatus === 'FROZEN';

  const overallStatus = errorCount > 0 ? 'error' :
    (exportGate.hasRun && exportGate.blockerCount > 0) ? 'error' :
      warningCount > 0 ? 'warning' : 'ok';

  // Real export handler (P2.2)
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!cabinet) return;

    setIsExporting(true);
    setExportProgress(`Generating ${format.toUpperCase()}...`);

    try {
      // Tracks whether a real export actually ran; unimplemented formats set
      // this false so we never claim a successful export (FS-B2-05).
      let exported = true;
      switch (format) {
        case 'cutlist': {
          const csv = generateCutListCsv(cabinet);
          const timestamp = new Date().toISOString().slice(0, 10);
          downloadFile(csv, `cutlist_${cabinet.id?.slice(0, 8) || 'cabinet'}_${timestamp}.csv`);
          break;
        }
        case 'bom': {
          // Generate BOM (simplified)
          const bom = JSON.stringify({
            cabinetId: cabinet.id,
            dimensions: cabinet.dimensions,
            materials: cabinet.materials,
            panelCount: cabinet.panels?.length || 0,
            computed: cabinet.computed,
            generatedAt: new Date().toISOString()
          }, null, 2);
          downloadFile(bom, `bom_${cabinet.id?.slice(0, 8) || 'cabinet'}.json`, 'application/json');
          break;
        }
        case 'dxf': {
          // AGENT-T008: DXF export via OperationGraph (manufacturing intent, NOT cabinet geometry)
          const selectedPanels = cabinet.panels?.filter((p: CabinetPanel) =>
            panelStates.get(p.id)?.selected ?? true
          ) || [];

          if (selectedPanels.length === 0) {
            alert('No panels selected for export');
            break;
          }

          setIsDxfExporting(true);
          setDxfProgress({ current: 0, total: selectedPanels.length, name: 'Generating packet...' });

          // Update panel states to exporting
          setPanelStates((prev) => {
            const newMap = new Map(prev);
            for (const panel of selectedPanels) {
              const state = newMap.get(panel.id);
              if (state) {
                newMap.set(panel.id, { ...state, status: 'exporting' });
              }
            }
            return newMap;
          });

          try {
            // Step 1: Generate factory packet preview (builds OperationGraph internally)
            const preview = await factoryPacket.generatePreview();
            if (!preview) {
              throw new Error(factoryPacket.error || 'Failed to generate factory packet');
            }

            setDxfProgress({ current: 0, total: selectedPanels.length, name: 'Building DXF from operations...' });

            // Step 2: Check if OperationGraph DXF export is available
            const availability = canExportDxfFromOperationGraph(preview.parsed.drillmap ? {
              manifest: preview.manifest,
              drillMap: preview.parsed.drillmap,
              connectors: preview.parsed.connectorsMinifix!,
              cutList: preview.parsed.cutlist!,
              gateResult: preview.parsed.gateResult!,
            } : null);

            // Resolve CNC preset ID from SpecStore profile
            const selectedProfile = MACHINE_PROFILES[machineProfileId];
            const cncMachineId = selectedProfile?.cncPresetId || 'GENERIC';

            if (!availability.available) {
              // Fallback to legacy export if OperationGraph not available
              console.warn('[DXF Export] OperationGraph not available, using legacy Cabinet export:', availability.reason);
              await quickDxfExport(cabinet, {
                includeSystem32: true,
                includeBackGroove: true,
                includeHingeCups: true,
                includeConfirmat: true,
                includeDimensions: true,
                includePartInfo: true,
                includeEdgeBanding: true,
                machineProfile: selectedProfile,
                selectedPanelIds: selectedPanels.map((p: CabinetPanel) => p.id),
                onPanelProgress: (panelId: string, panelName: string, index: number, total: number) => {
                  setDxfProgress({ current: index + 1, total, name: panelName });
                  setPanelStates((prev) => {
                    const newMap = new Map(prev);
                    const state = newMap.get(panelId);
                    if (state) {
                      newMap.set(panelId, { ...state, status: 'done' });
                    }
                    return newMap;
                  });
                },
              });
            } else {
              // Step 3: Export DXF via OperationGraph (source of truth - T008 compliant)
              const packet = {
                manifest: preview.manifest,
                drillMap: preview.parsed.drillmap!,
                connectors: preview.parsed.connectorsMinifix!,
                cutList: preview.parsed.cutlist!,
                gateResult: preview.parsed.gateResult!,
              };

              await downloadDxfZipFromPacket(packet, {
                machineId: cncMachineId,
                selectedPanelIds: selectedPanels.map((p: CabinetPanel) => p.id),
                includeMetadata: true,
                onPanelProgress: (panelId: string, panelName: string, index: number, total: number) => {
                  setDxfProgress({ current: index, total, name: panelName });

                  // Update individual panel status
                  setPanelStates((prev) => {
                    const newMap = new Map(prev);
                    const state = newMap.get(panelId);
                    if (state) {
                      newMap.set(panelId, { ...state, status: 'done' });
                    }
                    return newMap;
                  });
                },
              });
            }

            // Mark all selected panels as done
            setPanelStates((prev) => {
              const newMap = new Map(prev);
              for (const panel of selectedPanels) {
                const state = newMap.get(panel.id);
                if (state) {
                  newMap.set(panel.id, { ...state, status: 'done' });
                }
              }
              return newMap;
            });
          } catch (err) {
            console.error('[DXF Export] Error:', err);
            // Mark failed panels
            setPanelStates((prev) => {
              const newMap = new Map(prev);
              for (const panel of selectedPanels) {
                const state = newMap.get(panel.id);
                if (state && state.status === 'exporting') {
                  newMap.set(panel.id, { ...state, status: 'error' });
                }
              }
              return newMap;
            });
            throw err;
          } finally {
            setIsDxfExporting(false);
          }
          break;
        }
        case 'cnc':
        case 'pdf':
          // Not implemented yet — surface an honest status and do NOT fall
          // through to the success message below (FS-B2-05).
          await new Promise(resolve => setTimeout(resolve, 300));
          setExportProgress(`${format.toUpperCase()} export is not available yet (coming soon)`);
          exported = false;
          break;
      }

      if (exported) {
        setExportProgress(`${format.toUpperCase()} exported successfully!`);
      }
    } catch (error) {
      setExportProgress(`Export failed: ${error}`);
    }

    setTimeout(() => {
      setIsExporting(false);
      setExportProgress(null);
    }, 2000);
  }, [cabinet, machineProfileId, panelStates, factoryPacket]);

  // Gate action handler (P2.2 + Phase B1 - wired to store with Safety Gate enforcement)
  const handleGateAction = useCallback(() => {
    // Check Safety Gate blockers first (Phase B1)
    if (gateStatus === 'DRAFT') {
      if (exportGate.hasRun && exportGate.blockerCount > 0) {
        // Safety Gate has blockers - show modal
        setBlockerModalAction('freeze');
        setBlockerModalOpen(true);
        return;
      }
      if (canFreeze) {
        freezeSpec();
      }
    } else if (gateStatus === 'FROZEN') {
      if (exportGate.hasRun && exportGate.blockerCount > 0) {
        // Safety Gate has blockers - show modal
        setBlockerModalAction('release');
        setBlockerModalOpen(true);
        return;
      }
      if (canRelease) {
        releaseSpec();
      } else {
        unfreezeSpec(); // Back to DRAFT
      }
    }
  }, [gateStatus, canFreeze, canRelease, freezeSpec, releaseSpec, unfreezeSpec, exportGate]);

  return (
    <div className="h-full flex flex-col">
      {/* Gate Status */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-300">Gate Status</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium
            ${gateStatus === 'DRAFT' ? 'bg-amber-500/20 text-amber-400' : ''}
            ${gateStatus === 'FROZEN' ? 'bg-blue-500/20 text-blue-400' : ''}
            ${gateStatus === 'RELEASED' ? 'bg-emerald-500/20 text-emerald-400' : ''}
          `}>
            {gateStatus}
          </span>
        </div>

        {/* Gate Progress */}
        <div className="flex items-center gap-2 mb-4">
          {(['DRAFT', 'FROZEN', 'RELEASED'] as GateStatus[]).map((status, i) => (
            <React.Fragment key={status}>
              <div className={`flex-1 h-2 rounded-full transition-colors
                ${gateStatus === status ? 'bg-emerald-500' :
                  (['DRAFT', 'FROZEN', 'RELEASED'].indexOf(gateStatus) > i ? 'bg-emerald-500/50' : 'bg-zinc-700')
                }`}
              />
              {i < 2 && <div className="w-4" />}
            </React.Fragment>
          ))}
        </div>

        {/* Gate Action Button */}
        <button
          onClick={handleGateAction}
          disabled={gateStatus === 'RELEASED' || (gateStatus === 'DRAFT' && !canFreeze)}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors
            ${gateStatus === 'DRAFT' && canFreeze ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}
            ${gateStatus === 'FROZEN' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}
            ${gateStatus === 'RELEASED' ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : ''}
            ${gateStatus === 'DRAFT' && !canFreeze ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : ''}
          `}
        >
          {gateStatus === 'DRAFT' && (canFreeze ? 'Freeze Spec' : 'Fix Errors to Freeze')}
          {gateStatus === 'FROZEN' && 'Release for Production'}
          {gateStatus === 'RELEASED' && 'Spec Released ✓'}
        </button>

        {/* Safety Gate Status (Phase B1) */}
        {exportGate.hasRun && (
          <div className={`mt-3 p-2 rounded-lg text-xs flex items-center justify-between
            ${exportGate.blockerCount > 0
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-emerald-500/10 border border-emerald-500/30'
            }`}
          >
            <span className={exportGate.blockerCount > 0 ? 'text-red-400' : 'text-emerald-400'}>
              {exportGate.blockerCount > 0
                ? `⚠ Safety Gate: ${exportGate.blockerCount} blocker(s)`
                : '✓ Safety Gate: Passed'
              }
            </span>
            {exportGate.blockerCount > 0 && (
              <button
                onClick={exportGate.openFirstBlocker}
                className="text-red-300 hover:text-red-200 underline"
              >
                View Issues
              </button>
            )}
          </div>
        )}
        {!exportGate.hasRun && (
          <div className="mt-3 p-2 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-500">
            Safety Gate not run yet
          </div>
        )}
      </div>

      {/* Validation Results */}
      <Section title="Validation" status={overallStatus}>
        <div className="space-y-2">
          {validationResults.map((result) => (
            <ValidationItem key={result.id} result={result} />
          ))}
        </div>
      </Section>

      {/* DXF Export Options (T008 enhanced) */}
      <Section title="DXF Export" status={gateStatus === 'FROZEN' || gateStatus === 'RELEASED' ? 'ok' : 'warning'}>
        <div className="space-y-4">
          {/* Machine Profile Selector */}
          <MachineProfileSelector
            selectedId={machineProfileId}
            onChange={setMachineProfileId}
            disabled={isDxfExporting || gateStatus === 'DRAFT'}
          />

          {/* Panel Selection */}
          {cabinet?.panels && cabinet.panels.length > 0 && (
            <PanelSelectionList
              panels={cabinet.panels}
              panelStates={panelStates}
              onToggle={handlePanelToggle}
              onToggleAll={handlePanelToggleAll}
              disabled={isDxfExporting || gateStatus === 'DRAFT'}
            />
          )}

          {/* DXF Export Button */}
          <button
            onClick={() => handleExport('dxf')}
            disabled={isDxfExporting || gateStatus === 'DRAFT'}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${gateStatus !== 'DRAFT' && !isDxfExporting
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              }`}
          >
            <span className="text-lg">📐</span>
            {isDxfExporting ? 'Exporting...' : 'Generate DXF Files'}
          </button>

          {gateStatus === 'DRAFT' && (
            <p className="text-xs text-amber-400 text-center">
              ⚠️ Freeze spec to enable DXF export
            </p>
          )}
        </div>
      </Section>

      {/* DXF Export Progress */}
      <DxfExportProgress
        currentPanel={dxfProgress.current}
        totalPanels={dxfProgress.total}
        currentName={dxfProgress.name}
        isExporting={isDxfExporting}
      />

      {/* Cut Optimization / Nesting (T027) */}
      <Section
        title={`Cut Optimization${nestingSheetsAvailable ? ` (${nestingStore.nestingSheets!.length} sheets)` : ''}${nestingIncomplete ? ` — ${nestingStore.unplacedParts.length} UNPLACED` : ''}`}
        status={nestingIncomplete ? 'warning' : nestingSheetsAvailable ? 'ok' : undefined}
      >
        <div className="space-y-3">
          {cutListRows.length > 0 ? (
            <NestingPanel
              cutListRows={cutListRows}
              onNestingComplete={handleNestingComplete}
              width={320}
              height={480}
            />
          ) : (
            <p className="text-xs text-zinc-500 text-center py-4">
              No panels available for nesting optimization.
              Create a cabinet with panels first.
            </p>
          )}
          {nestingSheetsAvailable && nestingIncomplete && (
            <div
              role="alert"
              className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 space-y-1"
            >
              <div className="font-semibold">
                ✕ Nesting INCOMPLETE — {nestingStore.unplacedParts.length} part(s) could not be
                placed on any sheet.
              </div>
              <div>
                This layout is missing parts and will not be handed to the export pipeline.
                Fix the oversized parts, then re-run.
              </div>
              <div className="text-red-300/80">
                {nestingStore.unplacedParts.map((p) => p.id).join(', ')}
              </div>
            </div>
          )}
          {nestingSheetsAvailable && !nestingIncomplete && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex justify-between">
              <span>✓ Nesting: {nestingStore.nestingSheets!.length} sheet(s) optimized</span>
              <span>{nestingStore.nestingSheets!.reduce((s, sh) => s + sh.placements.length, 0)} parts placed</span>
            </div>
          )}
        </div>
      </Section>

      {/* Factory Packet (Phase B3) */}
      <Section title="Factory Packet" status={exportGate.canFreeze ? 'ok' : 'warning'}>
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            Complete manufacturing package with drill maps, cut list, connectors, and gate results.
          </p>

          {/* Preview Button */}
          <button
            onClick={async () => {
              const preview = await factoryPacket.generatePreview();
              if (preview) {
                setPreviewModalOpen(true);
              }
            }}
            disabled={factoryPacket.isPreviewing || !cabinet?.panels?.length}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${!factoryPacket.isPreviewing && cabinet?.panels?.length
                ? 'bg-purple-500 hover:bg-purple-600 text-white cursor-pointer'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              }`}
          >
            {factoryPacket.isPreviewing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Preview...
              </>
            ) : (
              <>
                <span>📦</span>
                Preview Factory Packet
              </>
            )}
          </button>

          {/* Direct Download Button */}
          <button
            onClick={() => factoryPacket.generateAndDownload()}
            disabled={factoryPacket.isGenerating || !cabinet?.panels?.length}
            className={`w-full py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2
              ${!factoryPacket.isGenerating && cabinet?.panels?.length
                ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 cursor-pointer border border-zinc-600'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
              }`}
          >
            {factoryPacket.isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <span>⬇</span>
                Download ZIP Directly
              </>
            )}
          </button>

          {/* Error Display */}
          {factoryPacket.error && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {factoryPacket.error}
            </div>
          )}

          {/* Last Result Info */}
          {factoryPacket.lastResult && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex justify-between">
              <span>✓ Last export: {factoryPacket.lastResult.filename}</span>
              <span>{(factoryPacket.lastResult.compressedSize / 1024).toFixed(1)} KB</span>
            </div>
          )}
        </div>
      </Section>

      {/* Export Options */}
      <Section title="Other Exports">
        <div className="space-y-2">
          {EXPORT_OPTIONS.filter(o => o.id !== 'dxf').map((option) => (
            <ExportButton
              key={option.id}
              option={option}
              gateStatus={gateStatus}
              onExport={handleExport}
            />
          ))}
        </div>
      </Section>

      {/* Export Progress */}
      {exportProgress && (
        <div className="p-4 bg-emerald-500/10 border-t border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
            <span className="text-sm text-emerald-400">{exportProgress}</span>
          </div>
        </div>
      )}

      {/* Safety Gate Blocker Modal (Phase B1) */}
      <GateBlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        attemptedAction={blockerModalAction}
      />

      {/* Factory Packet Preview Modal (Phase B3) */}
      <PacketPreviewModal
        open={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false);
          factoryPacket.clearPreview();
        }}
        preview={factoryPacket.lastPreview}
        onDownload={async () => {
          await factoryPacket.downloadPreview();
          setPreviewModalOpen(false);
        }}
        isDownloading={factoryPacket.isGenerating}
      />
    </div>
  );
}

export default ExportPanel;

/**
 * ConnectorList — Sidebar list of Minifix connector assemblies grouped by junction.
 *
 * Structure:
 *   Junction (cornerType) e.g. "Top — Left Side"
 *     └── ConnectorSet (Front / Center / Back)
 *           ├── Header: position label + @sys32mm + action buttons
 *           └── Component list (vertical): Minifix S200 / Dowel
 *
 * Action buttons per set:
 *   - Hide Hardware: toggle 3D hardware model visibility
 *   - Hide Label: toggle drill label/annotation visibility
 *   - Add / Del: add or remove connector sets at junction
 *
 * Data source: useDrillMapStore.drillMap
 */

import { useMemo, useState, useCallback } from 'react';
import { create } from 'zustand';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import type { DrillMap, DrillMapPoint, DrillStatus } from '../../core/manufacturing/drillMap/types';

// ============================================
// CONNECTOR VISIBILITY STORE
// ============================================

interface ConnectorVisibilityState {
  /** Set of pairKeyV2 keys whose 3D hardware is hidden */
  hiddenHardware: Set<string>;
  /** Set of pairKeyV2 keys whose labels are hidden */
  hiddenLabels: Set<string>;
  /** Set of pairKeyV2 keys whose drill overlay (ellipses/leader lines) is hidden */
  hiddenDrillOverlay: Set<string>;
  toggleHardware: (key: string) => void;
  toggleLabel: (key: string) => void;
  toggleDrillOverlay: (key: string) => void;
  /** Batch toggle: if ALL keys are hidden → show all, otherwise hide all */
  toggleHardwareBatch: (keys: string[]) => void;
  toggleLabelBatch: (keys: string[]) => void;
  toggleDrillOverlayBatch: (keys: string[]) => void;
  isHardwareHidden: (key: string) => boolean;
  isLabelHidden: (key: string) => boolean;
  isDrillOverlayHidden: (key: string) => boolean;
}

export const useConnectorVisibilityStore = create<ConnectorVisibilityState>((set, get) => ({
  hiddenHardware: new Set(),
  hiddenLabels: new Set(),
  hiddenDrillOverlay: new Set(),
  toggleHardware: (key) => set((s) => {
    const next = new Set(s.hiddenHardware);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { hiddenHardware: next };
  }),
  toggleLabel: (key) => set((s) => {
    const next = new Set(s.hiddenLabels);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { hiddenLabels: next };
  }),
  toggleDrillOverlay: (key) => set((s) => {
    const next = new Set(s.hiddenDrillOverlay);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { hiddenDrillOverlay: next };
  }),
  toggleHardwareBatch: (keys) => set((s) => {
    const next = new Set(s.hiddenHardware);
    const allHidden = keys.every(k => next.has(k));
    if (allHidden) { keys.forEach(k => next.delete(k)); }
    else { keys.forEach(k => next.add(k)); }
    return { hiddenHardware: next };
  }),
  toggleLabelBatch: (keys) => set((s) => {
    const next = new Set(s.hiddenLabels);
    const allHidden = keys.every(k => next.has(k));
    if (allHidden) { keys.forEach(k => next.delete(k)); }
    else { keys.forEach(k => next.add(k)); }
    return { hiddenLabels: next };
  }),
  toggleDrillOverlayBatch: (keys) => set((s) => {
    const next = new Set(s.hiddenDrillOverlay);
    const allHidden = keys.every(k => next.has(k));
    if (allHidden) { keys.forEach(k => next.delete(k)); }
    else { keys.forEach(k => next.add(k)); }
    return { hiddenDrillOverlay: next };
  }),
  isHardwareHidden: (key) => get().hiddenHardware.has(key),
  isLabelHidden: (key) => get().hiddenLabels.has(key),
  isDrillOverlayHidden: (key) => get().hiddenDrillOverlay.has(key),
}));

// ============================================
// TYPES
// ============================================

interface ConnectorSet {
  key: string;
  cornerType: string;
  points: DrillMapPoint[];
  status: DrillStatus;
  sys32Pos: number | null;
  positionLabel: string;
  isWidthAxis: boolean;
}

interface Junction {
  cornerType: string;
  displayName: string;
  sets: ConnectorSet[];
  status: DrillStatus;
}

// ============================================
// DATA HELPERS
// ============================================

function worstStatus(points: DrillMapPoint[]): DrillStatus {
  let worst: DrillStatus = 'VALID';
  for (const p of points) {
    if (p.status === 'ERROR') return 'ERROR';
    if (p.status === 'WARNING') worst = 'WARNING';
  }
  return worst;
}

function parseSys32(pairKey: string): number | null {
  const match = pairKey.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function isBRun(pairKey: string): boolean {
  return pairKey.includes('-B-');
}

function isMinifixSet(points: DrillMapPoint[]): boolean {
  return points.some(p =>
    p.purpose === 'CAM_LOCK' || p.purpose === 'MINIFIX' ||
    p.purpose === 'BOLT' || p.purpose === 'BOLT_ENTRY' || p.purpose === 'BOLT_THREAD'
  );
}

/**
 * Extract the BASE pairKeyV2 (strip dowel suffixes).
 *
 * Dowel pairKeyV2 examples:
 *   "pair2-TOP_LEFT-50-dowel-side"       → "pair2-TOP_LEFT-50"
 *   "pair2-TOP_LEFT-50-dowel-horiz"      → "pair2-TOP_LEFT-50"
 *   "pair2-TOP_LEFT-B-37-dowel-brun-side"  → "pair2-TOP_LEFT-B-37"
 *   "pair2-TOP_LEFT-B-37-dowel-brun-horiz" → "pair2-TOP_LEFT-B-37"
 *
 * Non-dowel keys pass through unchanged:
 *   "pair2-TOP_LEFT-50" → "pair2-TOP_LEFT-50"
 */
function basePairKey(pairKeyV2: string): string {
  // Strip all dowel suffixes:
  //   -dowel-side, -dowel-horiz, -dowel-shelf, -dowel-back
  //   -dowel-brun-side, -dowel-brun-horiz
  return pairKeyV2.replace(/-dowel-(brun-)?(side|horiz|shelf|back)$/, '');
}

/**
 * Map cornerType to the group key used in connectorCountOverrides.
 * TOP/BOTTOM corners → "main", SHELF_N → "shelf_N", BACK → "back"
 */
function cornerToGroupKey(corner: string): string {
  if (['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'].includes(corner)) return 'main';
  const shelfMatch = corner.match(/^SHELF_(\d+)_(LEFT|RIGHT)$/);
  if (shelfMatch) return `shelf_${shelfMatch[1]}`;
  if (corner === 'BACK_LEFT' || corner === 'BACK_RIGHT') return 'back';
  return corner;
}

function junctionDisplayName(corner: string): string {
  const map: Record<string, string> = {
    TOP_LEFT: 'Top — Left Side',
    TOP_RIGHT: 'Top — Right Side',
    BOTTOM_LEFT: 'Bottom — Left Side',
    BOTTOM_RIGHT: 'Bottom — Right Side',
    BACK_LEFT: 'Back — Left Side',
    BACK_RIGHT: 'Back — Right Side',
  };
  if (map[corner]) return map[corner];
  const m = corner.match(/^SHELF_(\d+)_(LEFT|RIGHT)$/);
  if (m) return `Shelf ${parseInt(m[1], 10) + 1} — ${m[2] === 'LEFT' ? 'Left Side' : 'Right Side'}`;
  return corner;
}

function junctionSortOrder(corner: string): number {
  if (corner === 'TOP_LEFT') return 10;
  if (corner === 'TOP_RIGHT') return 11;
  if (corner === 'BOTTOM_LEFT') return 20;
  if (corner === 'BOTTOM_RIGHT') return 21;
  const m = corner.match(/^SHELF_(\d+)_(LEFT|RIGHT)$/);
  if (m) return 30 + parseInt(m[1], 10) * 2 + (m[2] === 'LEFT' ? 0 : 1);
  if (corner === 'BACK_LEFT') return 90;
  if (corner === 'BACK_RIGHT') return 91;
  return 100;
}

function assignPositionLabels(sets: ConnectorSet[]): void {
  const n = sets.length;
  if (n === 0) return;
  if (n === 1) { sets[0].positionLabel = 'Center'; return; }
  if (n === 2) { sets[0].positionLabel = 'Front'; sets[1].positionLabel = 'Back'; return; }
  if (n === 3) { sets[0].positionLabel = 'Front'; sets[1].positionLabel = 'Center'; sets[2].positionLabel = 'Back'; return; }
  sets[0].positionLabel = 'Front';
  sets[n - 1].positionLabel = 'Back';
  for (let i = 1; i < n - 1; i++) sets[i].positionLabel = `Mid-${i}`;
}

function buildJunctions(drillMap: DrillMap): Junction[] {
  const allPoints = drillMap.panels.flatMap(p => p.points);
  const setMap = new Map<string, DrillMapPoint[]>();

  for (const point of allPoints) {
    if (point.pairKeyV2) {
      // Group by BASE pairKeyV2 — merges dowel variants with their parent Minifix set
      // e.g. "pair2-TOP_LEFT-50-dowel-side" groups with "pair2-TOP_LEFT-50"
      const key = basePairKey(point.pairKeyV2);
      const existing = setMap.get(key) ?? [];
      existing.push(point);
      setMap.set(key, existing);
    } else if (point.pairId && ['BOLT', 'BOLT_ENTRY', 'BOLT_THREAD', 'CAM_LOCK', 'MINIFIX', 'DOWEL'].includes(point.purpose)) {
      const key = `pair:${point.pairId}`;
      const existing = setMap.get(key) ?? [];
      existing.push(point);
      setMap.set(key, existing);
    }
  }

  const connectorSets: ConnectorSet[] = [];
  for (const [key, points] of setMap) {
    if (!isMinifixSet(points)) continue;
    connectorSets.push({
      key,
      cornerType: points[0].cornerType ?? 'UNKNOWN',
      points,
      status: worstStatus(points),
      sys32Pos: parseSys32(key),
      positionLabel: '',
      isWidthAxis: isBRun(key),
    });
  }

  const junctionMap = new Map<string, ConnectorSet[]>();
  for (const cs of connectorSets) {
    const existing = junctionMap.get(cs.cornerType) ?? [];
    existing.push(cs);
    junctionMap.set(cs.cornerType, existing);
  }

  const junctions: Junction[] = [];
  for (const [corner, sets] of junctionMap) {
    const aRun = sets.filter(s => !s.isWidthAxis).sort((a, b) => (a.sys32Pos ?? 0) - (b.sys32Pos ?? 0));
    const bRun = sets.filter(s => s.isWidthAxis).sort((a, b) => (a.sys32Pos ?? 0) - (b.sys32Pos ?? 0));
    assignPositionLabels(aRun);
    assignPositionLabels(bRun);
    for (const s of bRun) s.positionLabel = s.positionLabel + ' (W)';
    const allSets = [...aRun, ...bRun];
    junctions.push({
      cornerType: corner,
      displayName: junctionDisplayName(corner),
      sets: allSets,
      status: worstStatus(allSets.flatMap(s => s.points)),
    });
  }

  junctions.sort((a, b) => junctionSortOrder(a.cornerType) - junctionSortOrder(b.cornerType));
  return junctions;
}

// ============================================
// DISPLAY HELPERS
// ============================================

function statusDotColor(status: DrillStatus): string {
  switch (status) {
    case 'VALID': return 'bg-green-500';
    case 'WARNING': return 'bg-yellow-500';
    case 'ERROR': return 'bg-red-500';
  }
}

function posLabelColor(label: string): string {
  if (label.startsWith('Front')) return 'text-cyan-400';
  if (label.startsWith('Center')) return 'text-amber-400';
  if (label.startsWith('Back')) return 'text-rose-400';
  return 'text-gray-400';
}

/** Build vertical component list based on position */
interface ComponentItem {
  label: string;
  color: string;
  bgColor: string;
}

function buildComponentList(points: DrillMapPoint[], positionLabel: string): ComponentItem[] {
  const camPoint = points.find(p => p.purpose === 'CAM_LOCK' || p.purpose === 'MINIFIX');
  const thickness = camPoint?.panelThickness ?? 18;
  const hasDowel = points.some(p => p.purpose === 'DOWEL');

  const minifix: ComponentItem = {
    label: `Minifix S200 (${thickness}mm)`,
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/10',
  };
  const dowel: ComponentItem = {
    label: 'Dowel',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/10',
  };

  const pos = positionLabel.replace(' (W)', '');

  if (!hasDowel) return [minifix];
  if (pos === 'Front') return [minifix, dowel];
  if (pos === 'Back') return [dowel, minifix];
  return [dowel, minifix, dowel]; // Center
}

// ============================================
// ICON COMPONENTS (small inline SVGs)
// ============================================

function EyeIcon({ crossed }: { crossed: boolean }) {
  if (crossed) {
    return (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

/** Drill overlay icon — small circle with crosshair (represents bore) */
function DrillIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      {/* Outer bore circle */}
      <circle cx="12" cy="12" r="7" />
      {/* Crosshair lines */}
      <line x1="12" y1="5" x2="12" y2="8" />
      <line x1="12" y1="16" x2="12" y2="19" />
      <line x1="5" y1="12" x2="8" y2="12" />
      <line x1="16" y1="12" x2="19" y2="12" />
      {/* Cross-out line when hidden */}
      {crossed && <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2.5} />}
    </svg>
  );
}

// ============================================
// SMALL ACTION BUTTON
// ============================================

function ActionBtn({
  title,
  active,
  activeColor = 'text-gray-500',
  inactiveColor = 'text-gray-700 hover:text-gray-400',
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-0.5 rounded transition-colors duration-150
        ${active ? activeColor : inactiveColor}`}
    >
      {children}
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ConnectorList() {
  const drillMap = useDrillMapStore((s) => s.drillMap);

  const junctions = useMemo(() => {
    if (!drillMap) return [];
    return buildJunctions(drillMap);
  }, [drillMap]);

  if (!drillMap || junctions.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 text-center py-2">
        Enable X-Ray mode to see connectors
      </div>
    );
  }

  const totalSets = junctions.reduce((sum, j) => sum + j.sets.length, 0);

  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-gray-500 px-1 pb-1">
        {junctions.length} junctions · {totalSets} minifix sets
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {junctions.map((junction) => (
          <JunctionGroup key={junction.cornerType} junction={junction} />
        ))}
      </div>
    </div>
  );
}

// ============================================
// JUNCTION GROUP
// ============================================

function JunctionGroup({ junction }: { junction: Junction }) {
  const [expanded, setExpanded] = useState(true);
  const setConnectorCountOverride = useDrillMapStore((s) => s.setConnectorCountOverride);
  const toggleHardwareBatch = useConnectorVisibilityStore((s) => s.toggleHardwareBatch);
  const toggleLabelBatch = useConnectorVisibilityStore((s) => s.toggleLabelBatch);
  const toggleDrillOverlayBatch = useConnectorVisibilityStore((s) => s.toggleDrillOverlayBatch);
  const hiddenHardware = useConnectorVisibilityStore((s) => s.hiddenHardware);
  const hiddenLabels = useConnectorVisibilityStore((s) => s.hiddenLabels);
  const hiddenDrillOverlay = useConnectorVisibilityStore((s) => s.hiddenDrillOverlay);

  const groupKey = cornerToGroupKey(junction.cornerType);
  const currentCount = junction.sets.length;
  const setKeys = useMemo(() => junction.sets.map(s => s.key), [junction.sets]);

  // Junction-level state: all hidden?
  const allHwHidden = setKeys.length > 0 && setKeys.every(k => hiddenHardware.has(k));
  const allLblHidden = setKeys.length > 0 && setKeys.every(k => hiddenLabels.has(k));
  const allDrillHidden = setKeys.length > 0 && setKeys.every(k => hiddenDrillOverlay.has(k));

  const handleToggleAllHw = useCallback(() => {
    toggleHardwareBatch(setKeys);
  }, [setKeys, toggleHardwareBatch]);

  const handleToggleAllLbl = useCallback(() => {
    toggleLabelBatch(setKeys);
  }, [setKeys, toggleLabelBatch]);

  const handleToggleAllDrill = useCallback(() => {
    toggleDrillOverlayBatch(setKeys);
  }, [setKeys, toggleDrillOverlayBatch]);

  const handleAddSet = useCallback(() => {
    setConnectorCountOverride(groupKey, currentCount + 1);
  }, [groupKey, currentCount, setConnectorCountOverride]);

  const handleRemoveSet = useCallback(() => {
    if (currentCount > 1) {
      setConnectorCountOverride(groupKey, currentCount - 1);
    }
  }, [groupKey, currentCount, setConnectorCountOverride]);

  return (
    <div className="rounded border border-[#2a2a2a]">
      {/* Junction header */}
      <div className="flex items-center bg-surface-1 hover:bg-surface-2 transition-colors duration-150 rounded-t">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-1.5 px-2 py-1 text-left"
        >
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColor(junction.status)}`} />
          <svg className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="text-[10px] font-medium text-gray-300">
            {junction.displayName}
          </span>
          <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1.5 rounded-full ml-auto">
            {junction.sets.length} sets
          </span>
          <svg
            className={`w-3 h-3 text-gray-600 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Junction-level hide toggles */}
        <div className="flex items-center gap-0.5 pr-2">
          <ActionBtn
            title={allHwHidden ? 'Show All Hardware' : 'Hide All Hardware'}
            active={allHwHidden}
            activeColor="text-red-400"
            onClick={handleToggleAllHw}
          >
            <EyeIcon crossed={allHwHidden} />
          </ActionBtn>
          <ActionBtn
            title={allLblHidden ? 'Show All Labels' : 'Hide All Labels'}
            active={allLblHidden}
            activeColor="text-red-400"
            onClick={handleToggleAllLbl}
          >
            <span className="text-[7px] font-bold leading-none block w-3 h-3 flex items-center justify-center">
              {allLblHidden ? '🅛' : 'L'}
            </span>
          </ActionBtn>
          <ActionBtn
            title={allDrillHidden ? 'Show All Drill Overlay' : 'Hide All Drill Overlay'}
            active={allDrillHidden}
            activeColor="text-red-400"
            onClick={handleToggleAllDrill}
          >
            <DrillIcon crossed={allDrillHidden} />
          </ActionBtn>
        </div>
      </div>

      {/* Connector set rows */}
      {expanded && (
        <div className="divide-y divide-[#222]">
          {junction.sets.map((cs) => (
            <ConnectorSetRow
              key={cs.key}
              set={cs}
              onAdd={handleAddSet}
              onRemove={handleRemoveSet}
              currentCount={currentCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// CONNECTOR SET ROW
// ============================================

function ConnectorSetRow({ set, onAdd, onRemove, currentCount }: {
  set: ConnectorSet;
  onAdd: () => void;
  onRemove: () => void;
  currentCount: number;
}) {
  const toggleHardware = useConnectorVisibilityStore((s) => s.toggleHardware);
  const toggleLabel = useConnectorVisibilityStore((s) => s.toggleLabel);
  const toggleDrillOverlay = useConnectorVisibilityStore((s) => s.toggleDrillOverlay);
  const hiddenHardware = useConnectorVisibilityStore((s) => s.hiddenHardware);
  const hiddenLabels = useConnectorVisibilityStore((s) => s.hiddenLabels);
  const hiddenDrillOverlay = useConnectorVisibilityStore((s) => s.hiddenDrillOverlay);

  const hwHidden = hiddenHardware.has(set.key);
  const lblHidden = hiddenLabels.has(set.key);
  const drillHidden = hiddenDrillOverlay.has(set.key);

  const components = buildComponentList(set.points, set.positionLabel);

  const handleToggleHw = useCallback(() => toggleHardware(set.key), [set.key, toggleHardware]);
  const handleToggleLbl = useCallback(() => toggleLabel(set.key), [set.key, toggleLabel]);
  const handleToggleDrill = useCallback(() => toggleDrillOverlay(set.key), [set.key, toggleDrillOverlay]);

  return (
    <div className="px-2 py-1.5 hover:bg-surface-2 transition-colors duration-150">
      {/* Header: position + sys32 + action buttons */}
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-1 h-1 rounded-full flex-shrink-0 ${statusDotColor(set.status)}`} />

        {/* Position label */}
        <span className={`text-[10px] font-semibold ${posLabelColor(set.positionLabel)}`}>
          {set.positionLabel}
        </span>

        {/* Sys32 position */}
        {set.sys32Pos !== null && (
          <span className="text-[8px] font-mono text-gray-600">
            @{set.sys32Pos}mm
          </span>
        )}

        {/* Action buttons (right side) */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* Hide Hardware */}
          <ActionBtn
            title={hwHidden ? 'Show Hardware' : 'Hide Hardware'}
            active={hwHidden}
            activeColor="text-red-400"
            onClick={handleToggleHw}
          >
            <EyeIcon crossed={hwHidden} />
          </ActionBtn>

          {/* Hide Label */}
          <ActionBtn
            title={lblHidden ? 'Show Label' : 'Hide Label'}
            active={lblHidden}
            activeColor="text-red-400"
            onClick={handleToggleLbl}
          >
            <span className="text-[7px] font-bold leading-none block w-3 h-3 flex items-center justify-center">
              {lblHidden ? '🅛' : 'L'}
            </span>
          </ActionBtn>

          {/* Hide Drill Overlay */}
          <ActionBtn
            title={drillHidden ? 'Show Drill Overlay' : 'Hide Drill Overlay'}
            active={drillHidden}
            activeColor="text-red-400"
            onClick={handleToggleDrill}
          >
            <DrillIcon crossed={drillHidden} />
          </ActionBtn>

          {/* Add/Del: only on non-Front/Back positions (Center, Mid-1, Mid-2, ...) */}
          {!set.positionLabel.startsWith('Front') && !set.positionLabel.startsWith('Back') && (
            <>
              <ActionBtn
                title="Add connector set"
                onClick={onAdd}
                inactiveColor="text-green-800 hover:text-green-400"
              >
                <PlusIcon />
              </ActionBtn>
              {currentCount > 2 && (
                <ActionBtn
                  title="Remove connector set"
                  onClick={onRemove}
                  inactiveColor="text-gray-700 hover:text-red-400"
                >
                  <TrashIcon />
                </ActionBtn>
              )}
            </>
          )}
        </div>
      </div>

      {/* Vertical component list */}
      <div className="pl-3 space-y-0.5">
        {components.map((comp, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {/* Vertical line connector */}
            <div className="w-2 flex flex-col items-center">
              {i === 0 && components.length > 1 && (
                <div className="w-px h-2 bg-gray-700" />
              )}
              <div className="w-1.5 h-1.5 rounded-full border border-gray-600 bg-surface-1" />
              {i < components.length - 1 && (
                <div className="w-px h-2 bg-gray-700" />
              )}
            </div>
            {/* Component badge */}
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${comp.color} ${comp.bgColor}`}>
              {comp.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

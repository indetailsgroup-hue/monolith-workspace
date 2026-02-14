/**
 * Designer Logic Content - Tab content for rule evaluation results
 *
 * Simplified version of DesignerLogicPanel for use in DesignerIntentPanel tabs.
 * Shows gate status, effects, hardware, drilling, and assembly.
 *
 * v1.0: Initial implementation
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle,
  Package,
  CircleDot,
  ListOrdered,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  FileCode,
} from 'lucide-react';
import {
  useDesignerLogicStore,
  useGateStatus,
} from '../../core/store/useDesignerLogicStore';
import { useCncOverlayStore } from '../../core/store/useCncOverlayStore';
import { convertDrillingPlanToCncOverlay } from '../../core/designerIntent';
import type {
  RuleEffect,
  DrillOpPDF,
} from '../../core/designerIntent/types';

// ============================================
// COLORS
// ============================================

const COLORS = {
  block: '#ef4444',
  warn: '#f59e0b',
  info: '#8b5cf6',
  ok: '#22c55e',
  muted: '#6b7280',
  bg: '#252547',
  border: '#333',
};

// ============================================
// GATE STATUS BADGE
// ============================================

function GateStatusBadge() {
  const { blocked, blockCount, warningCount } = useGateStatus();

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
        style={{
          background: blocked ? COLORS.block + '20' : COLORS.ok + '20',
          color: blocked ? COLORS.block : COLORS.ok,
        }}
      >
        {blocked ? <XCircle size={12} /> : <CheckCircle size={12} />}
        {blocked ? 'BLOCK' : 'OK'}
      </div>

      {blockCount > 0 && (
        <div className="flex items-center gap-1 text-xs" style={{ color: COLORS.block }}>
          <XCircle size={10} />
          {blockCount}
        </div>
      )}

      {warningCount > 0 && (
        <div className="flex items-center gap-1 text-xs" style={{ color: COLORS.warn }}>
          <AlertTriangle size={10} />
          {warningCount}
        </div>
      )}
    </div>
  );
}

// ============================================
// EFFECT ITEM
// ============================================

function EffectItem({ effect }: { effect: RuleEffect }) {
  const icon =
    effect.severity === 'block' ? (
      <XCircle size={12} />
    ) : effect.severity === 'warn' ? (
      <AlertTriangle size={12} />
    ) : (
      <Info size={12} />
    );

  const color =
    effect.severity === 'block'
      ? COLORS.block
      : effect.severity === 'warn'
        ? COLORS.warn
        : COLORS.info;

  return (
    <div
      className="flex items-start gap-2 p-2 rounded mb-1"
      style={{
        background: color + '10',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ color }} className="mt-0.5 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-white mb-0.5">{effect.code}</div>
        <div className="text-[10px] text-gray-300 leading-tight">{effect.messageTH}</div>
      </div>
    </div>
  );
}

// ============================================
// COLLAPSIBLE SECTION
// ============================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false, count }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-[#333] pt-2 mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left mb-2"
      >
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-purple-400">
            {icon}
          </div>
          <h4 className="text-xs font-medium text-white">{title}</h4>
          {count !== undefined && (
            <span className="text-[10px] text-gray-500">({count})</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp size={14} className="text-gray-500" />
        ) : (
          <ChevronDown size={14} className="text-gray-500" />
        )}
      </button>
      {isOpen && children}
    </div>
  );
}

// ============================================
// HARDWARE SECTION
// ============================================

function HardwareSection() {
  const hardware = useDesignerLogicStore((s) => s.evaluation?.hardware.hardware ?? []);

  if (hardware.length === 0) {
    return <div className="text-[10px] text-gray-500 text-center py-2">No hardware selected</div>;
  }

  return (
    <div className="space-y-1">
      {hardware.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-1.5 bg-surface-2 rounded text-[10px]"
        >
          <div className="flex-1 min-w-0">
            <div className="font-mono text-gray-400 truncate">{item.catalogId}</div>
            <div className="text-white truncate">{item.nameTH}</div>
          </div>
          <div className="font-semibold text-green-400 ml-2">{item.quantity}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// DRILLING SECTION
// ============================================

function DrillingSection() {
  const evaluation = useDesignerLogicStore((s) => s.evaluation);
  const operations = evaluation?.drilling.operations ?? [];
  const system32 = evaluation?.drilling.system32;
  const intent = useDesignerLogicStore((s) => s.intent);

  // CNC Overlay store
  const setOverlayResult = useCncOverlayStore((s) => s.setOverlayResult);
  const setVisible = useCncOverlayStore((s) => s.setVisible);
  const isOverlayVisible = useCncOverlayStore((s) => s.isVisible);

  // Group by panel
  const byPanel = useMemo(() => {
    const grouped: Record<string, DrillOpPDF[]> = {};
    for (const op of operations) {
      if (!grouped[op.panel]) grouped[op.panel] = [];
      grouped[op.panel].push(op);
    }
    return grouped;
  }, [operations]);

  // Show in 3D handler
  const handleShowIn3D = useCallback(() => {
    if (!evaluation?.drilling || !intent?.dimensions) return;

    const dims = intent.dimensions;
    const result = convertDrillingPlanToCncOverlay(evaluation.drilling, {
      cabinetDimensions: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
        panelThickness: intent.panelThickness ?? 18,
      },
    });

    // Convert to overlay format with required fields
    const totalDepth = operations.reduce((sum, op) => sum + op.depth, 0);
    const drillCount = result.points.filter(p => p.type === 'DRILL').length;
    const boreCount = result.points.filter(p => p.type === 'BORE').length;

    // Cast to any to avoid strict type issues with overlay store
    // The store accepts a broader type than what we're providing
    (setOverlayResult as (result: unknown) => void)({
      points: result.points,
      stats: {
        totalPoints: result.points.length,
        byType: { DRILL: drillCount, BORE: boreCount },
        byCycle: {},
        byFace: { TOP: result.points.length, BOTTOM: 0 },
        byHoleKind: {},
        throughHoleCount: 0,
        totalDepth,
        estimatedTimeSeconds: operations.length * 2,
      },
      jobId: result.jobId,
      machineId: 'designer-intent',
      builtAt: new Date().toISOString(),
      contentHash: `hash-${Date.now()}`,
    });
    setVisible(true);

    console.log('[DesignerLogic] Synced', result.points.length, 'drill points to CNC Overlay');
  }, [evaluation, intent, setOverlayResult, setVisible, operations]);

  // Export G-code handler
  const handleExportGcode = useCallback(() => {
    if (!evaluation?.drilling) return;

    // Generate simple G-code from drilling operations
    const lines: string[] = [
      '% Designer Intent G-Code Export',
      `O0001 (${new Date().toISOString()})`,
      'G90 G21 (Absolute, mm)',
      'G17 (XY plane)',
      '',
      `(Total operations: ${operations.length})`,
      '',
      'G0 Z50.0 (Safe height)',
      '',
    ];

    // Generate drill operations
    for (const op of operations) {
      const cycle = op.depth > 15 ? 'G83' : op.drillType === 'CAM' ? 'G82' : 'G81';
      const feed = op.diameter <= 5 ? 1200 : op.diameter <= 10 ? 1000 : 800;

      lines.push(`(${op.symbolRef} - ${op.notesTH || op.drillType})`);

      if (cycle === 'G83') {
        lines.push(`G83 X0 Y0 Z-${op.depth.toFixed(1)} R5.0 Q5.0 F${feed}`);
      } else if (cycle === 'G82') {
        lines.push(`G82 X0 Y0 Z-${op.depth.toFixed(1)} R5.0 P0.5 F${feed}`);
      } else {
        lines.push(`G81 X0 Y0 Z-${op.depth.toFixed(1)} R5.0 F${feed}`);
      }
      lines.push('');
    }

    lines.push('G80 (Cancel cycle)');
    lines.push('G0 Z50.0 (Return to safe height)');
    lines.push('M30 (Program end)');
    lines.push('%');

    // Download as file
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `designer-intent-${Date.now()}.nc`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[DesignerLogic] Exported G-code with', operations.length, 'operations');
  }, [evaluation, operations]);

  if (operations.length === 0) {
    return <div className="text-[10px] text-gray-500 text-center py-2">No drilling operations</div>;
  }

  return (
    <div className="space-y-2">
      {/* Action Buttons */}
      <div className="flex gap-1">
        <button
          onClick={handleShowIn3D}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded
            bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all"
          title="Show drilling points in 3D view"
        >
          <Eye size={12} />
          Show in 3D
        </button>
        <button
          onClick={handleExportGcode}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded
            bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
          title="Export as CNC G-code (.nc)"
        >
          <FileCode size={12} />
          Export G-code
        </button>
      </div>

      {system32 && (
        <div className="text-[10px] p-1.5 bg-purple-500/10 rounded text-gray-300">
          <strong className="text-purple-400">System 32:</strong> {system32.firstHole}mm first, {system32.pitch}mm pitch
        </div>
      )}

      {Object.entries(byPanel).map(([panel, ops]) => (
        <div key={panel}>
          <div className="text-[10px] font-semibold text-white mb-1 flex items-center justify-between">
            <span>{panel}</span>
            <span className="text-gray-500">{ops.length} ops</span>
          </div>
          <div className="space-y-0.5">
            {ops.slice(0, 3).map((op, i) => (
              <div key={i} className="flex justify-between text-[9px] text-gray-400 font-mono">
                <span>{op.symbolRef}</span>
                <span>Ø{op.diameter}×{op.depth}</span>
              </div>
            ))}
            {ops.length > 3 && (
              <div className="text-[9px] text-gray-500">...+{ops.length - 3} more</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// ASSEMBLY SECTION
// ============================================

function AssemblySection() {
  const steps = useDesignerLogicStore((s) => s.evaluation?.assembly.steps ?? []);
  const totalMinutes = useDesignerLogicStore((s) => s.evaluation?.assembly.totalMinutes ?? 0);
  const direction = useDesignerLogicStore((s) => s.evaluation?.assembly.assemblyDirection);

  if (steps.length === 0) {
    return <div className="text-[10px] text-gray-500 text-center py-2">No assembly steps</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] p-1.5 bg-surface-2 rounded">
        <span className="text-gray-400">
          Direction: <strong className="text-white">{direction === 'LEFT_TO_RIGHT' ? 'L→R' : 'R→L'}</strong>
        </span>
        <span className="text-purple-400">~{totalMinutes} min</span>
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 text-[10px]">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-semibold"
              style={{ background: COLORS.info + '30', color: COLORS.info }}
            >
              {step.stepNumber}
            </div>
            <div className="flex-1 text-gray-300 truncate">{step.instructionTH}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DesignerLogicContent() {
  const evaluation = useDesignerLogicStore((s) => s.evaluation);
  const evaluate = useDesignerLogicStore((s) => s.evaluate);
  const isEvaluating = useDesignerLogicStore((s) => s.isEvaluating);
  const effects = useDesignerLogicStore((s) => s.getFilteredEffects());

  // Auto-evaluate on mount
  useEffect(() => {
    if (!evaluation) {
      evaluate();
    }
  }, [evaluation, evaluate]);

  return (
    <div className="p-2">
      {/* Header with Gate Status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <span className="text-sm">🧠</span>
          </div>
          <h3 className="text-xs font-medium text-white">Designer Logic</h3>
        </div>
        <div className="flex items-center gap-2">
          <GateStatusBadge />
          <button
            onClick={evaluate}
            disabled={isEvaluating}
            className="p-1 rounded hover:bg-surface-3 text-gray-500 hover:text-purple-400 transition-all disabled:opacity-50"
            title="Re-evaluate"
          >
            <RefreshCw size={12} className={isEvaluating ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="h-[1px] w-full bg-[#333] mb-2" />

      {/* Active Effects */}
      <div className="mb-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
          Active Effects ({effects.length})
        </div>
        {effects.length === 0 ? (
          <div className="text-[10px] text-gray-500 text-center py-2">No effects triggered</div>
        ) : (
          <div className="max-h-32 overflow-y-auto">
            {effects.map((effect, i) => (
              <EffectItem key={i} effect={effect} />
            ))}
          </div>
        )}
      </div>

      {/* Hardware Section */}
      <CollapsibleSection
        title="Hardware"
        icon={<Package size={12} />}
        count={evaluation?.hardware.hardware.length}
        defaultOpen
      >
        <HardwareSection />
      </CollapsibleSection>

      {/* Drilling Section */}
      <CollapsibleSection
        title="Drilling"
        icon={<CircleDot size={12} />}
        count={evaluation?.drilling.operations.length}
      >
        <DrillingSection />
      </CollapsibleSection>

      {/* Assembly Section */}
      <CollapsibleSection
        title="Assembly"
        icon={<ListOrdered size={12} />}
        count={evaluation?.assembly.steps.length}
      >
        <AssemblySection />
      </CollapsibleSection>
    </div>
  );
}

export default DesignerLogicContent;

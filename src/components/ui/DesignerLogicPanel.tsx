/**
 * Designer Logic Panel - UI for rule evaluation results
 *
 * Displays:
 * - Gate status (PASS/WARN/BLOCK)
 * - Active effects with Thai/English messages
 * - Hardware selection table
 * - Drilling operations (symbolic)
 * - Assembly sequence
 *
 * v1.0: Initial implementation
 */

import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle,
  Package,
  CircleDot,
  ListOrdered,
  RefreshCw,
} from 'lucide-react';
import {
  useDesignerLogicStore,
  useGateStatus,
  type DesignerLogicTab,
} from '../../core/store/useDesignerLogicStore';
import type {
  RuleEffect,
  HardwareItemPDF,
  DrillOpPDF,
  AssemblyStepPDF,
} from '../../core/designerIntent/types';

// ============================================
// STYLES
// ============================================

const PANEL_STYLES = {
  container: {
    background: '#1a1a2e',
    borderLeft: '1px solid #3a3a5a',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #3a3a5a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  title: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    color: '#8b5cf6',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
};

const COLORS = {
  block: '#ef4444',
  warn: '#f59e0b',
  info: '#8b5cf6',
  ok: '#22c55e',
  muted: '#6b7280',
  bg: '#252547',
  border: '#3a3a5a',
};

// ============================================
// GATE STATUS BADGE
// ============================================

function GateStatusBadge() {
  const { blocked, blockCount, warningCount } = useGateStatus();

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {/* Pass/Block indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '4px',
          background: blocked ? COLORS.block + '20' : COLORS.ok + '20',
          color: blocked ? COLORS.block : COLORS.ok,
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        {blocked ? <XCircle size={14} /> : <CheckCircle size={14} />}
        {blocked ? 'BLOCK' : 'OK'}
      </div>

      {/* Block count */}
      {blockCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            color: COLORS.block,
            fontSize: '12px',
          }}
        >
          <XCircle size={12} />
          {blockCount}
        </div>
      )}

      {/* Warning count */}
      {warningCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            color: COLORS.warn,
            fontSize: '12px',
          }}
        >
          <AlertTriangle size={12} />
          {warningCount}
        </div>
      )}
    </div>
  );
}

// ============================================
// EFFECT ITEM
// ============================================

interface EffectItemProps {
  effect: RuleEffect;
}

function EffectItem({ effect }: EffectItemProps) {
  const icon =
    effect.severity === 'block' ? (
      <XCircle size={14} />
    ) : effect.severity === 'warn' ? (
      <AlertTriangle size={14} />
    ) : (
      <Info size={14} />
    );

  const color =
    effect.severity === 'block'
      ? COLORS.block
      : effect.severity === 'warn'
        ? COLORS.warn
        : COLORS.info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px',
        background: color + '10',
        borderRadius: '4px',
        borderLeft: `3px solid ${color}`,
        marginBottom: '6px',
      }}
    >
      <div style={{ color, flexShrink: 0, marginTop: '2px' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: '#fff',
            fontSize: '12px',
            fontWeight: 500,
            marginBottom: '2px',
          }}
        >
          {effect.code}
        </div>
        <div style={{ color: '#d1d5db', fontSize: '11px', lineHeight: 1.4 }}>
          {effect.messageTH}
        </div>
        {effect.messageEN && (
          <div style={{ color: COLORS.muted, fontSize: '10px', marginTop: '2px' }}>
            {effect.messageEN}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// TABS
// ============================================

const TABS: { id: DesignerLogicTab; label: string; icon: React.ReactNode }[] = [
  { id: 'hardware', label: 'Hardware', icon: <Package size={14} /> },
  { id: 'drilling', label: 'Drilling', icon: <CircleDot size={14} /> },
  { id: 'assembly', label: 'Assembly', icon: <ListOrdered size={14} /> },
];

function TabBar() {
  const activeTab = useDesignerLogicStore((s) => s.activeTab);
  const setActiveTab = useDesignerLogicStore((s) => s.setActiveTab);

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px',
            background: activeTab === tab.id ? '#1a1a2e' : 'transparent',
            color: activeTab === tab.id ? '#fff' : COLORS.muted,
            border: 'none',
            borderBottom: activeTab === tab.id ? `2px solid ${COLORS.info}` : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================
// HARDWARE TAB
// ============================================

function HardwareTab() {
  const hardware = useDesignerLogicStore((s) => s.evaluation?.hardware.hardware ?? []);
  const notes = useDesignerLogicStore((s) => s.evaluation?.hardware.notesTH ?? []);

  if (hardware.length === 0) {
    return (
      <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
        ไม่มี Hardware ที่เลือก
      </div>
    );
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ color: COLORS.muted, textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}` }}>Catalog</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}` }}>Name</th>
            <th style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}`, textAlign: 'right' }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {hardware.map((item, i) => (
            <tr key={i} style={{ color: '#d1d5db' }}>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}`, fontFamily: 'monospace', fontSize: '10px' }}>
                {item.catalogId}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}` }}>
                {item.nameTH}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}`, textAlign: 'right', fontWeight: 600 }}>
                {item.quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {notes.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ ...PANEL_STYLES.sectionTitle }}>Notes</div>
          {notes.map((note, i) => (
            <div key={i} style={{ color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
              • {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// DRILLING TAB
// ============================================

function DrillingTab() {
  const operations = useDesignerLogicStore((s) => s.evaluation?.drilling.operations ?? []);
  const system32 = useDesignerLogicStore((s) => s.evaluation?.drilling.system32);
  const notes = useDesignerLogicStore((s) => s.evaluation?.drilling.notesTH ?? []);

  // Group by panel
  const byPanel = useMemo(() => {
    const grouped: Record<string, DrillOpPDF[]> = {};
    for (const op of operations) {
      if (!grouped[op.panel]) grouped[op.panel] = [];
      grouped[op.panel].push(op);
    }
    return grouped;
  }, [operations]);

  if (operations.length === 0) {
    return (
      <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
        ไม่มี Drilling operations
      </div>
    );
  }

  return (
    <div>
      {system32 && (
        <div
          style={{
            background: COLORS.info + '20',
            borderRadius: '4px',
            padding: '8px',
            marginBottom: '12px',
            fontSize: '11px',
            color: '#d1d5db',
          }}
        >
          <strong style={{ color: COLORS.info }}>System 32:</strong> First hole @ {system32.firstHole}mm, Pitch {system32.pitch}mm
        </div>
      )}

      {Object.entries(byPanel).map(([panel, ops]) => (
        <div key={panel} style={{ marginBottom: '12px' }}>
          <div
            style={{
              color: '#fff',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 8px',
              background: COLORS.bg,
              borderRadius: '4px',
              marginBottom: '4px',
            }}
          >
            {panel} ({ops.length})
          </div>
          {ops.slice(0, 5).map((op, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 8px',
                fontSize: '10px',
                color: COLORS.muted,
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <span style={{ fontFamily: 'monospace' }}>{op.symbolRef}</span>
              <span>Ø{op.diameter} × {op.depth}mm</span>
            </div>
          ))}
          {ops.length > 5 && (
            <div style={{ padding: '4px 8px', fontSize: '10px', color: COLORS.muted }}>
              ... and {ops.length - 5} more
            </div>
          )}
        </div>
      ))}

      {notes.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ ...PANEL_STYLES.sectionTitle }}>Notes</div>
          {notes.map((note, i) => (
            <div key={i} style={{ color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
              • {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// ASSEMBLY TAB
// ============================================

function AssemblyTab() {
  const steps = useDesignerLogicStore((s) => s.evaluation?.assembly.steps ?? []);
  const totalMinutes = useDesignerLogicStore((s) => s.evaluation?.assembly.totalMinutes ?? 0);
  const direction = useDesignerLogicStore((s) => s.evaluation?.assembly.assemblyDirection);
  const notes = useDesignerLogicStore((s) => s.evaluation?.assembly.notesTH ?? []);

  if (steps.length === 0) {
    return (
      <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: 'center', padding: '20px' }}>
        ไม่มี Assembly steps
      </div>
    );
  }

  return (
    <div>
      {/* Header info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px',
          background: COLORS.bg,
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '11px',
        }}
      >
        <span style={{ color: '#d1d5db' }}>
          Direction: <strong style={{ color: '#fff' }}>{direction === 'LEFT_TO_RIGHT' ? 'ซ้าย → ขวา' : 'ขวา → ซ้าย'}</strong>
        </span>
        <span style={{ color: COLORS.info }}>
          ~{totalMinutes} นาที
        </span>
      </div>

      {/* Steps */}
      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: COLORS.info + '30',
              color: COLORS.info,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {step.stepNumber}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '12px', marginBottom: '2px' }}>
              {step.instructionTH}
            </div>
            <div style={{ color: COLORS.muted, fontSize: '10px' }}>
              {step.action} • {step.panel} • {step.estimatedMinutes} นาที
            </div>
          </div>
        </div>
      ))}

      {notes.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ ...PANEL_STYLES.sectionTitle }}>Notes</div>
          {notes.map((note, i) => (
            <div key={i} style={{ color: COLORS.muted, fontSize: '11px', marginBottom: '4px' }}>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN PANEL
// ============================================

export function DesignerLogicPanel() {
  const isPanelExpanded = useDesignerLogicStore((s) => s.isPanelExpanded);
  const togglePanel = useDesignerLogicStore((s) => s.togglePanel);
  const activeTab = useDesignerLogicStore((s) => s.activeTab);
  const evaluation = useDesignerLogicStore((s) => s.evaluation);
  const evaluate = useDesignerLogicStore((s) => s.evaluate);
  const isEvaluating = useDesignerLogicStore((s) => s.isEvaluating);

  // Get filtered effects
  const effects = useDesignerLogicStore((s) => s.getFilteredEffects());

  // Auto-evaluate on mount if no evaluation
  useEffect(() => {
    if (!evaluation) {
      evaluate();
    }
  }, [evaluation, evaluate]);

  return (
    <div style={{ ...PANEL_STYLES.container, width: isPanelExpanded ? '320px' : '48px' }}>
      {/* Header */}
      <div style={PANEL_STYLES.header}>
        <button
          onClick={togglePanel}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isPanelExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        {isPanelExpanded && (
          <>
            <span style={PANEL_STYLES.title}>
              Designer Logic
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GateStatusBadge />
              <button
                onClick={evaluate}
                disabled={isEvaluating}
                style={{
                  background: COLORS.info + '20',
                  border: 'none',
                  color: COLORS.info,
                  borderRadius: '4px',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Re-evaluate"
              >
                <RefreshCw size={14} className={isEvaluating ? 'animate-spin' : ''} />
              </button>
            </div>
          </>
        )}
      </div>

      {isPanelExpanded && (
        <>
          {/* Effects Section */}
          <div style={{ ...PANEL_STYLES.content, maxHeight: '200px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={PANEL_STYLES.sectionTitle}>Active Effects ({effects.length})</div>
            {effects.length === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: '12px', textAlign: 'center' }}>
                ไม่มี effects
              </div>
            ) : (
              effects.map((effect, i) => <EffectItem key={i} effect={effect} />)
            )}
          </div>

          {/* Tabs */}
          <TabBar />

          {/* Tab Content */}
          <div style={PANEL_STYLES.content}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'hardware' && <HardwareTab />}
                {activeTab === 'drilling' && <DrillingTab />}
                {activeTab === 'assembly' && <AssemblyTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

export default DesignerLogicPanel;

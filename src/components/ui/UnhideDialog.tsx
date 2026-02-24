/**
 * UnhideDialog — Unhide by Name dialogs for Cabinet and Panel levels
 *
 * Two dialogs:
 * 1. Cabinet Unhide — lists hidden cabinets, click to show
 * 2. Panel Unhide — lists hidden panels in active cabinet, click to show
 *
 * v1.0: Initial implementation
 */

import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useModelingStore } from '../../core/modeling/useModelingStore';
import { Eye, X } from 'lucide-react';

// ============================================================================
// Cabinet Unhide Dialog
// ============================================================================

export function CabinetUnhideDialog() {
  const open = useModelingStore((s) => s.unhideDialogOpen);
  const close = useModelingStore((s) => s.closeUnhideDialog);
  const cabinets = useCabinetStore((s) => s.cabinets);
  const hiddenIds = useCabinetStore((s) => s.hiddenCabinetIds);
  const showCabinet = useCabinetStore((s) => s.showCabinet);
  const showAllCabinets = useCabinetStore((s) => s.showAllCabinets);

  if (!open) return null;

  const hiddenCabinets = cabinets.filter((c) => hiddenIds.includes(c.id));

  return (
    <div style={overlayStyle} onClick={close}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Unhide Cabinet by Name</span>
          <button onClick={close} style={closeButtonStyle}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {hiddenCabinets.length === 0 ? (
            <div style={emptyStyle}>No hidden cabinets</div>
          ) : (
            hiddenCabinets.map((cabinet) => (
              <button
                key={cabinet.id}
                onClick={() => showCabinet(cabinet.id)}
                style={itemStyle}
              >
                <Eye size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{cabinet.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    {cabinet.dimensions.width}W x {cabinet.dimensions.height}H x {cabinet.dimensions.depth}D mm
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {hiddenCabinets.length > 0 && (
          <div style={footerStyle}>
            <button
              onClick={() => {
                showAllCabinets();
                close();
              }}
              style={showAllButtonStyle}
            >
              Show All ({hiddenCabinets.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Panel Unhide Dialog
// ============================================================================

export function PanelUnhideDialog() {
  const open = useModelingStore((s) => s.unhidePanelDialogOpen);
  const close = useModelingStore((s) => s.closeUnhidePanelDialog);
  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const setPanelVisible = useCabinetStore((s) => s.setPanelVisible);
  const showAllPanels = useCabinetStore((s) => s.showAllPanels);

  if (!open) return null;

  const activeCabinet = cabinets.find((c) => c.id === activeCabinetId);
  const hiddenPanels = activeCabinet?.panels.filter((p) => !p.visible) ?? [];

  return (
    <div style={overlayStyle} onClick={close}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Unhide Panel by Name</span>
          <button onClick={close} style={closeButtonStyle}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {hiddenPanels.length === 0 ? (
            <div style={emptyStyle}>No hidden panels</div>
          ) : (
            hiddenPanels.map((panel) => (
              <button
                key={panel.id}
                onClick={() => setPanelVisible(panel.id, true)}
                style={itemStyle}
              >
                <Eye size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{panel.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    {panel.role} — {panel.finishWidth}x{panel.finishHeight} mm
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {hiddenPanels.length > 0 && (
          <div style={footerStyle}>
            <button
              onClick={() => {
                showAllPanels();
                close();
              }}
              style={showAllButtonStyle}
            >
              Show All ({hiddenPanels.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const dialogStyle: React.CSSProperties = {
  background: '#1a1a2e',
  border: '1px solid #3a3a5a',
  borderRadius: 8,
  width: 320,
  maxHeight: 400,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #3a3a5a',
  color: '#e0e0e0',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '4px 0',
};

const emptyStyle: React.CSSProperties = {
  padding: '24px 16px',
  textAlign: 'center',
  color: '#666',
  fontSize: 13,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '8px 16px',
  background: 'none',
  border: 'none',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
  transition: 'background 0.15s',
};

const footerStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderTop: '1px solid #3a3a5a',
};

const showAllButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#8b5cf6',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

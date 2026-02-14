/**
 * FreezeModal
 *
 * Confirmation dialog for DRAFT → FROZEN transition
 * Creates immutable snapshot of manufacturing truth
 */

import React, { useState } from 'react';
import { useSpecStore } from '../SpecStoreProvider';

// Shared modal styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: 640,
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#1a1a2e',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  color: '#fff',
};

export function FreezeModal() {
  const open = useSpecStore((s) => s.modals.freezeOpen);
  const close = useSpecStore((s) => s.closeFreeze);
  const freeze = useSpecStore((s) => s.freeze);
  const doc = useSpecStore((s) => s.doc);
  const busy = useSpecStore((s) => s.async.busy);
  const error = useSpecStore((s) => s.async.error);

  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setNote('');
      setAck(false);
    }
  }, [open]);

  if (!open) return null;
  if (doc.state !== 'DRAFT') return null;

  const handleFreeze = async () => {
    await freeze(note || undefined);
  };

  return (
    <div style={backdropStyle} onClick={close}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, marginBottom: 16, color: '#10b981' }}>
          Freeze for Manufacturing
        </h2>

        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
          This will lock all design inputs that affect factory output and create an
          immutable snapshot. You can still review and run Gate checks after freezing.
        </p>

        {/* Summary Preview */}
        <div
          style={{
            padding: 16,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <h4 style={{ margin: 0, marginBottom: 12, color: 'rgba(255,255,255,0.9)' }}>
            Snapshot Summary
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{doc.summary.partsCount}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Parts</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{doc.summary.fittingsCount}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Fittings</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{doc.summary.materialsCount}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Materials</div>
            </div>
          </div>

          {/* Preflight Warnings */}
          {doc.summary.warnings.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h5 style={{ margin: 0, marginBottom: 8, color: '#f59e0b' }}>
                Preflight Warnings ({doc.summary.warnings.length})
              </h5>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {doc.summary.warnings.map((w) => (
                  <li key={w.code} style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Note Input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this freeze..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#fff',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Acknowledgment Checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 20,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span style={{ color: 'rgba(255,255,255,0.9)' }}>
            I understand this snapshot becomes <strong>immutable</strong> and cannot be
            edited. To make changes, I will need to create a new revision.
          </span>
        </label>

        {/* Error Display */}
        {error && (
          <div
            style={{
              padding: 12,
              background: 'rgba(239,68,68,0.2)',
              borderRadius: 6,
              marginBottom: 16,
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            onClick={close}
            disabled={busy}
            style={{
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleFreeze}
            disabled={!ack || busy}
            title={!ack ? 'Please confirm acknowledgement to continue' : undefined}
            style={{
              padding: '10px 20px',
              background: ack ? '#10b981' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              cursor: !ack || busy ? 'not-allowed' : 'pointer',
              opacity: !ack || busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Creating Snapshot...' : 'Create Snapshot (Freeze)'}
          </button>
        </div>
      </div>
    </div>
  );
}

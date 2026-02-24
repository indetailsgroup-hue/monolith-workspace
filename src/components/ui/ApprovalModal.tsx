/**
 * Approval Modal - Explicit Release Approval
 *
 * Step 6 of Plasticity-Style Modeling Layer:
 * - User must explicitly approve before release
 * - Creates signed approval record
 * - Prevents accidental releases
 *
 * v1.0: Initial approval modal
 */

import { useState } from 'react';
import type { ApprovalSignature, ApprovalRole } from '../../core/manufacturing/release/types';
import { createApprovalSignature } from '../../core/manufacturing/release/signer';

interface ApprovalModalProps {
  /** Is modal open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Approve callback with signature */
  onApprove: (signature: ApprovalSignature) => void;
}

export function ApprovalModal({ open, onClose, onApprove }: ApprovalModalProps) {
  const [approverId, setApproverId] = useState('designer@indetails');
  const [role, setRole] = useState<ApprovalRole>('DESIGNER');
  const [message, setMessage] = useState('Approve for factory release');
  const [keyId, setKeyId] = useState('designer-key');

  if (!open) return null;

  const handleApprove = () => {
    const signature = createApprovalSignature({
      approverId,
      role,
      message,
      keyId,
    });

    onApprove(signature);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 480,
          background: '#1a1a2e',
          border: '1px solid #3a3a5a',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #3a3a5a',
            background: 'rgba(139,92,246,0.1)',
          }}
        >
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>
            Approval Required
          </h3>
          <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            Release requires an explicit approval signature (audit trail)
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              Approver ID
            </label>
            <input
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ApprovalRole)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
              }}
            >
              <option value="DESIGNER">DESIGNER</option>
              <option value="ENGINEERING">ENGINEERING</option>
              <option value="OPS">OPS</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              Message
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Reason for approval"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontSize: 12,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              Key ID (for signing)
            </label>
            <input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #3a3a5a',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                fontFamily: 'monospace',
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #3a3a5a',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid #3a3a5a',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={!approverId.trim() || !message.trim()}
            style={{
              padding: '10px 24px',
              background: '#8b5cf6',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: !approverId.trim() || !message.trim() ? 0.5 : 1,
            }}
          >
            Sign & Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalModal;

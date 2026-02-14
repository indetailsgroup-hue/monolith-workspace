/**
 * ReceiptIngestPanel - Receipt Upload and Ingest Component
 *
 * UI for uploading, verifying, and appending factory receipts.
 *
 * @version 1.0.0
 */

import React from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptIngestState } from '../../core/receiptIngest/receiptIngestStore';

export interface ReceiptIngestPanelProps {
  store: UseBoundStore<StoreApi<ReceiptIngestState>>;
  /** Callback when a receipt is appended */
  onAppended?: () => void | Promise<void>;
}

export function ReceiptIngestPanel({ store }: ReceiptIngestPanelProps): React.ReactElement {
  const step = store((s) => s.step);
  const error = store((s) => s.error);

  return React.createElement('div', {
    style: { padding: 16, border: '1px solid #3a3a5a', borderRadius: 8 },
  },
    React.createElement('h3', {
      style: { color: '#f5f5f5', marginBottom: 12, fontSize: 14, fontWeight: 600 },
    }, 'Receipt Ingest'),
    React.createElement('div', {
      style: { color: '#9ca3af', fontSize: 13 },
    }, step === 'IDLE' ? 'Drop receipt file to upload' : `Status: ${step}`),
    error && React.createElement('div', {
      style: { color: '#ef4444', fontSize: 12, marginTop: 8 },
    }, error)
  );
}

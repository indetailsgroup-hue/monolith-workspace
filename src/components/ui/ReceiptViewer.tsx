/**
 * ReceiptViewer - Receipt Timeline Viewer Component
 *
 * Displays acceptance timeline and receipt details.
 *
 * @version 1.0.0
 */

import React from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ReceiptViewerState } from '../../core/receiptViewer/receiptViewerStore';

export interface ReceiptViewerProps {
  store: UseBoundStore<StoreApi<ReceiptViewerState>>;
}

export function ReceiptViewer({ store }: ReceiptViewerProps): React.ReactElement {
  const timeline = store((s) => s.timeline);
  const loading = store((s) => s.loading);

  if (loading) {
    return React.createElement('div', {
      style: { padding: 16, color: '#9ca3af' },
    }, 'Loading timeline...');
  }

  if (!timeline) {
    return React.createElement('div', {
      style: { padding: 16, color: '#6b7280' },
    }, 'No timeline data available.');
  }

  return React.createElement('div', {
    style: { padding: 16 },
  },
    React.createElement('h3', {
      style: { color: '#f5f5f5', marginBottom: 12 },
    }, 'Acceptance Timeline'),
    React.createElement('div', {
      style: { color: '#9ca3af', fontSize: 13 },
    }, `${timeline.events.length} event(s) · Status: ${timeline.acceptance.specState}`)
  );
}

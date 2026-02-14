/**
 * FixPlanPanel - Issue Resolution Workflow Component
 *
 * UI for resolving blocking issues before re-export.
 *
 * @version 1.0.0
 */

import React from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { FixPlanState } from '../../core/fixPlan/fixPlanStore';

export interface FixPlanPanelProps {
  store: UseBoundStore<StoreApi<FixPlanState>>;
}

export function FixPlanPanel({ store }: FixPlanPanelProps): React.ReactElement {
  const issues = store((s) => s.blockingIssues);
  const loading = store((s) => s.loading);

  return React.createElement('div', {
    style: { padding: 16, border: '1px solid #3a3a5a', borderRadius: 8 },
  },
    React.createElement('h3', {
      style: { color: '#f5f5f5', marginBottom: 12, fontSize: 14, fontWeight: 600 },
    }, 'Fix Plan'),
    loading
      ? React.createElement('div', { style: { color: '#9ca3af', fontSize: 13 } }, 'Loading issues...')
      : React.createElement('div', { style: { color: '#9ca3af', fontSize: 13 } },
          issues.length === 0
            ? 'No blocking issues'
            : `${issues.length} blocking issue(s) to resolve`
        )
  );
}

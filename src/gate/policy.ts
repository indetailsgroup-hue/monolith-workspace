/**
 * Gate Policy v0.1
 *
 * Default manufacturing constraints policy
 */

import type { GatePolicy } from './types';

export const DEFAULT_GATE_POLICY_V1: GatePolicy = {
  policyVersion: 'gate-policy-0.1.0',

  // Safety margins
  thicknessSafetyMarginMm: 0.5,
  minMarginToEdgeMm: 8,
  minFeatureSizeMm: 12,

  // Clearance rules
  backPanelClearanceMm: 2,
  shelfToBackClearanceMm: 1,

  // Fitting rules
  minFittingSpacingMm: 32,
  minSetbackFromEdgeMm: 18,

  // Cut rules
  minCutDimensionMm: 20,
};

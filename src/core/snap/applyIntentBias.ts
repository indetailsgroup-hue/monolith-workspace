/**
 * applyIntentBias.ts - Apply Intent Bias to Snap Candidates
 *
 * ARCHITECTURE:
 * - Takes candidates + intent result
 * - Adds intent bias to candidate scores
 * - Re-sorts candidates by new score
 *
 * FORMULA:
 * newScore = originalScore + (intentBias * velocityWeight)
 */

import type { SnapCandidate } from '../types/SnapTypes';
import type { SnapIntentResult, IntentWeights } from './intentTypes';

// ============================================
// EXTENDED CANDIDATE TYPE
// ============================================

/**
 * Candidate with intent bias applied
 */
export interface ScoredCandidate extends SnapCandidate {
  /** Original score before intent bias */
  originalScore: number;

  /** Intent bias applied (0-1) */
  intentBias: number;
}

// ============================================
// APPLY INTENT BIAS
// ============================================

/**
 * Apply intent bias to candidates and re-sort
 *
 * @param candidates - Original candidates
 * @param intent - Intent resolution result
 * @param weights - Intent weights configuration
 * @returns Candidates with updated scores, sorted descending
 */
export function applyIntentBiasToCandidates(
  candidates: SnapCandidate[],
  intent: SnapIntentResult,
  weights: IntentWeights
): ScoredCandidate[] {
  if (!candidates.length) return [];

  // Map candidates with intent bias
  const scored = candidates.map((c): ScoredCandidate => {
    const bias = intent.typeBias[c.type] ?? 0;
    const bonusScore = bias * weights.velocityWeight;

    return {
      ...c,
      originalScore: c.score,
      score: c.score + bonusScore,
      intentBias: bias,
    };
  });

  // Sort by new score descending (higher = better)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Apply intent bias in-place (mutates candidates)
 * More efficient when you don't need the extended type
 */
export function applyIntentBiasInPlace(
  candidates: SnapCandidate[],
  intent: SnapIntentResult,
  weights: IntentWeights
): void {
  for (const c of candidates) {
    const bias = intent.typeBias[c.type] ?? 0;
    c.score += bias * weights.velocityWeight;
  }

  // Sort descending
  candidates.sort((a, b) => b.score - a.score);
}

// ============================================
// UTILITY: FILTER BY INTENT
// ============================================

/**
 * Filter candidates that match the detected intent axis
 * Useful for strict intent-based filtering
 */
export function filterByIntent(
  candidates: SnapCandidate[],
  intent: SnapIntentResult,
  minConfidence: number = 0.6
): SnapCandidate[] {
  // If no clear intent, return all
  if (intent.confidence < minConfidence) {
    return candidates;
  }

  // Keep only candidates with positive bias
  return candidates.filter(c => {
    const bias = intent.typeBias[c.type] ?? 0;
    return bias > 0;
  });
}

/**
 * Get the best candidate matching intent
 */
export function getBestIntentCandidate(
  candidates: ScoredCandidate[]
): ScoredCandidate | null {
  if (!candidates.length) return null;

  // Already sorted, first is best
  return candidates[0];
}

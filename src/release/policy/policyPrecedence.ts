/**
 * Policy Precedence Resolver (v0.9)
 *
 * Determines which revocation policy to use during verification.
 *
 * Precedence Order:
 * 1. BUNDLE - revocation-policy.json inside the release bundle (highest priority)
 * 2. INSTALLED - locally installed signed policy
 * 3. NONE - no policy available
 *
 * This enables:
 * - Bundle-first: Release bundles are self-contained with their policy
 * - Fallback: Factories can pre-install a policy for legacy bundles
 * - Configurable: Can require policy or allow empty
 */

import { getInstalledPolicyJson } from './installedPolicyStore';

/**
 * Source of the resolved policy
 */
export type PolicySource = 'BUNDLE' | 'INSTALLED' | 'NONE';

/**
 * Result of policy precedence resolution
 */
export type PolicyPrecedenceResult = {
  /** Where the policy came from */
  source: PolicySource;
  /** The policy JSON content (null if NONE) */
  policyJson: string | null;
};

/**
 * Minimal bundle item interface for policy resolution
 */
export type BundleItem = {
  path: string;
  content: string;
};

/**
 * Minimal bundle interface for policy resolution
 */
export type BundleLike = {
  items?: BundleItem[];
};

/**
 * Resolve policy JSON by precedence
 *
 * @param bundle - Optional bundle to check for policy
 * @returns Policy source and JSON content
 */
export function resolvePolicyJsonByPrecedence(bundle?: BundleLike): PolicyPrecedenceResult {
  // 1) Bundle policy (highest priority)
  const bundlePolicy = bundle?.items?.find((x) => x.path === 'revocation-policy.json')?.content ?? null;
  if (bundlePolicy) {
    return { source: 'BUNDLE', policyJson: bundlePolicy };
  }

  // 2) Installed local policy
  const installed = getInstalledPolicyJson();
  if (installed) {
    return { source: 'INSTALLED', policyJson: installed };
  }

  // 3) None
  return { source: 'NONE', policyJson: null };
}

/**
 * Check if policy is available from any source
 *
 * @param bundle - Optional bundle to check
 * @returns True if policy is available
 */
export function hasPolicyAvailable(bundle?: BundleLike): boolean {
  const result = resolvePolicyJsonByPrecedence(bundle);
  return result.source !== 'NONE';
}

/**
 * Get human-readable description of policy source
 */
export function describePolicySource(source: PolicySource): string {
  switch (source) {
    case 'BUNDLE':
      return 'Bundle (revocation-policy.json)';
    case 'INSTALLED':
      return 'Installed (local signed policy)';
    case 'NONE':
      return 'None (no policy available)';
  }
}

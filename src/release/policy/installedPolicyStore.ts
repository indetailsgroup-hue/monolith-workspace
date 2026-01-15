/**
 * Installed Policy Store (v0.9)
 *
 * Stores a signed revocation-policy.json artifact locally.
 * Used when bundle doesn't contain a policy but factory needs one.
 *
 * Precedence: Bundle policy > Installed policy > None
 *
 * Admin session required for install/clear operations (enforced in UI).
 */

const LS_INSTALLED_POLICY = 'iimos.installed.revocationPolicy.json.v1';
const LS_INSTALLED_META = 'iimos.installed.revocationPolicy.meta.v1';

/**
 * Metadata about installed policy
 */
export type InstalledPolicyMeta = {
  /** When the policy was installed (ISO) */
  installedAtIso: string;
  /** Who installed the policy */
  installedBy: string;
  /** How the policy was installed */
  source: 'IMPORT' | 'BUNDLE_INSTALL';
  /** Optional note */
  note?: string;
};

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Get installed policy JSON content
 *
 * @returns Policy JSON string or null if not installed
 */
export function getInstalledPolicyJson(): string | null {
  return localStorage.getItem(LS_INSTALLED_POLICY);
}

/**
 * Get installed policy metadata
 *
 * @returns Metadata or null if not installed
 */
export function getInstalledPolicyMeta(): InstalledPolicyMeta | null {
  const raw = localStorage.getItem(LS_INSTALLED_META);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InstalledPolicyMeta;
  } catch {
    return null;
  }
}

/**
 * Check if a policy is installed
 */
export function hasInstalledPolicy(): boolean {
  return !!localStorage.getItem(LS_INSTALLED_POLICY);
}

/**
 * Install a signed policy JSON
 *
 * Note: Verification should be done before calling this function.
 *
 * @param policyJson - The signed policy JSON content
 * @param input - Installation metadata
 */
export function installPolicyJson(
  policyJson: string,
  input: {
    by: string;
    source: InstalledPolicyMeta['source'];
    note?: string;
  }
): void {
  localStorage.setItem(LS_INSTALLED_POLICY, policyJson);

  const meta: InstalledPolicyMeta = {
    installedAtIso: nowIso(),
    installedBy: input.by,
    source: input.source,
    note: input.note,
  };

  localStorage.setItem(LS_INSTALLED_META, JSON.stringify(meta, null, 2));
}

/**
 * Clear installed policy
 *
 * @param by - Who cleared the policy
 */
export function clearInstalledPolicy(by: string): void {
  localStorage.removeItem(LS_INSTALLED_POLICY);

  // Keep metadata to track who cleared it
  const meta: InstalledPolicyMeta = {
    installedAtIso: nowIso(),
    installedBy: by,
    source: 'IMPORT',
    note: 'cleared',
  };

  localStorage.setItem(LS_INSTALLED_META, JSON.stringify(meta, null, 2));
}

/**
 * Get installed policy info for display
 */
export function getInstalledPolicyInfo(): {
  installed: boolean;
  meta: InstalledPolicyMeta | null;
  jsonLength: number | null;
} {
  const json = getInstalledPolicyJson();
  return {
    installed: !!json,
    meta: getInstalledPolicyMeta(),
    jsonLength: json?.length ?? null,
  };
}

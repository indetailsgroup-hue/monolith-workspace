/**
 * Installed Policy Store (v0.9)
 *
 * Stores a signed revocation-policy.json artifact locally.
 * Used when bundle doesn't contain a policy but factory needs one.
 *
 * Precedence: Bundle policy > Installed policy > None
 *
 * Admin session required for install/clear operations (enforced in UI).
 *
 * G9 COMPLIANCE: Uses unsafeStorage boundary for localStorage access.
 */

import {
  readString,
  readValidatedSafe,
  writeRaw,
  writeJson,
  remove,
} from '../../core/persistence/unsafeStorage';
import { z } from 'zod';

const LS_INSTALLED_POLICY = 'monolith.installed.revocationPolicy.json.v1';
const LS_INSTALLED_META = 'monolith.installed.revocationPolicy.meta.v1';

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
 * Zod schema for InstalledPolicyMeta validation
 */
const InstalledPolicyMetaSchema = z.object({
  installedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
  installedBy: z.string(),
  source: z.enum(['IMPORT', 'BUNDLE_INSTALL']),
  note: z.string().optional(),
});

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
  return readString(LS_INSTALLED_POLICY);
}

/**
 * Get installed policy metadata
 *
 * @returns Metadata or null if not installed
 */
export function getInstalledPolicyMeta(): InstalledPolicyMeta | null {
  const result = readValidatedSafe(LS_INSTALLED_META, InstalledPolicyMetaSchema);
  if (!result.ok) return null;
  return result.data;
}

/**
 * Check if a policy is installed
 */
export function hasInstalledPolicy(): boolean {
  return !!readString(LS_INSTALLED_POLICY);
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
  writeRaw(LS_INSTALLED_POLICY, policyJson);

  const meta: InstalledPolicyMeta = {
    installedAtIso: nowIso(),
    installedBy: input.by,
    source: input.source,
    note: input.note,
  };

  writeJson(LS_INSTALLED_META, meta);
}

/**
 * Clear installed policy
 *
 * @param by - Who cleared the policy
 */
export function clearInstalledPolicy(by: string): void {
  remove(LS_INSTALLED_POLICY);

  // Keep metadata to track who cleared it
  const meta: InstalledPolicyMeta = {
    installedAtIso: nowIso(),
    installedBy: by,
    source: 'IMPORT',
    note: 'cleared',
  };

  writeJson(LS_INSTALLED_META, meta);
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

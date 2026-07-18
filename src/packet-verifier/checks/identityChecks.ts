// S17-5 checks 3–6 (spec §12): exact file set → byte integrity → content
// identity → manifest binding. Each check is a standalone fail-closed function
// returning the FIRST violation with its stable code (first-fail-wins is
// enforced by the orchestrator running them in ladder order).

import type { ZipEntry } from '../container/zipStrictReader';
import type { PacketManifest, PacketAttestation } from '../shapes/shapes';
import type { JsonValue } from '../canonical/strictJson';
import { jcsSerialize } from '../canonical/jcs';
import { sha256Hex } from '../crypto/sha256';
import type { PacketFailureCode } from '../codes';

export type CheckOutcome = { ok: true } | { ok: false; code: PacketFailureCode; detail: string };

const CONTROL_FILES = ['manifest.json', 'attestation.json'] as const;
export const NFP_MARKER = 'NOT_FOR_PRODUCTION.txt';

/**
 * Check 3 — exact file set (§6, §12.3):
 * every manifest-listed payload file exists exactly once in the ZIP; no ZIP
 * payload entry outside the manifest; the two control files are present in the
 * ZIP but NOT listed in manifest.files (self-hash recursion guard); while
 * shadow mode governs, the NFP marker MUST be a manifest-listed payload file.
 */
export function checkExactFileSet(
  entries: readonly ZipEntry[],
  manifest: PacketManifest,
  opts: { shadowMode: boolean } = { shadowMode: true },
): CheckOutcome {
  const zipNames = entries.map((e) => e.name);
  const zipSet = new Set(zipNames);

  for (const control of CONTROL_FILES) {
    if (!zipSet.has(control)) {
      return { ok: false, code: 'PKT_FILE_MISSING', detail: `control file ${control} missing from ZIP` };
    }
  }
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const control of CONTROL_FILES) {
    if (listed.has(control)) {
      return { ok: false, code: 'PKT_FILE_EXTRA', detail: `${control} must not be listed in manifest.files` };
    }
  }
  if (opts.shadowMode && !listed.has(NFP_MARKER)) {
    // marker is a manifest-listed payload, so its absence from the manifest —
    // or from the ZIP below — resolves at this check with PKT_FILE_MISSING (§NFP.5)
    return { ok: false, code: 'PKT_FILE_MISSING', detail: `${NFP_MARKER} not listed in manifest.files (shadow mode)` };
  }
  for (const f of manifest.files) {
    if (!zipSet.has(f.path)) {
      return { ok: false, code: 'PKT_FILE_MISSING', detail: `manifest-listed payload ${f.path} missing from ZIP` };
    }
  }
  for (const name of zipNames) {
    if ((CONTROL_FILES as readonly string[]).includes(name)) continue;
    if (!listed.has(name)) {
      return { ok: false, code: 'PKT_FILE_EXTRA', detail: `ZIP entry ${name} not listed in manifest.files` };
    }
  }
  return { ok: true };
}

/**
 * Check 4 — byte integrity (§12.4): per-file sizeBytes (raw byte count) and
 * raw-byte SHA-256 must match the manifest, including the NFP marker bytes.
 */
export async function checkByteIntegrity(
  entries: readonly ZipEntry[],
  manifest: PacketManifest,
): Promise<CheckOutcome> {
  const byName = new Map(entries.map((e) => [e.name, e.bytes] as const));
  for (const f of manifest.files) {
    const bytes = byName.get(f.path);
    if (bytes === undefined) {
      return { ok: false, code: 'PKT_FILE_MISSING', detail: `payload ${f.path} vanished between checks` };
    }
    if (bytes.length !== f.sizeBytes) {
      return {
        ok: false,
        code: 'PKT_SIZE_MISMATCH',
        detail: `${f.path}: sizeBytes ${f.sizeBytes} != actual ${bytes.length}`,
      };
    }
    const hex = await sha256Hex(bytes);
    if (hex !== f.sha256) {
      return { ok: false, code: 'PKT_HASH_MISMATCH', detail: `${f.path}: SHA-256 mismatch` };
    }
  }
  return { ok: true };
}

/**
 * Check 5 — content identity (§8.2, §12.5): recompute packetContentId from the
 * contentDescriptor = the parsed manifest VALUE with only `packetContentId`
 * omitted, serialized via JCS, hashed with SHA-256.
 */
export async function checkContentIdentity(
  manifestValue: JsonValue,
  manifest: PacketManifest,
): Promise<CheckOutcome> {
  if (typeof manifestValue !== 'object' || manifestValue === null || Array.isArray(manifestValue)) {
    return { ok: false, code: 'PKT_CONTENT_ID_MISMATCH', detail: 'manifest value is not an object' };
  }
  const descriptor: { [k: string]: JsonValue } = {};
  for (const [k, v] of Object.entries(manifestValue)) {
    if (k !== 'packetContentId') descriptor[k] = v;
  }
  const descriptorBytes = new TextEncoder().encode(jcsSerialize(descriptor));
  const recomputed = 'sha256:' + (await sha256Hex(descriptorBytes));
  if (recomputed !== manifest.packetContentId) {
    return {
      ok: false,
      code: 'PKT_CONTENT_ID_MISMATCH',
      detail: `recomputed ${recomputed.slice(0, 19)}… != manifest ${manifest.packetContentId.slice(0, 19)}…`,
    };
  }
  return { ok: true };
}

/**
 * Check 6 — manifest binding (§12.6): attestation.manifestSha256 must equal
 * the SHA-256 of the exact manifest.json bytes shipped in the ZIP, and the
 * attestation must claim the same packetContentId the manifest carries.
 */
export async function checkManifestBinding(
  manifestBytes: Uint8Array,
  manifest: PacketManifest,
  attestation: PacketAttestation,
): Promise<CheckOutcome> {
  const actual = 'sha256:' + (await sha256Hex(manifestBytes));
  if (attestation.manifestSha256 !== actual) {
    return {
      ok: false,
      code: 'PKT_MANIFEST_BINDING_MISMATCH',
      detail: 'attestation.manifestSha256 does not match shipped manifest.json bytes',
    };
  }
  if (attestation.packetContentId !== manifest.packetContentId) {
    return {
      ok: false,
      code: 'PKT_MANIFEST_BINDING_MISMATCH',
      detail: 'attestation.packetContentId != manifest.packetContentId',
    };
  }
  return { ok: true };
}

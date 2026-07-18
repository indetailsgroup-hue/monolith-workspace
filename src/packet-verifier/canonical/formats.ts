// S17-5 — canonical scalar formats (spec §7.6, §7.10)
// Shared by checks 2/5/7. All validators are exact-form: no trimming, no
// case-folding, no normalization before judgment.

/** identity fields: `sha256:<64-lowercase-hex>` (§7.6). */
export const SHA256_FIELD_REGEX = /^sha256:[0-9a-f]{64}$/;

/** bare digest form: 64 lowercase hex characters. */
export const HEX64_REGEX = /^[0-9a-f]{64}$/;

/** §7.10 — RFC 3339 pinned shape `YYYY-MM-DDTHH:mm:ss.sssZ` (exactly 3 ms digits, Z only). */
export const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** §7.10 — lowercase RFC 4122 canonical UUID (any version digit kept strict at v4 per NFP name rule callers). */
export const UUID_LOWER_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** §7.10 — SemVer 2.0.0, no leading `v`. */
export const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isSha256Field(s: string): boolean {
  return SHA256_FIELD_REGEX.test(s);
}

export function isCanonicalTimestamp(s: string): boolean {
  if (!TIMESTAMP_REGEX.test(s)) return false;
  // shape is pinned; also require a real calendar instant (rejects 2026-13-40T25:61:61.000Z)
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  // roundtrip: Date#toISOString emits exactly YYYY-MM-DDTHH:mm:ss.sssZ for this range
  return new Date(t).toISOString() === s;
}

export function isLowercaseUuid(s: string): boolean {
  return UUID_LOWER_REGEX.test(s);
}

export function isSemver(s: string): boolean {
  return SEMVER_REGEX.test(s);
}

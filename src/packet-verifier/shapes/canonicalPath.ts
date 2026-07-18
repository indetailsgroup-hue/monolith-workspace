// S17-5 — canonical path rules, transcribed from common.schema.json#/$defs/canonicalPath
// (independent review 2026-07-18, F-02: one validator for BOTH the ZIP layer and
// the manifest layer, covering the x-monolith-normalization and
// x-monolith-windowsSegmentRules annotations the regex alone cannot express).

// Built via RegExp constructor so the source stays pure ASCII — the class is
// exactly the schema's forbidden set: < > : " | ? * plus C0 controls and DEL.
const CONTROL_OR_FORBIDDEN = new RegExp('[<>:"|?*\\u0000-\\u001F\\u007F]');
// Windows reserved device names — reserved with or without an extension,
// case-insensitive (CON, PRN, AUX, NUL, COM1..9, LPT1..9).
const WINDOWS_RESERVED = new RegExp('^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)', 'i');

export interface PathVerdict {
  ok: boolean;
  detail?: string;
}

/** Validate one packet path against the full canonicalPath contract. */
export function validateCanonicalPath(path: string): PathVerdict {
  const bad = (detail: string): PathVerdict => ({ ok: false, detail });

  if (path.length === 0) return bad('empty path');
  if (new TextEncoder().encode(path).length > 128) return bad('path exceeds 128 UTF-8 bytes');
  if (path !== path.normalize('NFC')) return bad('path is not Unicode NFC');
  if (path.startsWith('/')) return bad('absolute path');
  if (path.includes('\\')) return bad('backslash in path');
  if (path.endsWith('/')) return bad('trailing slash');
  if (CONTROL_OR_FORBIDDEN.test(path)) return bad('forbidden character in path');

  for (const segment of path.split('/')) {
    if (segment.length === 0) return bad('empty path segment');
    if (segment === '.' || segment === '..') return bad('dot/dotdot segment');
    if (segment.endsWith('.') || segment.endsWith(' ')) return bad('segment has trailing dot or space');
    if (WINDOWS_RESERVED.test(segment)) return bad('Windows reserved device name: ' + segment);
  }
  return { ok: true };
}

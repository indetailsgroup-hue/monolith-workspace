# MONOLITH Verifier Golden Strings Specification

**Version**: 2.0.0
**P1.1 Factory Ops UX - Verifier Output Contract v1**

This document defines the canonical output format for `monolith-verify` CLI tool.
The format is designed to be:
- Human-readable for factory operators
- 100% deterministically parseable on all OS
- Independent of node/python error message formats

---

## 1. Output Format (Strict)

### 1.1 Golden Header (Required first line)

```
MONOLITH_VERIFY_V1
```

If this header is missing, parser falls back to legacy regex mapping.

### 1.2 Key-Value Lines

Format: `KEY=VALUE` (one per line, no spaces around `=`)

#### Required Keys (must always be present)

| Key | Values | Description |
|-----|--------|-------------|
| `VERDICT` | `PASS` \| `FAIL` \| `PASS_WITH_WARN` | Overall verification result |
| `CODE` | See canonical codes below | Error/success code |
| `EXIT_CODE` | Integer | Process exit code |
| `TOOL` | `monolith-verify` | Tool identifier |
| `TOOL_VERSION` | Semver or git SHA | Tool version |

#### Recommended Keys (include when available)

| Key | Format | Description |
|-----|--------|-------------|
| `JOB_ID` | String | Job identifier |
| `PACKET_PATH` | Path or basename | Input packet location |
| `PACKET_SHA256` | 64 hex chars | Packet file hash |
| `MANIFEST_HASH` | 64 hex chars | Signed manifest hash |
| `PUBLIC_KEY_ID` | String | Signing key identifier |
| `AUDIT_PUBLIC_KEY_ID` | String | Audit signing key |
| `SIGNED_AT` | ISO 8601 | Signature timestamp |
| `GATE_VERDICT` | `PASS` \| `FAIL` | Gate check result |
| `GATE_REPORT_HASH` | 64 hex chars | Gate report hash |
| `MERKLE_ROOT` | 64 hex chars | Audit merkle root |
| `AUDIT_DAY` | `YYYY-MM-DD` | Audit date |

### 1.3 Thai Summary Line

```
SUMMARY_TH=<short Thai message>
```

Rules:
- Single line only (no newlines)
- No additional `=` characters in value
- Operator-facing message

### 1.4 Log Section Marker

```
---LOG---
```

Everything after this marker is verbatim log output.
- Can include stdout/stderr combined
- Must NOT contain another `MONOLITH_VERIFY_V1` header
- Displayed as-is to operators

---

## 2. Canonical CODE List (v1)

> **Stability rule**: Codes are stable across versions.
> New codes can be added, but existing code meanings must never change.

### Success / Warning

| Code | Exit | Description |
|------|------|-------------|
| `OK` | 0 | All checks passed |
| `W_AUDIT_UNKNOWN` | 80 | Audit unavailable (still PASS) |
| `W_AUDIT_PENDING` | 80 | Audit processing (still PASS) |

### TRUST Errors (31-34, 40-43)

| Code | Exit | Description |
|------|------|-------------|
| `E_KEY_NOT_ALLOWED` | 31 | Key not in allowed keyset |
| `E_SIGNATURE_INVALID` | 32 | Signature verification failed |
| `E_ROOT_HASH_MISMATCH` | 33 | Manifest hash mismatch (tamper) |
| `E_COUNT_MISMATCH` | 34 | Package count mismatch |
| `E_PROOF_SCHEMA_INVALID` | 40 | Audit proof schema invalid |
| `E_PROOF_ROOT_MISMATCH` | 41 | Audit proof root mismatch |
| `E_PROOF_SIGNATURE_INVALID` | 42 | Audit proof signature invalid |
| `E_PROOF_KEY_NOT_ALLOWED` | 43 | Audit proof key not allowed |

### PACKET Errors (60-61)

| Code | Exit | Description |
|------|------|-------------|
| `E_PACKET_SCHEMA` | 60 | Schema validation failed |
| `E_PACKET_PARSE` | 61 | JSON parse error |
| `E_PACKET_MISSING_FILES` | 60 | Required files missing |

### GATE Errors (50)

| Code | Exit | Description |
|------|------|-------------|
| `E_GATE_FAIL` | 50 | Manufacturing rules failed |
| `E_GEOMETRY_INVALID` | 50 | Geometry constraint failed |
| `E_TOOL_CONSTRAINT_FAIL` | 50 | Tool requirement failed |

### SYSTEM Errors (70-71, 90)

| Code | Exit | Description |
|------|------|-------------|
| `E_VERIFY_EXEC` | 70 | Verifier not executable |
| `E_VERIFY_TIMEOUT` | 71 | Verification timeout |
| `E_VERIFY_UNKNOWN` | 90 | Unknown error |

---

## 3. Example Outputs

### 3.1 PASS (Safe to produce)

```
MONOLITH_VERIFY_V1
VERDICT=PASS
CODE=OK
EXIT_CODE=0
TOOL=monolith-verify
TOOL_VERSION=1.0.3
JOB_ID=JOB-2026-0012
PACKET_SHA256=2f3c8a1b9e4d7f6c5a2b1e8d7c6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f
MANIFEST_HASH=9b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b
PUBLIC_KEY_ID=arn:aws:kms:ap-southeast-1:123456789012:key/abc-123
SIGNED_AT=2026-01-17T09:21:00Z
GATE_VERDICT=PASS
SUMMARY_TH=ผ่านการตรวจ (ผลิตได้)
---LOG---
[verify] Packet: JOB-2026-0012.zip
[verify] Signature: VALID
[verify] Gate: PASS
[verify] Geometry: OK
[verify] Tools: OK
```

### 3.2 FAIL (Signature invalid)

```
MONOLITH_VERIFY_V1
VERDICT=FAIL
CODE=E_SIGNATURE_INVALID
EXIT_CODE=32
TOOL=monolith-verify
TOOL_VERSION=1.0.3
JOB_ID=JOB-2026-0012
PACKET_SHA256=2f3c8a1b9e4d7f6c5a2b1e8d7c6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f
MANIFEST_HASH=9b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b
PUBLIC_KEY_ID=arn:aws:kms:ap-southeast-1:123456789012:key/abc-123
SUMMARY_TH=ลายเซ็นไม่ถูกต้อง (ห้ามผลิต)
---LOG---
[verify] Packet: JOB-2026-0012.zip
[verify] ERROR: SIGNATURE_INVALID
[verify] verifyEd25519 returned false
[verify] manifestHash: 9b1a2c3d...
[verify] publicKeyId: arn:aws:kms:...

WARNING: This file may have been tampered with!
```

### 3.3 FAIL (Key not allowed)

```
MONOLITH_VERIFY_V1
VERDICT=FAIL
CODE=E_KEY_NOT_ALLOWED
EXIT_CODE=31
TOOL=monolith-verify
TOOL_VERSION=1.0.3
JOB_ID=JOB-2026-0012
PUBLIC_KEY_ID=arn:aws:kms:ap-southeast-1:123456789012:key/NEWKEY
SUMMARY_TH=คีย์ไม่อยู่ในรายการอนุญาต (ต้องอัปเดต keyset)
---LOG---
[verify] ERROR: KEY_NOT_ALLOWED
[verify] publicKeyId: arn:aws:kms:ap-southeast-1:123456789012:key/NEWKEY
[verify] Allowed keys:
[verify]   - arn:aws:kms:ap-southeast-1:123456789012:key/abc-123
[verify]   - arn:aws:kms:ap-southeast-1:123456789012:key/def-456
```

### 3.4 FAIL (Gate check failed)

```
MONOLITH_VERIFY_V1
VERDICT=FAIL
CODE=E_GATE_FAIL
EXIT_CODE=50
TOOL=monolith-verify
TOOL_VERSION=1.0.3
JOB_ID=JOB-2026-0015
GATE_VERDICT=FAIL
SUMMARY_TH=ไม่ผ่านกฎโรงงาน (Gate Fail)
---LOG---
[verify] Packet: JOB-2026-0015.zip
[verify] Signature: VALID
[verify] Checking gate rules...
[verify] ERROR: GATE_FAIL
[verify]   Rule: tool_available
[verify]   Detail: Tool T3 (8mm ball nose) not available
[verify]   Available tools: T1, T2, T4, T5
```

### 3.5 FAIL (Timeout - wrapper side)

When timeout occurs at backend wrapper (not verifier):

```
MONOLITH_VERIFY_V1
VERDICT=FAIL
CODE=E_VERIFY_TIMEOUT
EXIT_CODE=71
TOOL=factory-service
TOOL_VERSION=0.4.0
JOB_ID=JOB-2026-0012
SUMMARY_TH=ตรวจนานเกินกำหนด (timeout)
---LOG---
[factory-service] Process killed after 25s timeout
[factory-service] monolith-verify did not respond
```

### 3.6 PASS_WITH_WARN (Audit unavailable)

```
MONOLITH_VERIFY_V1
VERDICT=PASS_WITH_WARN
CODE=W_AUDIT_UNKNOWN
EXIT_CODE=80
TOOL=monolith-verify
TOOL_VERSION=1.0.3
JOB_ID=JOB-2026-0012
GATE_VERDICT=PASS
SUMMARY_TH=ผ่าน แต่ตรวจ audit ไม่สำเร็จ (ยังผลิตได้)
---LOG---
[verify] Packet: JOB-2026-0012.zip
[verify] Signature: VALID
[verify] Gate: PASS
[verify] WARNING: Audit verification unavailable (offline mode)
[verify] RESULT: PASS (with warning)
```

---

## 4. Parser Implementation

### 4.1 Minimal Parser (TypeScript)

```typescript
interface GoldenResult {
  kv: Record<string, string>;
  log: string;
}

function parseGolden(output: string): GoldenResult | null {
  const lines = output.split(/\r?\n/);

  // Check header
  if (lines[0] !== "MONOLITH_VERIFY_V1") {
    return null; // Legacy output, use regex fallback
  }

  const kv: Record<string, string> = {};
  let i = 1;

  // Parse KV lines until ---LOG---
  for (; i < lines.length; i++) {
    if (lines[i] === "---LOG---") {
      i++;
      break;
    }
    const match = lines[i].match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      kv[match[1]] = match[2];
    }
  }

  // Rest is verbatim log
  const log = lines.slice(i).join("\n");

  return { kv, log };
}
```

### 4.2 Parser Algorithm

1. Read first line - must equal `MONOLITH_VERIFY_V1`
2. If not, return `null` (fallback to legacy regex mapping)
3. Read KV lines until `---LOG---` marker
4. Parse each line as `KEY=VALUE`
5. Everything after `---LOG---` is verbatim log

### 4.3 Backward Compatibility

If header is missing, use legacy pattern matching:

```typescript
function parseOutput(output: string): VerifyApiResponse {
  // Try golden format first
  const golden = parseGolden(output);
  if (golden) {
    return goldenToResponse(golden);
  }

  // Fallback to legacy regex mapping
  return legacyNormalize(output);
}
```

---

## 5. Implementation Guidance

### 5.1 Verifier Side (monolith-verify)

Create helper function to emit golden output:

```typescript
function emitGolden(
  verdict: string,
  code: string,
  exitCode: number,
  details: Record<string, string>,
  summaryTh: string,
  logLines: string[]
): void {
  console.log("MONOLITH_VERIFY_V1");
  console.log(`VERDICT=${verdict}`);
  console.log(`CODE=${code}`);
  console.log(`EXIT_CODE=${exitCode}`);
  console.log(`TOOL=monolith-verify`);
  console.log(`TOOL_VERSION=${VERSION}`);

  for (const [key, value] of Object.entries(details)) {
    console.log(`${key}=${value}`);
  }

  console.log(`SUMMARY_TH=${summaryTh}`);
  console.log("---LOG---");

  for (const line of logLines) {
    console.log(line);
  }
}
```

### 5.2 Rules

- Use `stdout` for golden lines + log
- Use `stderr` only for fatal crashes
- Recommend merging stderr into `---LOG---` section
- Never use ad-hoc `console.log` for structured output

### 5.3 Wrapper Services

When wrapper (not verifier) generates errors:
- Must emit same golden format
- Set `TOOL=<wrapper-name>` (e.g., `factory-service`)
- Keeps UI consistent

---

## 6. FE/BE Integration

### Backend Changes

1. If output has `MONOLITH_VERIFY_V1` header:
   - Parse KV directly into `details`
   - Extract `VERDICT`, `CODE`, `SUMMARY_TH`
   - Return structured `VerifyApiResponse`

2. If legacy output (no header):
   - Use `EXIT_CODE_MAP` and `PATTERN_RULES` from `verifyNormalizer.ts`
   - Normalize to `VerifyApiResponse`

### Frontend Changes

1. If `details` present in API response:
   - Render expandable details viewer
   - Show all KV pairs

2. Log display:
   - Always show verbatim (including golden lines if desired)
   - Provides transparency for operators

---

## 7. Test Cases

### Test: Golden output parsed correctly

```
Input:
  MONOLITH_VERIFY_V1
  VERDICT=PASS
  CODE=OK
  EXIT_CODE=0
  TOOL=monolith-verify
  TOOL_VERSION=1.0.3
  JOB_ID=JOB-001
  SUMMARY_TH=ผ่าน
  ---LOG---
  All OK

Expected:
  kv.VERDICT = "PASS"
  kv.CODE = "OK"
  kv.EXIT_CODE = "0"
  kv.JOB_ID = "JOB-001"
  log = "All OK"
```

### Test: Legacy output falls back to regex

```
Input:
  [verify] ERROR: SIGNATURE_INVALID
  Exit code: 32

Expected:
  parseGolden returns null
  legacyNormalize matches SIGNATURE_INVALID pattern
  code = E_SIGNATURE_INVALID
```

### Test: Windows line endings handled

```
Input: "MONOLITH_VERIFY_V1\r\nVERDICT=PASS\r\n..."
Expected: Parses correctly (split on /\r?\n/)
```

---

## Changelog

| Version | Date       | Changes |
|---------|------------|---------|
| 2.0.0   | 2026-01-17 | Golden format v1 with KV lines and ---LOG--- separator |
| 1.0.0   | 2026-01-17 | Initial spec with regex patterns |

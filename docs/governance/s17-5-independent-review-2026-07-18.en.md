# S17-5 Full Verifier — Independent Review

Review date: 2026-07-18
Status: **RECORDED — independent technical review; not approval and does not lift NO_CUT**
Verdict: **FIX-THEN-SHIP**
Reviewer: OpenAI Codex desktop — independent-review session/branch `review/s17-5-independent`
Reviewed commit: `955d127b9359de4a4c1b39792288120221c4aab8`
Verifier tree: `905c4644abf225b89b5d1f4132fdb94126a68dbd`
TH spec SHA-256: `ce597ef30f701d114f90852d4460c050bcf09e60bb1c2d468ce31136197faed3`

> **One-line verdict:** **fix-then-ship — do not call S17-5 a Full Verifier or rely on `VERIFIED` until the payload/gate-schema false acceptance is fixed; this is the largest defect**

## 1. Scope, pin, and independence

- Before review, `git rev-parse origin/main` and `HEAD` both resolved to `955d127b9359de4a4c1b39792288120221c4aab8`. `origin/main` advanced later due to concurrent work, while the review branch remained pinned to the reviewed commit.
- Scope covered all 27 files under `src/packet-verifier/`, the bundle under `docs/specs/schemas/`, the TH specification at the digest above, the verifier plan, and interop evidence.
- No production source, test, or fixture was changed. This branch changes only review-record editions and their manifest.
- Method: trace the actual call path, compare each §12 ladder step to normative text, map the corpus to §14, run the mandated commands independently, and execute file-free boundary probes.
- Claims from other sessions were not counted as evidence even when summaries or pasted reports appeared during the review.

### SoD limitation that must remain explicit

The S17-5 builder is identified as Claude, and this session did not build S17-5. However, governance history labels the S17-3/4 builder as “Codex,” which is also this reviewer's product identity. The repository therefore cannot prove identity-level separation from the S17-3/4 builder under the strictest reading of ADR-065, even though the session, worktree, branch, and evidence derivation were isolated. This record is an **independent technical review** suitable for defect decisions, but must not alone claim closure of the SoD identity leg. If the owner requires literal different-agent identity, a third reviewer must add a separate record.

## 2. Scrutinize: intent and simpler alternative

The intent is sound: the verifier must judge exact bytes independently of the generator, must not normalize ZIP input before judgment, and must fail closed. Sharing generator code/fixtures or using a ZIP library that repairs input would be shorter but would break SoD and the byte-profile threat model. A separate verifier and strict ZIP reader are therefore justified.

The schema layer should not be expanded through more hand transcription. The current implementation transcribes only manifest/attestation and canonical-parses the remaining payloads, which loses the contract. The smaller safe approach is to compile or generate standalone validators from the **exact pinned Draft 2020-12 bundle** and enforce a closed `path ↔ contentSchema ↔ validator` map without sharing S17-4 implementation code.

## 3. §12 ladder assessment

| Check | Assessment | Short evidence |
| --- | --- | --- |
| 1 Container safety | **Confirmed correct in source** | strict STORE profile, pinned headers/metadata, no gap/overlap/trailing bytes, CRC/size, ordering, and limits in `zipStrictReader.ts:94-265` |
| 2 Strict parse | **Incomplete — BLOCKER** | `verifyPacket.ts:86-121` validates schemas only for manifest/attestation; other JSON payloads get only a JCS parse |
| 3 Exact file set | **Incomplete — MAJOR** | `identityChecks.ts:25-60` compares ZIP names to manifest names but does not require the v2 payload set or file-to-schema mapping |
| 4 Byte integrity | **Confirmed correct** | raw size before raw SHA-256 per path (`identityChecks.ts:67-89`) |
| 5 Content identity | **Confirmed correct** | omits only `packetContentId`, then JCS+hash (`identityChecks.ts:97-117`) |
| 6 Manifest binding | **Confirmed correct** | hashes exact manifest bytes and compares packet ID (`identityChecks.ts:125-145`) |
| 7 Identity consistency | **Incomplete — BLOCKER** | compares attestation↔manifest and gate digest only; does not read result/policy from gate evidence (`consistencyCheck.ts:41-58`) |
| 8 Signature | **Primitives correct; lifecycle incomplete — MAJOR** | preimage/raw Base64/range/low-S/SPKI/verify are sound; boundary/history policy is not (`signatureCheck.ts:97-110`) |
| 9 Authoritative | **Incomplete — BLOCKER/MAJOR** | checks the attested policy version but not gate-evidence PASS (`policyChecks.ts:64-68`); lookup exceptions are not mapped |
| 10 Run/replay | **Core logic correct; exception path incomplete** | one-to-one run/content and fingerprint/run checks (`policyChecks.ts:80-98`), but rejected Promises escape the result contract |
| 11 Shadow policy | **Confirmed correct** | exact marker bytes/hash/schema, filename binding, and NO_CUT ceiling (`policyChecks.ts:102-162`) |
| 12 Audit result | **Incomplete — MAJOR** | lacks policy versions, checked hashes, and actor/operator context (`verifyPacket.ts:38-52,199-216`) |

## 4. Findings by severity

### BLOCKER F-01 — verifier returns `VERIFIED` for schema-invalid gate evidence

**Evidence**

- Specification §7 and §12.2/7/9 require the closed schema bundle, matching gate fields, and gate evidence that is PASS under a supported policy.
- `gate-result.schema.json:7-12` requires `schema`, `policyVersion`, `result`, and `findings`.
- `runStrictParse()` at `verifyPacket.ts:102-112` only performs a JCS parse for payloads; it neither validates payload schemas nor retains the parsed gate value.
- `checkIdentityConsistency()` at `consistencyCheck.ts:41-58` checks only filename/digest.
- `checkAuthoritative()` at `policyChecks.ts:64-68` asks the authority about the version in the attestation only.
- The fixture itself writes `gate-result.json` as `{"result":"PASS"}` at `testkit/packetFixture.ts:38-43`.
- Independent probe on the pinned commit: gate bytes were `{"result":"PASS"}`, yet the result was `{integrityStatus:"VERIFIED", operationalDisposition:"NO_CUT", code:"PKT_OK_SHADOW_ONLY"}`; probe exit 0.

**Impact**: a coherently signed packet with schema-invalid payload or gate evidence can receive integrity `VERIFIED`. NO_CUT still prevents real cutting, but this blocks the Full Verifier claim and invalidates integrity evidence.

**Suggested change**: validate every payload against the exact bundle; enforce a closed path/media/schema registry; parse `gate-result.json`; require schema/result/policy agreement with the signed fields and authority. Upgrade the fixture to a genuinely valid packet and add negatives for gate FAIL, missing/unknown fields, policy mismatch, and array ordering.

### MAJOR F-02 — exact v2 payload set and canonical-path policy are not enforced

`identityChecks.ts:38-59` accepts any payload set on which the manifest and ZIP agree, as long as the NFP marker and manifest count pass. It does not require the §6 v2 payloads (`connector-ops`, `connectors.minifix`, `cutlist`, `drillmap`, `gate-result`). `shapes.ts:157-183` also omits NFC, Windows reserved-name, and trailing-dot/space rules from `common.schema.json:12-18`.

**Suggested change**: pin the required v2 set and exact schema/media mapping; permit extensions only for a supported schema-minor profile declared by this verifier; use one canonical-path validator for ZIP and manifest.

### MAJOR F-03 — lookup exceptions escape the stable result and produce no audit for that run

Interfaces define an `unavailable` sentinel, but call sites use uncaught `await` operations (`signatureCheck.ts:89`, `policyChecks.ts:36-68,84-97`). `verifyPacket.ts:134-197` has no exception boundary before audit construction at `:199-216`.

An independent probe made the key registry throw: `verifyPacket()` threw `simulated registry outage`; one successful run had produced one audit record, and the count remained one after the outage, proving that the outage run emitted neither `PKT_AUTHORITY_UNAVAILABLE` nor an audit.

**Suggested change**: wrap every dependency call and map rejected/thrown/malformed responses to `PKT_AUTHORITY_UNAVAILABLE`; guarantee an audit attempt in a finally path and define the returned behavior when the audit sink itself fails.

### MAJOR F-04 — key lifecycle boundaries, historical policy, and issued-time policy do not match §10.2

- Code uses `issued > notAfter` instead of required `issuedAt < notAfter` (`signatureCheck.ts:101-106`).
- RETIRED rejects only when `retiredAt` exists, and uses `>` rather than `<` (`:108-109`).
- No verifier-policy input explicitly permits historical verification; `TrustedKeyRecord` has only optional `retiredAt` (`:30-39`).
- `deps.now()` is documented as audit-only (`verifyPacket.ts:65-66`), so the §8.1 verifier-policy skew is absent.
- The calendar-valid timestamp helper exists but is used only by tests; attestation shape uses only a regex (`shapes.ts:20-21,234`; `formats.ts:25-31`).

An independent probe confirmed that `issuedAt == notAfter`, RETIRED without `retiredAt`, and `issuedAt == retiredAt` all returned `{ok:true}`.

**Suggested change**: enforce half-open windows; require a RETIRED boundary plus an explicit allowHistorical policy; validate registry timestamps/key identity/algorithm; pin registry digest as well as version; expose and enforce an issued-time skew policy.

### MAJOR F-05 — audit record omits normative fields

Specification §12.12 requires verifier version, policy versions, checked hashes, result, time, and human/operator context. `AuditRecord` at `verifyPacket.ts:38-52` includes the schema aggregate, packet/manifest IDs, job run, and registry version, but omits gate/governance policy versions, per-file checked hashes, `actorSubjectId`/`authorizationContextId`, and operator context.

**Suggested change**: add the normative fields and exact pass/fail audit regression tests while retaining only opaque IDs and avoiding unnecessary PII.

### MAJOR F-06 — 128 tests genuinely pass, but the §14 tamper corpus is incomplete

Missing or unproven cases include invalid payload schemas/unknown fields/order rules/micrometre constraints, gate-result FAIL/policy mismatch, thrown authority/run-registry operations, lifecycle equality/missing retiredAt/history flag, invalid registry dates, issued-time skew, ZIP64/multi-disk/64-MiB-total cases, and exact audit contents. `PKT_SIGNATURE_MISSING` appears only in the type union (`codes.ts:40`) with no production emission path; a missing signature is absorbed by the shape layer as `PKT_ATTESTATION_INVALID`.

**Suggested change**: add a spec-indexed corpus table with one row per §14 mutation and the expected check+stable code, and test thrown dependency failures separately from sentinel returns.

### NIT F-07 — interop ZIP pin is strong, but metadata exact bytes are not pinned

`blackbox.interop.test.ts:28-29` correctly pins the generator commit and ZIP SHA-256, and the one-byte negative keeps the gate non-vacuous. The test does not pin the SHA-256 of `interop-meta.json`; `generatorTree`/`inputSha256` are typed but not asserted against constants, and the evidence manifest currently lists only the runner and report rather than the fixture pair.

**Suggested change**: pin the metadata SHA-256, assert tree/input digest, and add both meta+ZIP to the evidence manifest.

## 5. Confirmed-correct behavior

1. **Container byte profile is genuinely strict**: contiguous local offsets, matching local/central order, no gaps/overlaps/trailing bytes, STORE-only, pinned flags/time/mode, real CRC+size validation, duplicate/case-collision rejection, and limits.
2. **JCS/strict JSON core is sound**: duplicate keys are rejected before object construction; BOM, invalid UTF-8, negative zero, unsafe canonical integers, lone surrogates, and non-canonical bytes are rejected; UTF-16 key ordering matches RFC 8785.
3. **Content identity chain is correct**: path/size/hash are inside the descriptor, only the content ID is omitted, exact manifest bytes are bound, and the attested packet ID is compared.
4. **Signature primitives are correct**: protected header retained, only `valueBase64` omitted, correct domain prefix, strict padded raw 64-byte Base64, scalar range, high-S rejection using `s > floor(n/2)` so the exact floor boundary is allowed, strict SPKI OIDs/DER/point form, and verify-only WebCrypto behavior.
5. **First-fail-wins holds for handled outcomes**: the orchestrator returns immediately in ladder order and later diagnostics cannot replace the primary code. Thrown dependency paths are the F-03 exception.
6. **`PKT_OK` is unreachable by construction**: absent from `PacketResultCode`; the success constructor emits only `PKT_OK_SHADOW_ONLY`; the disposition type contains only `NO_CUT`.
7. **NFP pin is exact**: independent recomputation produced 824 bytes and SHA-256 `40a4d63f…7d68a`; filename binds job run and content prefix.
8. **Black-box ZIP pin is real**: fixture ZIP SHA-256 `8a40f975…90ddb` matches the literal; the test consumes frozen bytes and a one-byte mutation fails closed.

## 6. Fresh execution evidence

| Command/probe | Result |
| --- | --- |
| `npm ci` (root) | exit 0; 586 packages; npm audit reported 18 issues (not classified as S17-5 runtime defects because production verifier imports are local/WebCrypto only) |
| `cd server && npm ci` | exit 0; 220 packages; npm audit reported 13 issues; required for suite collection dependencies |
| `npx vitest run src/packet-verifier` | exit 0; 6 files; **128/128 PASS** |
| `npx tsc --noEmit -p tsconfig.json` | exit 0; no diagnostics |
| `npm run test:node` | exit 0; **27/27 PASS** |
| Gate-schema boundary probe | exit 0; invalid `{"result":"PASS"}` received `VERIFIED/NO_CUT/PKT_OK_SHADOW_ONLY` |
| Registry-throw probe | probe wrapper exit 0; verifier threw and did not append an audit for the outage run |
| Lifecycle boundary probe | exit 0; all three invalid boundary/policy cases returned `{ok:true}` |
| NFP recomputation | exit 0; byte count/hash match = `true` |

> Passing tests are evidence only for their covered scope; they do not negate the false acceptance demonstrated by independent probes.

## 7. Required re-review gate

Before ship, the S17-5 builder must provide a fixing commit and an independent reviewer must verify at least:

1. payload/gate schemas and the exact file/schema registry reject invalid packets;
2. gate evidence PASS/policy/file fields agree with the attestation and authority;
3. every thrown lookup returns a stable fail-closed code and produces audit evidence;
4. lifecycle half-open boundaries, RETIRED history policy, and skew;
5. complete normative audit fields; and
6. full §14 tamper corpus with fresh passing output.

This review does not change production code under SoD. The owner merges the review-record PR; the builder fixes source through the receiving-code-review flow.

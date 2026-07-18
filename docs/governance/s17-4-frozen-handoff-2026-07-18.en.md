# S17-4 — Frozen Implementation Handoff

- Date: 2026-07-18
- Owner: Dave
- Builder: Codex
- Status: **FROZEN E0 CANDIDATE — HANDOFF READY — NFP / NO_CUT**

## 1. Exact freeze anchor

| Item | Pinned value |
|---|---|
| Branch | `s17/track-b-generator` |
| Frozen implementation commit | `eeed1ce6b4388db5c661932a419e5d2c61267712` |
| Git tree | `da717b31f26f7000e5f94fad854cb0dd13c61004` |
| Parent / opening base | `6c1a6f59efe16b3aadfc64f582202b6ee16b9019` |
| Contract | CT-DEC-002 / S17-3 Canonical Factory Packet Specification v0.4.1 |
| Spec manifest SHA-256 | `5473958a64c7c19f3ce5288d7f2b9d0a42157bb1086a84f90256dbf56b370a69` |
| Schema aggregate | `1964b5d0f7346334cd764f21c31028ab8b38c52cf289f82511432346d93a67f2` |

“Frozen” in this record means that review and testing must target only the exact commit above. Any defect must be addressed by a new patch commit; this commit must not be silently rewritten or replaced. This handoff record lives in a separate child commit, so it does not alter the frozen implementation tree.

## 2. Frozen byte scope

The commit changes exactly 20 paths: three configuration paths and 17 S17-4 source, test, and fixture paths.

### Configuration and CI

- `.github/workflows/verify-full.yml`
- `package.json`
- `server/package.json`

### Generator source

- `server/src/packet/v2/canonical.ts`
- `server/src/packet/v2/constants.ts`
- `server/src/packet/v2/fileRunStore.ts`
- `server/src/packet/v2/generator.ts`
- `server/src/packet/v2/index.ts`
- `server/src/packet/v2/payloads.ts`
- `server/src/packet/v2/signature.ts`
- `server/src/packet/v2/types.ts`
- `server/src/packet/v2/zip.ts`

### E0 tests and golden fixtures

- `server/src/packet/v2/__tests__/canonical.test.ts`
- `server/src/packet/v2/__tests__/file-run-store.test.ts`
- `server/src/packet/v2/__tests__/fixtures.ts`
- `server/src/packet/v2/__tests__/fixtures/golden-input.json`
- `server/src/packet/v2/__tests__/fixtures/golden-expected.json`
- `server/src/packet/v2/__tests__/generator.test.ts`
- `server/src/packet/v2/__tests__/schema-contract.test.ts`
- `server/src/packet/v2/__tests__/signature.test.ts`

## 3. Contract implemented by this candidate

1. Build a deterministic content plane using JCS, integer micrometres, schema-owned array ordering, lowercase SHA-256, and a path-aware `packetContentId`
2. Separate the run-specific plane from content identity: `jobRunId`, `issuedAt`, actor, and signature are not inputs to `packetContentId`
3. Create a method-0 ZIP under the fixed byte profile, with `manifest.json` first, payloads in unsigned UTF-8 order, and `attestation.json` last
4. Enforce the shadow contract through the exact pinned `NOT_FOR_PRODUCTION.txt` bytes and an `NFP-` filename prefix
5. Use a mockable signing port for S17-6: `ECC_NIST_P256`, KMS `ECDSA_SHA_256`, and `MessageType=DIGEST`; convert KMS DER to raw 64-byte `r‖s`, normalize to low-S, and encode canonical Base64
6. Bind the idempotency key/fingerprint, server-owned UUID v4 `jobRunId`, actor, authorization context, and `packetContentId` through in-memory and durable file run stores
7. Add a separate CI job for compilation, the golden/determinism/adversarial suite, and a JSON evidence artifact

## 4. Fresh pre-freeze verification

Every result below was run from the same worktree as the frozen commit before committing, with output read through the final summary and the exit code checked.

| Command | Scope | Result |
|---|---|---|
| `npm.cmd run test:s17-4` from the repository root | root forwarding command + focused S17-4 suite | exit 0; test files 5/5; tests 21/21; fail 0 |
| `npm.cmd run test:s17-4 -- --reporter=default --reporter=json --outputFile=s17-4-report.json` from `server/` | exact CI test command | exit 0; test files 5/5; tests 21/21; fail 0 |
| `npm.cmd run test:run -- --reporter=default --reporter=json --outputFile=server-test-report.json` from `server/` | factory-server regression suite | exit 0; test files 7/7; tests 51/51; fail 0 |
| `npm.cmd run build` from `server/` | TypeScript compilation | exit 0 |
| `npm.cmd run test:node` from the repository root | governance tooling + schema-bundle controls | exit 0; tests 13/13; fail 0 |
| `node scripts/verify-sha256-manifest.mjs docs/specs/s17-canonical-packet-spec-v1.sha256` | approved spec/schema bytes | exit 0; manifest entries 16/16 PASS |
| `git diff --cached --check` | exact staged implementation bytes | exit 0 |

Environment note: the first invocation of the exact CI test inside a restricted execution sandbox stopped before loading `vitest.config.ts` because esbuild was denied access to a parent directory. That run was classified as UNKNOWN, not a source-test failure. The identical command was then run with normal repository read access and produced the exit-0 result above. No source change was made to bypass that environment restriction.

## 5. Independent S17-5 handoff contract

1. Use `eeed1ce6b4388db5c661932a419e5d2c61267712` as builder provenance; do not substitute working-tree bytes or a moving branch head
2. The official S17-5 review must build the verifier independently from the approved specification and schemas; it must not import generator source, helpers, or golden fixtures from `server/src/packet/v2/`
3. The builder must provide a packet ZIP produced from the exact frozen commit, together with SHA-256 values for the input, ZIP, commit, and environment as separate evidence. Producing and transferring that artifact is outside this freeze-only scope
4. The verifier must check the exact file set/order/profile, canonical bytes/digests/content identity, NFP precedence, signature encoding and low-S, trusted lookup/lifecycle, authoritative bindings, and the §12–§14 tamper corpus
5. Interoperability results must pin the verifier commit and input ZIP SHA-256. A failure must be filed against the frozen commit and fixed in a new commit

## 6. What this record does not approve

- It does not merge into `main` and does not modify S17-5
- It does not wire the generator into a production API/controller or the Track A authorization boundary
- It does not provision, import, or activate an AWS KMS key; this is an interface/mock boundary only
- It does not perform the S17-6 key ceremony, engineer bench work, machine calibration, or real-cut validation
- It does not change NFP/NO_CUT and creates no production authority or manufacturing release
- It does not declare S17-4 governance-complete; this is a frozen E0 implementation candidate awaiting independent S17-5/interoperability evidence
- At record creation time the branch had not been pushed; remote publication must preserve the exact commit IDs above

## 7. Reproduce

```text
git checkout eeed1ce6b4388db5c661932a419e5d2c61267712
npm.cmd run test:s17-4
cd server
npm.cmd run build
npm.cmd run test:run
```

Use `npm` instead of `npm.cmd` on Linux/CI.

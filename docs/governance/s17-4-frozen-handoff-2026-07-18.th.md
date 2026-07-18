# S17-4 — Frozen Implementation Handoff

- วันที่: 2026-07-18
- Owner: คุณเดฟ
- Builder: Codex
- สถานะ: **FROZEN E0 CANDIDATE — HANDOFF READY — NFP / NO_CUT**

## 1. Exact freeze anchor

| รายการ | ค่าที่ pin |
|---|---|
| Branch | `s17/track-b-generator` |
| Frozen implementation commit | `eeed1ce6b4388db5c661932a419e5d2c61267712` |
| Git tree | `da717b31f26f7000e5f94fad854cb0dd13c61004` |
| Parent / opening base | `6c1a6f59efe16b3aadfc64f582202b6ee16b9019` |
| Contract | CT-DEC-002 / S17-3 Canonical Factory Packet Specification v0.4.1 |
| Spec manifest SHA-256 | `5473958a64c7c19f3ce5288d7f2b9d0a42157bb1086a84f90256dbf56b370a69` |
| Schema aggregate | `1964b5d0f7346334cd764f21c31028ab8b38c52cf289f82511432346d93a67f2` |

คำว่า frozen ใน record นี้หมายถึงให้ review และทดสอบ exact commit ข้างต้นเท่านั้น หากพบ defect ต้องทำ patch เป็น commit ใหม่ ห้าม rewrite หรือแทนที่ commit นี้แบบเงียบ ๆ Handoff record นี้อยู่ใน child commit แยก จึงไม่เปลี่ยน implementation tree ที่ frozen แล้ว

## 2. ขอบเขต bytes ที่ frozen

Commit นี้เปลี่ยนทั้งหมด 20 path: configuration 3 path และ S17-4 source/test/fixture 17 path

### Configuration และ CI

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

### E0 tests และ golden fixtures

- `server/src/packet/v2/__tests__/canonical.test.ts`
- `server/src/packet/v2/__tests__/file-run-store.test.ts`
- `server/src/packet/v2/__tests__/fixtures.ts`
- `server/src/packet/v2/__tests__/fixtures/golden-input.json`
- `server/src/packet/v2/__tests__/fixtures/golden-expected.json`
- `server/src/packet/v2/__tests__/generator.test.ts`
- `server/src/packet/v2/__tests__/schema-contract.test.ts`
- `server/src/packet/v2/__tests__/signature.test.ts`

## 3. Contract ที่ implementation นี้ตั้งใจทำ

1. สร้าง deterministic content plane ด้วย JCS, integer micrometre, schema-owned array ordering, lowercase SHA-256 และ path-aware `packetContentId`
2. แยก run-specific plane ออกจาก content identity โดย `jobRunId`, `issuedAt`, actor และ signature ไม่เป็น input ของ `packetContentId`
3. สร้าง ZIP แบบ method-0 ตาม fixed byte profile โดย entry แรกคือ `manifest.json`, payload เรียง unsigned UTF-8 และ entry สุดท้ายคือ `attestation.json`
4. บังคับ shadow contract ด้วย `NOT_FOR_PRODUCTION.txt` ที่ pin exact bytes และชื่อไฟล์ขึ้นต้น `NFP-`
5. ใช้ signing port ที่ mock ได้สำหรับ S17-6: `ECC_NIST_P256`, KMS `ECDSA_SHA_256`, `MessageType=DIGEST`; แปลง DER จาก KMS เป็น raw `r‖s` 64 bytes, normalize low-S แล้ว Base64 แบบ canonical
6. ผูก idempotency key/fingerprint, server-owned UUID v4 `jobRunId`, actor, authorization context และ `packetContentId` ผ่าน in-memory และ durable file run stores
7. เพิ่ม CI job แยกสำหรับ build, golden/determinism/adversarial suite และ JSON evidence artifact

## 4. Fresh verification ก่อน freeze

ผลทั้งหมดต่อไปนี้รันจาก worktree เดียวกับ frozen commit ก่อน commit และอ่าน output ถึง final summary พร้อม exit code แล้ว

| Command | Scope | ผล |
|---|---|---|
| `npm.cmd run test:s17-4` จาก repository root | root forwarding command + S17-4 focused suite | exit 0; test files 5/5; tests 21/21; fail 0 |
| `npm.cmd run test:s17-4 -- --reporter=default --reporter=json --outputFile=s17-4-report.json` จาก `server/` | exact CI test command | exit 0; test files 5/5; tests 21/21; fail 0 |
| `npm.cmd run test:run -- --reporter=default --reporter=json --outputFile=server-test-report.json` จาก `server/` | factory-server regression suite | exit 0; test files 7/7; tests 51/51; fail 0 |
| `npm.cmd run build` จาก `server/` | TypeScript compile | exit 0 |
| `npm.cmd run test:node` จาก repository root | governance tooling + schema-bundle controls | exit 0; tests 13/13; fail 0 |
| `node scripts/verify-sha256-manifest.mjs docs/specs/s17-canonical-packet-spec-v1.sha256` | approved spec/schema bytes | exit 0; manifest entries 16/16 PASS |
| `git diff --cached --check` | exact staged implementation bytes | exit 0 |

หมายเหตุ environment: การเรียก exact CI test ครั้งแรกภายใน restricted execution sandbox หยุดก่อน load `vitest.config.ts` เพราะ esbuild ถูกปฏิเสธสิทธิ์อ่าน parent directory จึงจัดเป็น UNKNOWN ไม่ใช่ผล test ของ source จากนั้นรันคำสั่งเดิมด้วยสิทธิ์อ่าน repository ปกติและได้ผล exit 0 ข้างต้น ไม่มีการแก้ source เพื่อหลบปัญหานี้

## 5. Independent S17-5 handoff contract

1. ใช้ `eeed1ce6b4388db5c661932a419e5d2c61267712` เป็น builder provenance; ห้ามใช้ working-tree bytes หรือ moving branch head แทน
2. Official S17-5 review ต้องสร้าง verifier จาก approved spec และ schemas โดยอิสระ ห้าม import generator source, helper หรือ golden fixture จาก `server/src/packet/v2/`
3. Builder ต้องส่ง packet ZIP ที่สร้างจาก exact frozen commit พร้อม SHA-256 ของ input, ZIP, commit และ environment เป็น evidence แยก การสร้าง/ส่ง artifact ดังกล่าวไม่รวมอยู่ใน freeze-only scope รอบนี้
4. Verifier ต้องตรวจ exact file set/order/profile, canonical bytes/digests/content identity, NFP precedence, signature encoding + low-S, trusted lookup/lifecycle, authoritative bindings และ tamper corpus ตาม §12–§14
5. ผล interop ต้องบันทึก verifier commit และ input ZIP SHA-256 ชัดเจน หากไม่ผ่านให้เปิด finding ต่อ frozen commit และแก้ด้วย commit ใหม่

## 6. สิ่งที่ record นี้ไม่ได้อนุมัติ

- ไม่ได้ merge เข้า `main` และไม่ได้แก้ S17-5
- ไม่ได้ wire generator เข้ากับ production API/controller หรือ Track A authorization boundary
- ไม่ได้ provision/import/activate AWS KMS key; adapter นี้เป็น interface/mock boundary เท่านั้น
- ไม่ได้ทำ S17-6 key ceremony, engineer bench, machine calibration หรือ real-cut validation
- ไม่ได้เปลี่ยน NFP/NO_CUT และไม่สร้าง production authority หรือ manufacturing release
- ไม่ได้ประกาศว่า S17-4 ปิดงานเชิง governance; สถานะคือ frozen E0 implementation candidate รอ independent S17-5/interoperability evidence
- ณ เวลาสร้าง record ยังไม่ได้ push branch; remote publication ต้องรักษา exact commit IDs ข้างต้น

## 7. Reproduce

```text
git checkout eeed1ce6b4388db5c661932a419e5d2c61267712
npm.cmd run test:s17-4
cd server
npm.cmd run build
npm.cmd run test:run
```

บน Linux/CI ให้ใช้ `npm` แทน `npm.cmd`

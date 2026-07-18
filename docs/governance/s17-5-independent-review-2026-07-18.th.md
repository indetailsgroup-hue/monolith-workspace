# S17-5 Full Verifier — Independent Review

วันที่ตรวจ: 2026-07-18
สถานะ: **RECORDED — independent technical review; ไม่ใช่ approval และไม่ปลด NO_CUT**
Verdict: **FIX-THEN-SHIP**
ผู้ตรวจ: OpenAI Codex desktop — independent-review session/branch `review/s17-5-independent`
Commit ที่ตรวจ: `955d127b9359de4a4c1b39792288120221c4aab8`
Verifier tree: `905c4644abf225b89b5d1f4132fdb94126a68dbd`
Spec TH SHA-256: `ce597ef30f701d114f90852d4460c050bcf09e60bb1c2d468ce31136197faed3`

> **Verdict บรรทัดเดียว:** **fix-then-ship — ห้ามเรียก S17-5 ว่า Full Verifier หรือใช้ผล `VERIFIED` จนกว่าจะแก้ false-accept ของ payload/gate schema; นี่คือ defect ใหญ่สุด**

## 1. Scope, pin และความอิสระ

- ก่อนเริ่มตรวจ `git rev-parse origin/main` และ `HEAD` ตรงกันที่ `955d127b9359de4a4c1b39792288120221c4aab8`; ระหว่างการตรวจ `origin/main` เดินหน้าต่อเพราะมีงานขนาน แต่ review branch คงอยู่ที่ commit ที่ pin ไว้ตลอด
- ตรวจ `src/packet-verifier/` 27 ไฟล์, schema bundle ใต้ `docs/specs/schemas/`, สเปก TH ที่ hash ข้างต้น, แผน verifier และ interop evidence
- ไม่แก้ production source, tests หรือ fixtures ใด ๆ; การเปลี่ยนแปลงใน branch นี้มีเฉพาะ review record editions และ manifest
- วิธีตรวจ: อ่าน source ตาม actual call path, เทียบ ladder §12 ทีละขั้น, ตรวจ tamper corpus กับ §14, รันชุดทดสอบเอง และยิง boundary probes แบบไม่สร้างไฟล์
- ไม่ใช้คำอ้างจาก session อื่นเป็นหลักฐาน แม้มี summary/รายงานก่อนหน้าปรากฏระหว่างงาน

### ข้อจำกัด SoD ที่ต้องบันทึกตรง ๆ

S17-5 builder ถูกระบุเป็น Claude และ session นี้ไม่ได้สร้าง S17-5 อย่างไรก็ดี governance history เรียก S17-3/4 builder ว่า “Codex” เช่นเดียวกับ product identity ของผู้ตรวจนี้ จึงพิสูจน์จาก repo ไม่ได้ว่า identity-level separation จาก S17-3/4 builder ปิดครบตามการตีความที่เข้มที่สุดของ ADR-065 แม้ session/worktree/branch และ evidence derivation จะแยกขาดกัน Record นี้จึงเป็น **independent technical review** ที่ใช้ตัดสิน defect ได้ แต่ห้ามใช้เพียงลำพังเพื่ออ้างว่า SoD identity leg ปิดแล้ว หาก owner ต้องการ different-agent identity แบบ literal ต้องมี reviewer คนที่สามลงบันทึกเพิ่ม

## 2. Scrutinize: intent และทางที่ง่ายกว่า

Intent ถูกต้อง: verifier ต้องตัดสิน exact bytes โดยอิสระจาก generator, ห้าม normalize ZIP ก่อนตัดสิน, และต้อง fail closed การแชร์ generator code/fixtures หรือใช้ ZIP library ที่ repair input อัตโนมัติอาจสั้นกว่าแต่ทำลาย SoD และ byte-profile threat model ดังนั้น separate verifier + strict ZIP reader เป็น design ที่สมเหตุผล

ส่วนที่ไม่ควรทำมือเพิ่มคือ schema layer: ตอนนี้ transcribe เฉพาะ manifest/attestation แล้ว canonical-parse payload ที่เหลือ ทำให้ contract หลุด วิธีที่เล็กและตรงกว่า คือ compile/generate standalone validators จาก **exact pinned Draft 2020-12 schema bundle** แล้ว map `path ↔ contentSchema ↔ validator` แบบ closed allowlist; ไม่แชร์ implementation กับ S17-4

## 3. ผลเทียบ ladder §12

| Check | ผลตรวจ | หลักฐานย่อ |
| --- | --- | --- |
| 1 Container safety | **ยืนยันว่าถูกใน source** | strict STORE profile, header/metadata pins, no gap/overlap/trailing bytes, CRC/size, order และ limits อยู่ใน `zipStrictReader.ts:94-265` |
| 2 Strict parse | **ไม่ครบ — BLOCKER** | `verifyPacket.ts:86-121` validate schema เฉพาะ manifest/attestation; JSON payload อื่นแค่ JCS parse |
| 3 Exact file set | **ไม่ครบ — MAJOR** | `identityChecks.ts:25-60` เทียบ ZIP กับรายการใน manifest แต่ไม่บังคับ v2 required payload set หรือ file↔schema mapping |
| 4 Byte integrity | **ยืนยันว่าถูก** | raw size ก่อน raw SHA-256 ต่อ path (`identityChecks.ts:67-89`) |
| 5 Content identity | **ยืนยันว่าถูก** | omit เฉพาะ `packetContentId`, JCS แล้ว hash (`identityChecks.ts:97-117`) |
| 6 Manifest binding | **ยืนยันว่าถูก** | hash exact manifest bytes + packet ID equality (`identityChecks.ts:125-145`) |
| 7 Identity consistency | **ไม่ครบ — BLOCKER** | ตรวจ attestation↔manifest และ gate digest เท่านั้น; ไม่อ่าน result/policy จาก gate evidence (`consistencyCheck.ts:41-58`) |
| 8 Signature | **primitive ถูก แต่ lifecycle ไม่ครบ — MAJOR** | preimage/raw Base64/range/low-S/SPKI/verify ถูก; boundary/history policy ผิด (`signatureCheck.ts:97-110`) |
| 9 Authoritative | **ไม่ครบ — BLOCKER/MAJOR** | ตรวจ signed policy version แต่ไม่ตรวจ gate evidence PASS (`policyChecks.ts:64-68`); exception จาก lookup ไม่ถูก map |
| 10 Run/replay | **logic หลักถูก; exception path ไม่ครบ** | one-to-one run/content + fingerprint/run (`policyChecks.ts:80-98`) แต่ rejected Promise หลุดออกนอก result contract |
| 11 Shadow policy | **ยืนยันว่าถูก** | exact marker bytes/hash/schema + filename↔attestation + NO_CUT ceiling (`policyChecks.ts:102-162`) |
| 12 Audit result | **ไม่ครบ — MAJOR** | record ขาด policy versions, checked hashes และ actor/operator context (`verifyPacket.ts:38-52,199-216`) |

## 4. Findings เรียงตาม severity

### BLOCKER F-01 — verifier ออก `VERIFIED` ให้ gate evidence ที่ผิด schema

**Evidence**

- สเปก §7 และ §12.2/7/9 บังคับ closed schema bundle, gate fields ตรงกัน และ gate evidence PASS ตาม policy
- `gate-result.schema.json:7-12` บังคับ `schema`, `policyVersion`, `result`, `findings`
- `runStrictParse()` ที่ `verifyPacket.ts:102-112` เพียง parse JCS ของ payload; ไม่ validate payload schema และไม่เก็บ parsed gate value
- `checkIdentityConsistency()` ที่ `consistencyCheck.ts:41-58` ตรวจเพียง filename/digest
- `checkAuthoritative()` ที่ `policyChecks.ts:64-68` ถาม authority ด้วย policy version จาก attestation เท่านั้น
- fixture เองสร้าง `gate-result.json` เป็น `{"result":"PASS"}` ที่ `testkit/packetFixture.ts:38-43`
- Independent probe บน commit ที่ pin: gate bytes `{"result":"PASS"}` แต่ผลคือ `{integrityStatus:"VERIFIED", operationalDisposition:"NO_CUT", code:"PKT_OK_SHADOW_ONLY"}`; probe exit 0

**Impact**: generator/packet ที่ลงลายเซ็นสอดคล้องกันแต่ payload หรือ gate evidence ผิด schemaสามารถได้สถานะ integrity `VERIFIED` แม้ NO_CUT ยังกันการตัดจริงอยู่ จึงเป็น blocker ต่อคำว่า Full Verifier และต่อการใช้ผล integrity เป็นหลักฐาน

**Suggested change**: เพิ่ม exact bundle validator ทุก payload, closed `path ↔ mediaType ↔ contentSchema` registry, parse `gate-result.json`, บังคับ schema/result/policy และเทียบกับ signed gate fields; ยก fixture ให้ valid จริงและเพิ่ม negative tests สำหรับ gate FAIL, missing field, unknown field, policy mismatch และ array ordering

### MAJOR F-02 — exact v2 payload set และ canonical path policy ยังไม่ถูก enforce

`identityChecks.ts:38-59` ยอมรับ payload set ใด ๆ ที่ manifest กับ ZIP เห็นตรงกัน ตราบใดที่มี NFP marker และจำนวน manifest files ผ่าน shape จึงไม่บังคับรายการ v2 ในสเปก §6 (`connector-ops`, `connectors.minifix`, `cutlist`, `drillmap`, `gate-result`) ขณะที่ `shapes.ts:157-183` ไม่บังคับ NFC, Windows reserved names หรือ trailing dot/space ตาม `common.schema.json:12-18`

**Suggested change**: pin required v2 set และ exact schema/media mapping; extension รับได้เฉพาะ supported schema minor ที่ verifier build นี้ประกาศ; ใช้ canonical-path validatorตัวเดียวทั้ง ZIP และ manifest

### MAJOR F-03 — lookup exception หลุดออกจาก stable result และไม่มี audit รอบนั้น

Interfaces ระบุ sentinel `unavailable` แต่ call sites ใช้ `await` โดยไม่มี catch (`signatureCheck.ts:89`, `policyChecks.ts:36-68,84-97`) และ `verifyPacket.ts:134-197` ไม่มี exception boundary ก่อนสร้าง audit ที่ `:199-216`

Independent probe ให้ key registry throw: `verifyPacket()` throw `simulated registry outage`; หลัง success run มี audit 1 รายการ และหลัง outage ยังมี 1 รายการ หมายความว่า outage run ไม่ได้ stable `PKT_AUTHORITY_UNAVAILABLE` และไม่ append audit

**Suggested change**: ครอบ dependency calls ทุกตัวและ map rejected/throw/malformed response เป็น `PKT_AUTHORITY_UNAVAILABLE`; รับประกัน audit attempt ใน finally พร้อมกำหนด contract ชัดเมื่อ audit sink เองล้มเหลว

### MAJOR F-04 — key lifecycle boundary, historical policy และ issued-time policy ไม่ตรง §10.2

- code ใช้ `issued > notAfter` แทน required `issuedAt < notAfter` (`signatureCheck.ts:101-106`)
- RETIRED reject เฉพาะเมื่อมี `retiredAt` และใช้ `>` แทน `<` (`:108-109`)
- ไม่มี verifier-policy input ที่อนุญาต historical verification; `TrustedKeyRecord` มีเพียง optional `retiredAt` (`:30-39`)
- `deps.now()` ถูกประกาศว่าใช้ audit เท่านั้น (`verifyPacket.ts:65-66`) จึงไม่มี verifier-policy skew ตาม spec §8.1
- canonical timestamp helper ที่ validate calendar จริงมีอยู่ แต่ใช้เฉพาะ test; attestation shape ใช้ regex เท่านั้น (`shapes.ts:20-21,234`; `formats.ts:25-31`)

Independent probe ยืนยันว่า `issuedAt == notAfter`, RETIRED ที่ไม่มี `retiredAt` และ `issuedAt == retiredAt` ได้ `{ok:true}` ทั้งหมด

**Suggested change**: บังคับ half-open windows, RETIRED ต้องมี boundary + explicit allowHistorical policy, validate registry timestamps/key identity/algorithm, pin registry digest นอกเหนือจาก version และ expose/enforce issued-time skew policy

### MAJOR F-05 — audit record ไม่ครบ normative fields

สเปก §12.12 ต้องมี verifier version, policy versions, checked hashes, result, time และ human/operator context แต่ `AuditRecord` ที่ `verifyPacket.ts:38-52` มีเพียง schema aggregate, packet/manifest IDs, job run และ registry version; ไม่มี gate/governance policy versions, per-file checked hashes, `actorSubjectId`/`authorizationContextId` หรือ operator context

**Suggested change**: เพิ่ม field ที่ normative กำหนดและ regression test exact pass/fail audit records โดยไม่บันทึก PII เกิน opaque IDs

### MAJOR F-06 — 128 tests ผ่านจริง แต่ tamper corpus ยังไม่ครบ §14

สิ่งที่ขาดหรือไม่ถูกพิสูจน์ ได้แก่ invalid payload schemas/unknown fields/order rules/micrometre constraints, gate-result FAIL/policy mismatch, thrown authority/run-registry, lifecycle equality/missing retiredAt/history flag, invalid registry dates, issued-time skew, ZIP64/multi-disk/64-MiB-total cases และ exact audit contents นอกจากนี้ `PKT_SIGNATURE_MISSING` อยู่เฉพาะ type union (`codes.ts:40`) ไม่มี production emission path; missing signature ถูก shape layer กลืนเป็น `PKT_ATTESTATION_INVALID`

**Suggested change**: เพิ่ม spec-indexed corpus table ที่หนึ่งแถวต่อ mutation ใน §14 พร้อม expected check+stable code และทดสอบ exception paths แยกจาก sentinel paths

### NIT F-07 — interop ZIP pin แข็ง แต่ meta exact bytes ยังไม่ถูก pin

`blackbox.interop.test.ts:28-29` pin generator commit และ ZIP SHA-256 ดี และ one-byte negative ทำให้ gate ไม่ vacuous แต่ test ไม่ pin SHA-256 ของ `interop-meta.json`; `generatorTree`/`inputSha256` ถูกอ่านเป็น type แต่ไม่ assert ตรง constant และ evidence manifest ปัจจุบัน list เฉพาะ runner+report ไม่ list fixture pair

**Suggested change**: pin meta SHA-256, assert tree/input hash และเพิ่มทั้ง meta+ZIP ใน evidence manifest เพื่อกัน provenance drift ที่ test ยังไม่เห็น

## 5. สิ่งที่ trace แล้วยืนยันว่าถูก

1. **Container byte profile แข็งจริง**: local offsets ต้องต่อกัน, central/local order ตรง, no gap/overlap/trailing, STORE-only, header bits/time/mode pinned, CRC+sizes ตรวจจริง, duplicates/case collision และ limits fail closed
2. **JCS/strict JSON core ถูกทาง**: duplicate key ก่อนสร้าง object, BOM/invalid UTF-8/negative zero/unsafe canonical integer/lone surrogate reject; roundtrip byte equality; object key sort ด้วย UTF-16 code unitsตาม RFC 8785
3. **Content identity chain ถูก**: path/size/hash อยู่ใน descriptor, omit เฉพาะ content ID, bind exact manifest bytes และ attested packet ID
4. **Signature primitive ถูก**: preimage คง protected header และ omit เฉพาะ `valueBase64`; domain prefix ตรง; strict padded Base64 raw 64 bytes; scalar range; high-S rejectด้วย `s > floor(n/2)` จึงรับ boundary เท่ากับ floor; SPKI OIDs/DER/point form strict; WebCrypto verify ไม่ re-sign
5. **First-fail-wins ถูกสำหรับ handled outcomes**: orchestrator return ทันทีตาม ladderและไม่มี later diagnostic มาแทน primary code; ข้อยกเว้นคือ thrown dependency path ใน F-03
6. **`PKT_OK` unreachable by construction**: ไม่มีใน `PacketResultCode`; success constructor ออกได้เฉพาะ `PKT_OK_SHADOW_ONLY`; disposition type มีเพียง `NO_CUT`
7. **NFP pin ถูก exact**: independent recompute ได้ 824 bytes และ SHA-256 `40a4d63f…7d68a` ตรง constants; filename ผูก jobRun/content prefix
8. **Black-box interop ZIP pin จริง**: fixture ZIP SHA-256 `8a40f975…90ddb` ตรง literal; test consume frozen bytes และ one-byte mutation fail closed

## 6. Fresh execution evidence

| คำสั่ง/Probe | ผล |
| --- | --- |
| `npm ci` (root) | exit 0; 586 packages; npm audit report 18 issues (ไม่ถูกตีความว่าเป็น S17-5 runtime defect เพราะ production verifier imports เป็น local/WebCrypto เท่านั้น) |
| `cd server && npm ci` | exit 0; 220 packages; npm audit report 13 issues; ใช้เพื่อให้ suites collect dependencies ครบ |
| `npx vitest run src/packet-verifier` | exit 0; 6 files; **128/128 PASS** |
| `npx tsc --noEmit -p tsconfig.json` | exit 0; no diagnostics |
| `npm run test:node` | exit 0; **27/27 PASS** |
| Gate-schema boundary probe | exit 0; invalid `{"result":"PASS"}` ได้ `VERIFIED/NO_CUT/PKT_OK_SHADOW_ONLY` |
| Registry-throw probe | exit 0 ของ probe wrapper; verifier throw และไม่เพิ่ม audit ของ outage run |
| Lifecycle boundary probe | exit 0; three invalid boundary/policy cases returned `{ok:true}` |
| NFP recompute | exit 0; byte count/hash match = `true` |

> Tests ผ่านคือหลักฐานเฉพาะสิ่งที่ tests ครอบ ไม่หักล้าง false-accept ที่ independent probes แสดง

## 7. Required re-review gate

ก่อน ship ต้องมี commit แก้โดย S17-5 builder แล้วให้ reviewer ตรวจอย่างน้อย:

1. payload/gate schemas และ exact file/schema registry reject จริง
2. gate evidence PASS/policy/file fields ตรง attestation + authority
3. thrown lookup ทุกชนิดคืน stable fail-closed code และมี audit
4. lifecycle half-open boundaries + RETIRED history policy + skew
5. audit normative fields ครบ
6. tamper corpus §14 ครบและ fresh output ยังผ่าน

Review นี้ไม่แก้ production code ตาม SoD; owner เป็นผู้ merge PR review record และ builder เป็นผู้แก้ source ตาม receiving-code-review flow

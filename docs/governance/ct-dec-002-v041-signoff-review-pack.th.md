# CT-DEC-002 v0.4.1 — Sign-Off Review Pack (ต่อบทบาท)

**จัดทำ:** 16 ก.ค. 2026 · โดย Claude (reviewer track) ตามมติ ADR-069 ข้อ 1
**ใช้คู่กับ:** `docs/governance/ct-dec-002-signoff-checklist.th.md` (surface ที่เซ็นจริง)
**Spec:** Canonical Factory Packet Specification **v0.4.1** (`docs/specs/s17-canonical-packet-spec-v1.th.md`, สถานะ DRAFT)
**Hash anchor:** `monolith-s17-v041-review-input.sha256` — self-sha256 `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` (re-pin 16 ก.ค. — ดู §A0)
**Aggregate schema digest:** `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55`

> **สถานะของ pack นี้ = advisory เท่านั้น** — ผลตรวจของ AI ด้านล่างช่วยชี้ว่าหลักฐานอยู่ไหนและข้อไหนตรวจเชิงกลผ่านแล้ว แต่**ไม่ใช่คำอนุมัติ** การติ๊ก checklist และการเซ็นเป็นความรับผิดชอบของมนุษย์ผู้เซ็นว่าได้ review เองแล้วเท่านั้น (กติกาในตัว checklist เอง) · pack นี้ไม่แตะไฟล์ checklist และไม่เปลี่ยนสถานะ DRAFT/Track B LOCKED/NO_CUT ใด ๆ

---

## A0. บันทึกแก้ไข (16 ก.ค. — ก่อน sign-off จริง)

**Pre-sign gate จับปัญหาได้ 2 ชั้นก่อนเซ็น — และแก้แล้วตามมติ owner (ก):**

1. **Pack ฉบับแรกของผมรายงานผิด**: ผมเขียนว่า "A2 = PASS ทุกไฟล์" ทั้งที่ `package.json` FAIL อยู่ — ผม `tail` ตัด output จนไม่เห็น (ความผิดพลาดของผู้ตรวจเอง จับได้ตอนรัน pre-sign สดต่อหน้า owner) · สาเหตุ FAIL = FS-B1-01/B1-02 (test:node + vite 6/vitest 3.2.7 security bump) ที่ owner สั่งหลัง round-4 — **เนื้อหา spec/schemas ไม่เลื่อนแม้แต่ไบต์เดียว**
2. **Circularity แต่กำเนิด**: ไฟล์ checklist (signing surface ที่ต้องแก้ตอนเซ็น) อยู่ในชุด frozen เอง — FAIL ตั้งแต่ `7cd09e81` (พิสูจน์: hash ใน manifest เดิม `073509cb...` ≠ ไฟล์จริง `f44ecd21...`) และถ้าไม่แก้ ทุกลายเซ็นจะทำ anchor แตก → **ชุดใหม่ 44 ไฟล์ตัด checklist ออก** (checklist pin แยกด้วย manifest ของตัวเอง)

Anchor เดิม `75cbc3e1...2046` → **anchor ใหม่ `de2a1ccf...a2c7`** · บทเรียนเข้า pack: อย่า truncate output ของ verifier

## A. Pre-Sign — ยืนยัน bytes ด้วยตัวเอง (ทุกบทบาท ทำก่อนอ่านต่อ)

ผมรันทั้งสามข้อเมื่อ 16 ก.ค. 2026 บน worktree `governance/s17-control-pack` — **ผ่านครบ (หลัง re-pin §A0)** แต่กติกา verify-don't-trust ใช้กับมนุษย์ด้วย: รันซ้ำเองด้วยคำสั่งข้างล่าง อย่าเชื่อผลของผม

```bash
# A1) manifest ตรงกับ anchor ที่ checklist pin ไหม (ต้องได้ de2a1ccf...a2c7)
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('monolith-s17-v041-review-input.sha256')).digest('hex'))"

# A2) ทุกไฟล์ใน review set ยังตรง byte เดิม ณ วันนี้ไหม (ต้อง PASS ทุกบรรทัด)
node scripts/verify-sha256-manifest.mjs monolith-s17-v041-review-input.sha256

# A3) aggregate schema digest คำนวณซ้ำอิสระ (ต้องได้ aed32029...f55)
node -e "
const fs=require('fs'),c=require('crypto'),p=require('path');
const d='docs/specs/schemas';
const files=fs.readdirSync(d).filter(f=>f.endsWith('.schema.json')).sort();
const lines=files.map(f=>c.createHash('sha256').update(fs.readFileSync(p.join(d,f))).digest('hex')+'  '+f);
console.log(c.createHash('sha256').update(lines.join('\n')+'\n').digest('hex'));"
```

ผลของผม (advisory, หลัง re-pin): A1 = `de2a1ccf...a2c7` ตรง anchor · A2 = **PASS 44/44, 0 FAIL** (ห้าม truncate output — ดูบทเรียน §A0) · A3 = `aed32029...f55` **reproduce ได้อิสระ** (วิธีคำนวณ: sha256 ของบรรทัด `"<sha256>  <ชื่อไฟล์>"` เรียงตามชื่อไฟล์ + LF ปิดท้าย — ค่านี้ไม่เปลี่ยนจาก round-4 เพราะ schemas ไม่เลื่อน)

---

## B. Tech Lead Pack — Contract Correctness & Implementability

| ข้อใน checklist | หลักฐานอยู่ไหน | ผลตรวจเชิงกล (advisory) | สิ่งที่ Tech Lead ต้อง judge เอง |
|---|---|---|---|
| Schema bundle ครบ 10 + ทุก array มี `x-monolith-orderBy` + ทุก object `additionalProperties:false` + digest bound | `docs/specs/schemas/*.schema.json` (10 ไฟล์) + `schema-bundle.aggregate.sha256` | ✅ นับเชิงกล: **10 ไฟล์ · arrays 11/11 มี orderBy · objects 31/31 ปิด additionalProperties** · aggregate reproduce ได้ (ข้อ A3) | orderBy ที่เลือกต่อ array **ถูกความหมาย** ไหม (เครื่องนับให้ได้แค่ว่า "มี") |
| Identity model ไม่ collide | spec §identity — `packetContentId` (27 จุดอ้าง), `jobRunId` (25 จุดอ้าง, server-owned ไม่อยู่ใน content hash) | ✅ โครงครบ: content id แยกจาก run id, signed identity ผูก released revision + machine-profile ver + exporter ver + schema ver | เหตุผล **ว่าทำไมไม่ collide** — ไล่ตรรกะ hash composition เอง |
| Determinism implementable โดยไม่เดา | JCS (10 จุดอ้าง) · integer micrometres (`Um` fields, L154) · ZIP byte profile (method-0, ลิมิต §container) | ✅ ทุกองค์ประกอบถูกระบุใน spec | อ่าน §canonicalization แล้วถามตัวเอง: "S17-4 เขียนโค้ดได้โดยไม่ต้องตีความเพิ่มจริงไหม" — นี่คือแก่นของข้อนี้ |
| Verifier order + result codes deterministic | §12 (L391): ladder 1→8 "ตรวจตามลำดับ หยุดแบบ fail-closed" · §13 (L422) stable codes · NFP missing → `PKT_FILE_MISSING` ที่ step 3 ระบุตรงตัว | ✅ ladder เรียงชัด + code ครบ (PKT_FILE_MISSING×4, PKT_SIGNATURE_INVALID×3, ครบทุกตัวที่ checklist เอ่ย) | ลำดับ ladder **ปิดช่องตรวจข้ามขั้น** จริงไหม (เช่น parse ก่อน integrity) |
| S17-4/S17-5 มี contract พอเริ่ม | ทั้ง spec + §12 (verifier contract = S17-5 input) | — (ตรวจเชิงกลไม่ได้) | **judgment ล้วน**: ถ้าคุณเดฟเป็นคน build S17-4 พรุ่งนี้ ขาดอะไรไหม |

## C. Factory Owner Pack — Factory Operability & Safety

| ข้อใน checklist | หลักฐานอยู่ไหน | ผลตรวจเชิงกล (advisory) | สิ่งที่ Factory Owner ต้อง judge เอง |
|---|---|---|---|
| NFP/NO_CUT บังคับ; `PKT_OK` เปล่าห้าม emit ใน shadow | spec: `PKT_OK_SHADOW_ONLY` (4 จุด), `NO_CUT` (8 จุด) · §12 step 3 บังคับ `NOT_FOR_PRODUCTION.txt` ต้องอยู่ครั้งเดียว | ✅ semantics ครบตามที่ checklist เรียก | ผลลัพธ์พวกนี้ **โรงงานอ่านแล้วไม่ตัดจริง** แน่ไหมในกระบวนการหน้างานจริง |
| Machine profile binding (id+version+digest) | spec §machine-profile + `PKT_MACHINE_PROFILE_MISMATCH` | ✅ code มีจริง + binding สามชั้นระบุครบ | profile ปลอม/คนละเวอร์ชัน **ถูกจับก่อนถึงเครื่อง** ในขั้นตอนที่โรงงานทำจริงไหม |
| Verifier fail-closed (lookup ล่ม → ไม่ถึงเครื่อง) | `PKT_AUTHORITY_UNAVAILABLE` (2 จุด) → FAIL/NO_CUT | ✅ ไม่มีเส้นทาง "warn and pass" ใน §12 | ยอมรับ trade-off ได้ไหม: registry ล่ม = **หยุดผลิต** (fail-closed มีต้นทุนหน้างาน) |
| Exporter allowlist + gate evidence binding | `PKT_GATE_FAILED` + §gate-evidence | ✅ ระบุครบ | — |
| `kdt_mvp_v1` ตรงเครื่อง+controller จริง | มติเดิม (tasks.md): "เฉพาะเมื่อเครื่องจริง+controller รองรับ KDT path — ห้ามเลือกเพราะ test เยอะ" | ⚠️ **AI ตรวจไม่ได้ — ข้อนี้ยืนยันได้จากโรงงานเท่านั้น** | เดินไปดูเครื่องจริง/สเปก controller ก่อนติ๊ก — นี่คือข้อเดียวใน checklist ทั้งฉบับที่หลักฐานอยู่นอก repo |

## D. Security Owner Pack — Signature / Trust / Key (เซ็นท้ายสุด)

| ข้อใน checklist | หลักฐานอยู่ไหน | ผลตรวจเชิงกล (advisory) | สิ่งที่ Security Owner ต้อง judge เอง |
|---|---|---|---|
| ECDSA-vs-KMS reconciled | spec L341: `Digest = SHA256(message)` → KMS `Sign` ด้วย `KeySpec=ECC_NIST_P256` + `SigningAlgorithm=ECDSA_SHA_256` + `MessageType=DIGEST`, digest 32 bytes ตรงตัว | ✅ ทั้งสามพารามิเตอร์ระบุตรง checklist (ECDSA_P256_SHA256×5, ECC_NIST_P256×4) | ความเข้าใจ end-to-end ว่า preimage ที่ hash คืออะไร (protected preimage §S10) |
| Signature encoding: DER→raw `r‖s` 64-byte Base64, low-S, reject DER/high-S | L261 "canonical raw `r‖s` พร้อม low-S rules" · L343: left-pad 32 bytes/ฝั่ง รวม **64 bytes พอดี** → RFC 4648 Base64 + **strict decode + re-encode ต้องได้ string เดิม** (กัน non-canonical) | ✅ ครบ รวม reject path → `PKT_SIGNATURE_INVALID` | ครอบ malleability ครบไหม (DER-in-place, high-S, out-of-range r/s) |
| **Low-S threshold (จุดแก้ v0.4.1)** | spec: `7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8` | ✅ **ผมคำนวณ floor(n/2) ของ P-256 ซ้ำอิสระด้วย BigInt — ตรงเป๊ะทุกหลัก** (นี่คือ defect ที่ round-4 แก้ — ยืนยันแล้วว่าค่าที่แก้ถูกต้องเชิงคณิตศาสตร์) | — (เชิงกลปิดได้; judge แค่ว่าตำแหน่งใช้ค่านี้ถูกบริบท) |
| Non-determinism boundary | L347: `signature.valueBase64` = run-specific, อยู่ใน **run allowlist §4.1**, ไม่อยู่ใน `packetContentId`; verifier verify เท่านั้น | ✅ ระบุตรงตัว | allowlist §4.1 มีอะไร "เกิน" ที่ควร run-specific ไหม |
| Public-key registry: pin DER SPKI | L353: pin exact **DER SubjectPublicKeyInfo จาก KMS `GetPublicKey`** (`id-ecPublicKey` + `prime256v1`, BIT STRING uncompressed `0x04‖X‖Y`) | ✅ ครบทุกองค์ประกอบ (SPKI×5, prime256v1, 0x04×2) | นโยบาย "ใครมีสิทธิ pin คีย์เข้า registry" (จุดต่อ key ceremony S17-6) |
| Key lifecycle §10.2 | L353+§10.2: `notBefore/notAfter`, state ACTIVE/RETIRED/REVOKED, **anti-rollback** (L532), registry-unavailable = fail-closed | ✅ ครบ | นโยบาย rotation จริงจะสอดคล้อง ceremony ไหม |
| Packet key ห้าม establish trust เอง | `PKT_KEY_UNKNOWN` / `PKT_KEY_REVOKED`×2 / `PKT_KEY_EXPIRED` | ✅ code ครบสามตัว | — |
| Server-owned actor ผูก S17-1 | spec (JWT-derived) + S17-1 = impl+staging-E0 COMPLETE (`8a6b89c8`, hosted 13/13) | ✅ แต่**หมายเหตุ**: S17-1 ยัง staging-only — prod-apply แขวนถึง pilot window (นี่คือเหตุที่ checklist ให้ Security Owner เซ็นท้ายสุด) | ยอมรับการเซ็นบน staging evidence โดยรู้ว่า prod ตามมาที่ pilot |
| Tamper corpus §14 + custody | §14 (L461): **6 กลุ่ม / 22+ mutation families** (byte-flip, ZIP structure, JCS, identity fields, signature, key states) · custody: ADR-068 (KMS ECDSA P-256) + `docs/security/s17-6-key-custody-kickoff.md` + มติ custody (KMS/HSM non-exportable, PO+SecOwner joint) | ✅ corpus กว้างตามที่ checklist เรียก · custody model สอดคล้อง ADR-064/068 | "ครอบพอ" เป็น judgment — ช่องที่ผมเห็นว่าควรถามตัวเอง: มี fixture ฝั่ง **key-state ครบทั้ง REVOKED/EXPIRED/UNKNOWN** ไหม |

---

## E. ขั้นตอนเซ็น (จาก checklist §4–6)

1. ทำ **ข้อ A ทั้งสามด้วยตัวเอง** ก่อนบทบาทแรก
2. เซ็นเรียง: **Tech Lead → Factory Owner → Security Owner (ท้ายสุด)** — ถือหลายหมวก = เซ็นแยกครั้งละบทบาทโดยเจตนา ห้ามเซ็นรวบ
3. ต่อบทบาท: ไล่ติ๊ก checklist ในไฟล์ `ct-dec-002-signoff-checklist.th.md` → กรอก Signature Block (ชื่อ / anchor `monolith-s17-v041-review-input.sha256` / วันที่ / เปลี่ยน PENDING → SIGNED) — **มนุษย์แก้ไฟล์เอง**
4. ครบสาม: CT-DEC-002 = APPROVED → **ปลดเฉพาะ Track B (S17-4/5)** — ไม่ปิด P0, ไม่อนุญาต merge/prod-apply, **NO_CUT คงอยู่**จน real-cut gate สี่เงื่อนไขผ่าน
5. S17-5 ต้อง implement/review โดยผู้อิสระจาก S17-3/4 builder (SoD, ADR-065)

## F. สรุป advisory ของผู้ตรวจอิสระ (ไม่ใช่คำอนุมัติ)

- เชิงกล: **ทุกข้อที่เครื่องตรวจได้ = ผ่าน** (bytes ตรง anchor, aggregate reproduce ได้, schema กติกาครบ 11/11+31/31, result codes ครบ, low-S ถูกต้องเชิงคณิตศาสตร์)
- จุดที่**ต้องมนุษย์เท่านั้น** 3 จุด: (1) `kdt_mvp_v1` ตรงเครื่องจริง — หลักฐานอยู่หน้างาน ไม่อยู่ใน repo (2) "S17-4/5 contract พอ" — judgment ของคน build (3) ยอมรับ fail-closed = หยุดผลิตเมื่อ registry ล่ม — trade-off ธุรกิจ
- Drift ที่พบก่อนเซ็น (package.json + checklist circularity) ถูกแก้และบันทึกครบใน §A0 — หลัง re-pin: **44/44 PASS, เนื้อหา spec/schemas byte-identical กับ round-4 ทุกไฟล์** · ไม่พบข้อใดใน checklist ที่หลักฐานหาย

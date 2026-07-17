# CT-DEC-002 / S17-3 — Human Role Sign-Off Checklist

**Spec**: Canonical Factory Packet Specification v0.4.1 — supersedes v0.4/v0.3 · reviewed artifact committed `d3fb617fcb42e72085cce46cad03b5478b71e16d`
**Hash anchor ที่ต้องเซ็น**: `monolith-s17-v041-review-input.sha256` (sha256 `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7`)
**Re-pin 16 ก.ค. 2026 (มติ owner ก):** anchor เดิม `75cbc3e1...2046` ถูก re-pin สองเหตุ — (1) `package.json` เลื่อนจากงาน FS-B1-01/B1-02 ที่ owner สั่งหลัง round-4 (delta = test:node scripts + vite 6/vitest 3.2.7 security bump; เนื้อหา spec/schemas byte-identical ทุกไฟล์) (2) แก้ circularity แต่กำเนิด: ไฟล์ checklist นี้ (signing surface ที่ต้องถูกแก้ตอนเซ็น) เคยอยู่ในชุด frozen เอง ทำให้ verify ไม่ผ่านตั้งแต่ `7cd09e81` และการเซ็นจะทำ anchor แตก — ชุดใหม่ 44 ไฟล์ไม่รวม checklist (checklist ถูก pin แยกด้วย `ct-dec-002-signoff-checklist.sha256` ต่อเหตุการณ์เซ็น)
**Aggregate schema digest**: `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55`
**Independent re-review verdict**: READY FOR HUMAN ROLE REVIEW (round-4 clean; low-S constant verified = floor(n/2); advisory, non-authoritative)

> การเซ็น = การรับผิดชอบของมนุษย์ว่าได้ review เองแล้ว ไม่ใช่การรับ AI verdict มาแปะ · AI ไม่ลงชื่อแทน · เมื่อครบสามลายเซ็น CT-DEC-002 = APPROVED และปลด Track B (S17-4/5)
> คงบังคับจนกว่าจะครบสาม: DRAFT · Track B LOCKED · NO_CUT · ไม่มี P0 closure · ไม่มี bare PKT_OK ใน shadow mode

## 0. Pre-Sign (ทุกบทบาททำก่อน)

- [x] ยืนยันกำลัง review exact bytes ที่ pin ใน `monolith-s17-v041-review-input.sha256`
- [x] verify aggregate schema digest จาก `schema-bundle.aggregate.sha256` ด้วยเครื่องมืออิสระ (ไม่เชื่อเพราะ manifest มี)
- [x] อ่าน independent re-review รอบ 4 ครบ + เข้าใจว่า review verdict != approval

## 1. Tech Lead — Contract Correctness & Implementability

- [x] Schema bundle ครบ: 10 schemas, ทุก array มี `x-monolith-orderBy`, ทุก object `additionalProperties:false`, aggregate digest bound
- [x] Identity model: `packetContentId` (hash canonical content) / `jobRunId` (server-owned, ไม่อยู่ใน content hash) / signed identity รวม released revision + machine-profile ver + exporter ver + schema ver — ไม่ collide
- [x] Determinism implementable โดยไม่เดา: JCS, integer micrometre, UTF-8 byte ordering, ZIP byte profile กำหนดครบ (S17-4 build ได้โดยไม่ต้องตีความ)
- [x] Verifier check order (S12) + result codes (S13) deterministic (NFP-missing -> `PKT_FILE_MISSING` ชัด, first-fail-wins)
- [x] ยืนยัน S17-4/S17-5 มี contract พอเริ่ม implement (หลังเซ็นครบ)

## 2. Factory Owner — Factory Operability & Safety

- [ ] NFP/NO_CUT บังคับ: shadow mode ตัดจริงไม่ได้ · ผลสูงสุด `PKT_OK_SHADOW_ONLY / VERIFIED_SHADOW_ONLY / NO_CUT` · `PKT_OK` เปล่า emit ไม่ได้
- [ ] Machine profile binding: id + version + digest (profile ปลอมไม่ผ่าน -> `PKT_MACHINE_PROFILE_MISMATCH`)
- [ ] Verifier fail-closed: packet เสีย/lookup ล่ม -> ไม่ถึงเครื่อง (`PKT_AUTHORITY_UNAVAILABLE` -> FAIL/NO_CUT, ไม่ "warn and pass")
- [ ] Exporter allowlist + gate evidence binding (gate ไม่ PASS -> `PKT_GATE_FAILED`)
- [ ] machine profile `kdt_mvp_v1` ตรงเครื่อง+controller จริง (ยืนยันจากโรงงาน)
  - **มติ owner 17 ก.ค. 2026 (ADR-070): ข้อนี้ถือระดับ CONDITIONAL** — รับหลักฐานระดับเอกสาร (`docs/evidence/machines/kdt-kn-2409lp/`: KDT/NCstudio/Weihong/G-code `.nc` = HIGH; ตัวเอกสารเองประกาศ `PROHIBITED · NOT_ASSESSED` อย่างซื่อตรง) · **bench verification โดยวิศวกรหน้าเครื่อง = hard gate ก่อนทำงานจริง** (assessment Gate E + CT-DEC-002 §5 "machine profile calibrated") · เหตุผล: multi-machine onboarding — documented-profile first, ห้ามใช้ตัดจริงจนผ่าน bench ครบ

## 3. Security Owner — Signature / Trust / Key

> **ADR-068 resolution (15 ก.ค.)**: Owner เลือก AWS KMS `ECC_NIST_P256` และ `ECDSA_SHA_256`; v0.4 แทนที่ signature layer แบบ Ed25519 ของ v0.3 แล้ว การตรวจด้านล่างยังเป็น PENDING จน Security Owner review exact bytes และ hash anchor รอบ 4

- [ ] **ECDSA-vs-KMS reconciled**: protected algorithm คือ `ECDSA_P256_SHA256`; KMS `Sign` ใช้ `ECC_NIST_P256` + `ECDSA_SHA_256` + `MessageType=DIGEST` กับ exact SHA-256 digest
- [ ] Signature encoding: DER จาก KMS ถูกแปลงเป็น raw `r‖s` 64-byte Base64; signer emit low-S; verifier reject DER/high-S/out-of-range ด้วย `PKT_SIGNATURE_INVALID`
- [ ] Non-determinism boundary: signature เป็น run-specific allowlist, ไม่อยู่ใน `packetContentId`; verifier verify เท่านั้น ไม่ recompute
- [ ] Public-key registry: pin canonical DER SPKI (`id-ecPublicKey` + `prime256v1`) ซึ่ง BIT STRING เป็น uncompressed `0x04‖X‖Y`; packet key ห้าม establish trust เอง
- [ ] Key lifecycle (S10.2): ACTIVE/RETIRED/REVOKED, `notBefore/notAfter`, anti-rollback, registry-unavailable = fail-closed
- [ ] Trusted-key registry: public key ใน packet ห้าม establish trust ตัวเอง (`PKT_KEY_UNKNOWN/REVOKED/EXPIRED`)
- [ ] Server-owned actor ผูกกับ S17-1 (JWT-derived ไม่ใช่ client header) — attestation ใช้ identity ที่ปลอมไม่ได้
- [ ] Tamper corpus (S14) ครอบพอ + custody model ตรง ADR-064/มติ custody (KMS/HSM non-exportable)

## 4. Signature Block

| บทบาท | ชื่อ | Reviewed artifact commit | Review anchor SHA-256 | วันที่ | สถานะ |
| --- | --- | --- | --- | --- | --- |
| Tech Lead | คุณเดฟ | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | 2026-07-17 | SIGNED |
| Factory Owner | — | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | — | PENDING |
| Security Owner | — | `d3fb617fcb42e72085cce46cad03b5478b71e16d` | `de2a1ccfa476271c4ca5949ec374a79bce786702d6b65a94b9e3435a6439a2c7` | — | PENDING |

> บันทึกการรับรอง Tech Lead จากคำยืนยันโดยตรงของคุณเดฟใน guided review session วันที่ 2026-07-17: ผู้ตรวจเห็น anchor ตรง, manifest 44/44 PASS และ 0 FAIL, reproduce aggregate schema digest ได้, schema structural test ผ่าน และตอบ TL-1 ถึง TL-5 ด้วยตนเอง Codex ทำหน้าที่บันทึกคำยืนยันนี้ตามคำสั่งโดยตรง ไม่ใช่ผู้ลงนามหรือผู้อนุมัติแทนมนุษย์

## 5. Effect เมื่อครบสาม

- CT-DEC-002 = APPROVED
- ปลด Track B: S17-4 determinism + S17-5 verifier
- S17-5 ต้อง implement/review โดยผู้อิสระจาก S17-3/4 builder (SoD, ADR-065)
- คง NFP/NO_CUT จนกว่า real-cut gate สี่เงื่อนไขผ่าน (S17x5 + ADR-064 ครบ + dogfood >=1 + machine profile calibrated)

## 6. ข้อควรระวัง (advisory)

1. ถ้าผู้ถือหลายบทบาท (เช่น 2-of-2 pilot ceremony) ต้องลงชื่อแยกแต่ละบทบาทโดยเจตนา ไม่เซ็นรวบ
2. Security Owner ควรเซ็นทีหลังสุด: signature/key ผูกกับ S17-1 server-owned actor ที่ยัง staging-only (deploy prod จริงตอน pilot)
3. sign-off นี้ไม่ปิด P0, ไม่อนุญาต merge/prod-apply, ไม่อนุญาตตัดจริง — ปลดเฉพาะ Track B implementation

---

*Advisory checklist — human approval required. Exact v0.4 review bytes ถูก pin ด้วย `monolith-s17-v041-review-input.sha256`; checklist นี้ไม่เปลี่ยน DRAFT/PENDING/Track B LOCKED/NO_CUT จนกว่าจะครบสามบทบาท.*

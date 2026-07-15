# CT-DEC-003 Addendum A — S17 Status Update (append-only supersession)

วันที่มีผล: 2026-07-15
สถานะ: **RECORDED — human Tech Lead confirmation**
Prior record: `CT-DEC-003` (2026-07-11) — **คงเดิม ไม่แก้ไข**
อำนาจมติ: Tech Lead
ผู้จัดทำเอกสาร: Claude ในฐานะ advisory/non-authoritative

> Addendum นี้ทำตาม **CT-DEC-003 §5 (append-only rule)** — supersede เฉพาะ point-in-time status fact ที่ระบุชื่อด้านล่างเท่านั้น ไม่ rewrite ข้อความเดิมของ CT-DEC-003, ไม่อนุมัติ CT-DEC-002, ไม่ปิด P0 และไม่ปลด Track B

## 1. เจตนาและขอบเขต (append-only)

CT-DEC-003 เป็น measured record ณ 2026-07-11 ข้อความเดิมทั้งหมดยังมีอำนาจในขอบเขตเดิม และยังย้อนตรวจได้ใน Git history (tamper-evident provenance) Addendum นี้**เพิ่ม dated fact ใหม่**เท่านั้น ตามข้อ §5.2–§5.3 ของ CT-DEC-003: ระบุ prior record, exact scope ที่ supersede, authority, เหตุผล และ effective date

เหตุผล: เวลาผ่านไป 4 วัน (11 → 15 ก.ค.) มี execution event ที่ทำให้ **status fact สามจุด**ใน CT-DEC-003 ถูกแซง การยืนยัน CT-DEC-003 เป็นภาพปัจจุบันโดยไม่มี addendum จะขัด discipline ที่เอกสารตั้งเอง

## 2. Status fact ที่ถูก supersede (scope-exact)

| อ้างใน CT-DEC-003 | บันทึกไว้ (11 ก.ค.) | Measured update (15 ก.ค.) + evidence anchor |
| --- | --- | --- |
| §1 register แถว "ส่ง CT-DEC-002 กลับทำ v0.2" · §2 | CT-DEC-002 → v0.2, blocker 6 ข้อ | Blocker ทั้ง 6 ด้านถูกแก้ผ่าน v0.2 → v0.3 → v0.4 → **v0.4.1**; independent re-review verdict = **READY FOR HUMAN ROLE REVIEW** (round-4 clean; low-S = floor(n/2)) · anchor: commit `d3fb617fcb42e72085cce46cad03b5478b71e16d`, `monolith-s17-v041-review-input.sha256` (sha256 `75cbc3e1501b3499515fcf86b973001314fa52c8f0ff25d0c4ae188233ee2046`), aggregate `sha256:aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55` |
| §6 | S17-1 = **NOT STARTED / NO REPOSITORY EVIDENCE** | S17-1/S17-2 implemented; hosted-E0 auth proof บน `monolith-s17-staging` = **13/13 cases pass** · anchor: `s17-hosted-auth-evidence.json` (sha256 `60a84080538328c20f4b68e7024a44c772b06050a64cbf3deb2100ff859e99cc`) |
| §8 controlled actions | (1) ส่ง v0.2 review รอบสอง · (3) เริ่ม Track A จาก baseline | (1) resubmit ต่อเนื่องถึง round 4 → v0.4.1 READY · (3) Track A มี repo + hosted evidence แล้ว · (2) hardened writer/verifier **ยัง CANDIDATE — pending independent re-review** (ไม่เปลี่ยน) |

> ⚠️ **READY FOR HUMAN ROLE REVIEW ≠ APPROVED** — v0.4.1 พร้อมให้ 3 บทบาทมนุษย์ review/เซ็น แต่ยังไม่มี approval signature

## 3. ขอบเขตที่ยังคงมีผลเต็ม (ไม่ถูกกระทบโดย addendum นี้)

- **CT-DEC-002 ยัง DRAFT — NOT APPROVED** (v0.4.1 = READY FOR REVIEW เท่านั้น); 3-role sign-off ยัง **PENDING**
- **Track B (S17-4/S17-5) ยังล็อก** จน approval matrix S17-3 ลงชื่อครบ
- ไม่มี P0 blocker ใดปิด; ADR-064 ยังต้องครบสี่บทบาทมนุษย์
- CT-DEC-003 §3 (jobRunId ownership), §4 (tooling **YELLOW/CANDIDATE — NOT OFFICIAL**), §5 (append-only rule), §7 (scope unchanged) — **ยังมีผลเต็มทั้งหมด**
- ห้ามตัดชิ้นงานจริงจาก packet จน S17 ปิดและ real-cut gate ผ่านครบสี่เงื่อนไข

## 4. Evidence anchors (verifiable)

```text
d3fb617fcb42e72085cce46cad03b5478b71e16d   commit: CT-DEC-002 v0.4.1 (ECDSA P-256 + low-S fix)
75cbc3e1501b3499515fcf86b973001314fa52c8f0ff25d0c4ae188233ee2046   monolith-s17-v041-review-input.sha256 (anchor self-hash)
aed32029309278053aec251b5eaef1468d1921f42f81ee6755cd76a4e8d62f55   schema-bundle.aggregate (v0.4.1)
60a84080538328c20f4b68e7024a44c772b06050a64cbf3deb2100ff859e99cc   s17-hosted-auth-evidence.json (S17-1/2 hosted-E0, 13/13)
077452a7                                                           commit: CT-DEC-002 sign-off bundle regen -> v0.4.1
```

Hosted-E0 target = `monolith-s17-staging` (Supabase preview branch `wlivqsdgvwcjlbqqtcwt`) — staging เท่านั้น, prod deploy จริงตอน pilot (ADR-066: human-driven infra)

## 5. Authority และผลบังคับ

Tech Lead (คุณเดฟ) ยืนยัน record CT-DEC-003 และรับ addendum นี้เป็น dated supersession ของ status fact ที่ระบุ ณ 2026-07-15 · เอกสารนี้ advisory/non-authoritative ในส่วนที่ Claude จัดทำ, อำนาจมติเป็นของ Tech Lead · ไม่มี normative change ต่อ §3/§4/§5/§7 ของ CT-DEC-003

# S17 Track B — Black-Box Interop Evidence (official)

วันที่: 2026-07-18
ผู้ดำเนินการ: Claude (reviewer track) — ตอบข้อ 2 ของ execution order ใน Full-System Scrutiny 2026-07-18 และปิดข้อสังเกต **B2-02** (dry-run เดิม import source snapshot; รอบ official ต้อง consume artifact bytes เท่านั้น)

## 1. สิ่งที่พิสูจน์

สอง implementation ของ CT-DEC-002 v0.4.1 ที่สร้างแยกขาดจากกัน (spec-only interface, ห้ามแชร์โค้ด/fixtures ระหว่าง construction):

- **S17-4 generator (Codex)** — frozen commit `eeed1ce6b4388db5c661932a419e5d2c61267712` (tree `da717b31f26f7000e5f94fad854cb0dd13c61004`, handoff anchor `3ebdbfb77c02303f663ca791bc5c779d51c93604a935fa61c04571cdbc6b9239`)
- **S17-5 verifier (Claude)** — บน `origin/main` หลัง merge PR #4 (เนื้อหา `src/packet-verifier/` = commit `613bb21f`)

**ผลิต packet จริง → ตรวจจริง → interoperate สมบูรณ์**: ผลสามช่องตรง success ceiling เป๊ะ `{VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY}` และ tamper 1 ไบต์ fail-closed ที่ NO_CUT

## 2. วิธีรัน (black-box discipline)

1. **Generator side**: runner (`interop-runner-2026-07-18.mts` ในโฟลเดอร์นี้, sha256 `9f6e47ceb2d98dd8096a01d847ec5b5b4eddb88fa10a7e6cebeecc559503284e`) รันใน frozen worktree ผ่าน dynamic import — **ไม่เขียนไฟล์ใด ๆ ลง checkout** (git status = 0 ก่อน/หลัง) · input = golden-input.json ของ generator เอง (sha256 pin ใน meta) · KMS mock เซ็นจริงตาม contract เป๊ะ: รับ SHA-256 digest → คืน DER ECDSA P-256 บน digest (MessageType=DIGEST, textbook BigInt ECDSA — ไม่เห็น preimage เหมือน AWS KMS จริง) · ถูกเรียก 1 ครั้ง
2. **Boundary**: สิ่งที่ข้ามฝั่งมีแค่ **ZIP bytes + interop-meta.json** (deployment-config analog: SPKI, allowlist values, run binding + identity claims ของ generator)
3. **Verifier side**: เทสถาวร `src/packet-verifier/interop/blackbox.interop.test.ts` อ่าน fixture bytes → `verifyPacket()` → เทียบผลสามช่อง + cross-check audit fields ของ verifier กับ identity claims ของ generator (`packetContentId`/`manifestSha256`/`jobRunId` ตรงกันทุกตัว — agreement ระหว่างสอง implementation ไม่ใช่การเชื่อ meta)

## 3. Artifact pins

| สิ่ง | ค่า |
|---|---|
| ZIP | `NFP-factory-packet-4f9be2a7-33c1-4d68-9b21-5f0e8d7a6c15-813ab601dcf7.zip` (8,092 bytes) |
| ZIP sha256 | `8a40f975c9712baca03a9b441736671c17484528a8f40daac4adc40cbf990ddb` |
| golden input sha256 | ตาม `interop-meta.json` ใน fixtures |
| packetContentId | `sha256:813ab601dcf7…` (ตรงกันทั้งสองฝั่ง) |
| fixture ที่ commit | `src/packet-verifier/interop/fixtures/` (pin ไบต์ผ่าน `.gitattributes` binary + hash ในเทส) |

## 4. ผลเทส (18 ก.ค. 2026)

- Black-box interop: **3/3 PASS** (pin ตรง · exact three-field success · tamper fail-closed)
- Full verifier suite รวม interop: **128/128 PASS** · `tsc --noEmit` clean
- ก่อนหน้า (บริบท): dry-run 17-18 ก.ค. 2/2 PASS กับ snapshot ที่พิสูจน์แล้วว่า byte-identical กับ frozen commit 10/10 ไฟล์

## 5. สถานะ SoD

การ consume frozen OUTPUT คือ cross-validation ที่เจตนาไว้ — ไม่ใช่การแชร์โค้ดระหว่าง construction (จบไปแล้วทั้งสองฝั่ง) · เทสนี้กลายเป็น **CI gate ถาวร**: อยู่ใน root vitest ที่ verify-full รันทุก push · การปิด S17-5 ยังเหลือ independent review ตาม SoD (ต้องไม่ใช่ Codex) + production wiring

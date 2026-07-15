# S17-6 — Key Custody Kickoff (AWS KMS · ECDSA P-256)

รุ่น: 1.0 (2026-07-15) · ADR-064 (custody) · ADR-068 (ECDSA P-256 on KMS) · CT-DEC-002 v0.4.1 (registry contract)

**เป้าหมาย**: สร้าง signing key custody สำหรับ factory packet attestation ให้พร้อมก่อน real-cut · **long pole / critical path** ของ real-cut gate (S17-5 verify signature ไม่ได้ถ้าไม่มี key)
**หลักเหล็ก**: private key **non-exportable** (อยู่ใน HSM ไม่มีวันออก) · **human-driven** (ADR-066 — AI ไม่แตะ AWS) · ceremony มีหลักฐาน

## 0. Roles (ตามมติ custody ADR-064)
| บทบาท | สิทธิ์ |
| --- | --- |
| **Security Owner = Key Owner** | เจ้าของ lifecycle · อนุมัติหลักในทุก key op |
| **Product Owner** | อนุมัติร่วม create/rotate/revoke (joint กับ Security Owner) |
| **Tech Lead** | integration เท่านั้น — **ไม่มีวันเห็น raw private key** (KMS ไม่ export อยู่แล้ว = automatic) |
| **Factory Owner** | อนุมัติใช้ packet ใน pilot · ไม่ถือกุญแจ |

## 1. สร้าง KMS key (Security Owner + PO ร่วม)
- **KeySpec** = `ECC_NIST_P256` · **KeyUsage** = `SIGN_VERIFY` · **Origin** = `AWS_KMS` (non-exportable โดยกำเนิด)
- **Region** = `ap-southeast-1` · single-region (pilot) · **Rotation** = manual (asymmetric KMS ไม่ auto-rotate — ตรงกับ registry version control)
- ตั้ง **alias** ชัด เช่น `alias/monolith-factory-packet-signer-v1`
- จด **key ARN** + creation time + ผู้กด + ผู้อนุมัติร่วม

## 2. Key policy + joint-approval (จุดที่ต้องเข้าใจตรง)
> ⚠️ **KMS ไม่มี native "M-of-N approval" ต่อ 1 API call** — joint-approval ทำผ่านชั้นรอบ:
- **kms:Sign** → grant เฉพาะ role ของ factory-api (สำหรับ sign เท่านั้น)
- **create/rotate/disable/ScheduleKeyDeletion** → gate ด้วย IAM policy + **MFA required** + change-approval workflow ที่ต้อง 2 คน (PO + Security Owner) เซ็น (เช่นผ่าน AWS approval / ticket + MFA แยกคน)
- **Recovery 2-of-3** (หรือ 2-of-2 pilot): `ScheduleKeyDeletion` มี window 7-30 วัน — การ cancel/confirm ต้องหลายคน · เก็บ break-glass procedure แยก
- อ้าง NIST SP 800-57 Pt.1 r5 (separation of duties) + FIPS 140-2 L3 (KMS HSM)

## 3. ดึง public key → trusted-key registry (ตาม CT-DEC-002 v0.4.1)
- `kms:GetPublicKey` → ได้ **DER SubjectPublicKeyInfo** (id-ecPublicKey + prime256v1, BIT STRING = 65-byte `0x04‖X‖Y`)
- ลง registry record: `keyId` · `algorithm = ECDSA_P256_SHA256` · KMS key ARN + spec `ECC_NIST_P256` · **SPKI DER เป็น padded Base64** · `notBefore/notAfter` · `state = ACTIVE` · signed registry version (monotonic)
- **ห้าม** เก็บ compressed point / PEM / bare point — spec บังคับ canonical DER SPKI

## 4. factory-api integration (S17-6 code — Track ทีหลัง, ไม่ใช่ ceremony)
- SDK `kms:Sign` · `SigningAlgorithm = ECDSA_SHA_256` · `MessageType = DIGEST` (ส่ง SHA-256 digest 32 byte, **ห้าม hash ซ้ำ**)
- แปลง **DER → raw r‖s 64-byte** + บังคับ **low-S** (`s ≤ floor(n/2)`) ก่อนใส่ `valueBase64` (ตาม §10)
- verifier ทำ inverse: raw r‖s → verify ECDSA over digest (ไม่ recompute signature)

## 5. Ceremony evidence (redacted → git)
เก็บ `docs/evidence/keys/packet-signer-v1/ceremony.json`:
```json
{ "schema": "monolith.s17-6.key-ceremony@1",
  "keyArn": "arn:aws:kms:ap-southeast-1:...:key/...",
  "keySpec": "ECC_NIST_P256", "keyUsage": "SIGN_VERIFY",
  "publicKeySpkiSha256": "<sha256 ของ DER SPKI>",
  "registryKeyId": "...", "registryVersion": 1,
  "createdBy": "<role-ref>", "jointApprovers": ["security-owner","product-owner"],
  "recoveryPolicy": "2-of-2 pilot", "at": "<ISO8601>" }
```
> เก็บแค่ ARN + public-key hash + approvers-by-role · **private key ไม่มีทางออกจาก KMS** จึงไม่มีอะไรให้ redact ฝั่ง secret

## 6. Definition of Done (S17-6)
- [ ] KMS ECC_NIST_P256 key สร้างแล้ว non-exportable + alias + ARN บันทึก
- [ ] joint-approval (IAM+MFA) สำหรับ create/rotate/revoke ตั้งแล้ว + recovery policy
- [ ] public key เข้า trusted-key registry (canonical DER SPKI) + registry version 1
- [ ] ceremony evidence (redacted) commit
- [ ] factory-api sign path ทดสอบบน **staging** (produce → verify low-S ผ่าน) ก่อน pilot

## Guardrails
- 🔴 key นี้ใช้กับ **factory packet เท่านั้น** · receipt/release ยังเป็น Ed25519 (ADR-068 Q2)
- 🔴 ไม่มี real-cut จนกว่า S17-5 verifier + ceremony ครบ + real-cut gate 4 เงื่อนไข
- human-driven ทุกขั้น (ADR-066) — AI ร่าง/ตรวจได้ แต่ไม่กด AWS

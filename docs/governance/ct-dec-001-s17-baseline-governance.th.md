# CT-DEC-001 — S17 Baseline Reconciliation และ Execution Governance

วันที่มีผล: 2026-07-11  
สถานะ: **RECORDED — human decision**  
ขอบเขต: MONOLITH S17 P0 closure  
Baseline ที่ตรึง: `9ac7cff39d02d9430879275645e377728bc0abc5`  
ชื่อเดิมในแชต Control Tower: `SESSION 01A — D-1 Baseline Reconciliation` และ `AMENDMENT-01`  
อำนาจเอกสาร: มติมนุษย์; AI Control Tower และ Codex ทำหน้าที่ advisory/non-authoritative

## 1. Authority register

| มติ | บทบาทผู้อนุมัติ | ขอบเขตอำนาจ |
| --- | --- | --- |
| 1. ปลด Track A | **Tech Lead** | dependency order และสิทธิ์เริ่ม implementation จาก baseline |
| 2. จัดชั้น CI E0 | **Tech Lead** | technical evidence classification แบบ scope-limited |
| 3. คงสามสาย + separation of duties | **Tech Lead** และ **Security Owner** แยกบทบาท | execution architecture และ independent verification |
| 4. Durable evidence archive | **Tech Lead** | CI evidence retention/provenance |
| 5. S17-3 approval matrix | **Tech Lead** และ **Security Owner** แยกบทบาท | spec authority, trust boundary และ key semantics |

ผู้อนุมัติคนเดียวกันถือสองบทบาทได้ แต่ record ต้องเก็บบทบาทแยกกัน การรับรองในบทบาทหนึ่งไม่ถูกนับแทนอีกบทบาทโดยอัตโนมัติ

## 2. ข้อเท็จจริงที่ reconcile แล้ว

### 2.1 Commit delta ที่วัดซ้ำได้

| Commit range | ผลวัด | วิธีวัด |
| --- | --- | --- |
| `f9740559..9ac7cff3` | **26 files**; ในจำนวนนี้ code/CI **8 files** (`.github/workflows` 1 + `src` 6 + `tools` 1) | `git diff --name-only f9740559 9ac7cff3` แล้วนับรายชื่อ; code/CI นับเฉพาะสาม path ที่ระบุ |
| `d7b1c879..9ac7cff3` | **31 files** | `git diff --name-only d7b1c879 9ac7cff3` แล้วนับรายชื่อ |

ห้ามอ้าง “26/31 files” โดยไม่มี commit range และวิธีวัด

### 2.2 CI ที่ผูก baseline

- Main run `29142280872`: `verify-full`, success, commit SHA เต็มตรง baseline, full typecheck + automated tests **4,553/4,553** + build + evidence artifact
- Branch run `29142279488`: success ที่ commit SHA เดียวกัน เป็น corroborating run
- Main artifact `8245562223`, SHA-256 `6fb49466fee477b54f05c8e1d2470cacc6c83cba91e889700cc1cdde7f6886fd`, retention 90 วัน
- Durable record: `docs/evidence/ci/9ac7cff3/`

## 3. มติที่ 1 — ปลด Track A ทันที (Tech Lead)

`S17-1 Server-owned identity` → `S17-2 RELEASED-only invariant` **เริ่ม implementation ได้ตั้งแต่บัดนี้** โดยมีข้อบังคับ:

1. แตก clean worktree จาก exact baseline `9ac7cff39d02d9430879275645e377728bc0abc5`
2. ห้ามใช้ worktree dirty หรือแชร์ working directory กับ Track B/Human-Ops
3. identity ต้องมาก่อน RELEASED invariant ตาม dependency order ใน Review §5
4. การอนุญาตนี้ไม่ขยายไป S17-3/4/5 และไม่ใช่ P0 closure

เหตุผล: identity ไม่พึ่ง Canonical Packet Spec การล็อก Track A รอ packet contract ขัด dependency order ที่อนุมัติแล้วและเผา schedule margin ซึ่งประมาณเป็นศูนย์

**Track B ยังคงล็อก implementation ของ S17-4/S17-5** จนกว่า S17-3 จะได้ approval matrix ครบ ส่วนการร่าง S17-3 เริ่มได้ทันทีในสถานะ DRAFT

## 4. มติที่ 2 — ถอน “missing CI E0” (Tech Lead)

สถานะที่ถูกต้องคือ:

> **E0 CI PASS — scope-limited**: full typecheck + automated tests 4,553/4,553 + build บน `ubuntu-latest / node v22.23.1` ณ `9ac7cff3`; main run `29142280872`, branch run `29142279488`, main artifact `8245562223`, retention 90 วัน

Exclusion list ต่อไปนี้เป็นส่วนหนึ่งของ claim และห้ามแยกออก:

1. Invariant สองตัวของ `tools/vault-builder/src/pipeline.test.ts` return ก่อนตรวจบน CI เมื่อไม่มี `_daph_extract`; หลักฐานยัง local-only
2. DB/psql tests (`AB-DB-01`) ไม่อยู่ใน workflow
3. E2E ไม่อยู่ใน workflow
4. E0 นี้ไม่พิสูจน์ deployment, operational readiness, production readiness หรือ P0 closure ใด ๆ

## 5. มติที่ 3 — ไม่เปิด Track C สายที่สี่ (Tech Lead + Security Owner)

คง execution model **สามสาย** ตาม ADR-065:

| สาย | ขอบเขต |
| --- | --- |
| Track A | S17-1 → S17-2 |
| Track B | S17-3 → S17-4 → S17-5 |
| Human/Ops | custody, machine confirmation/calibration, factory slot, approver ceremony |

เพิ่ม constraint เป็น amendment ของ ADR-065:

> **S17-5 Full Verifier ต้อง implement และ review โดยฝ่ายที่อิสระจากผู้เขียน S17-3/S17-4 builder; builder ห้ามอนุมัติงานตรวจของตนเอง**

ความเป็นอิสระอาจจัดด้วย reviewer/บัญชี/ช่วงเวลาที่แยกจาก builder ภายในสามสายเดิม ไม่สร้าง Track C และไม่เพิ่ม execution stream โดยปริยาย

## 6. มติที่ 4 — Durable evidence archive (Tech Lead)

หลักฐาน CI ที่มี retention จำกัดต้องถูก archive ก่อนหมดอายุใน `docs/evidence/` อย่างน้อยประกอบด้วย:

- `verify-evidence.json` ที่ workflow สร้าง
- run URL, run ID, commit, environment และวันที่
- artifact ID, วันหมดอายุ และ SHA-256 digest ของ artifact ZIP
- exclusion list และ evidence classification
- manifest แบบ LF UTF-8 + lowercase hex

ไฟล์ archive ZIP ไม่จำเป็นต้อง commit ถ้า digest/provenance ถูกเก็บครบ แต่ห้ามอ้างว่า digest ถูกตรวจอิสระเมื่อค่ามาจาก GitHub artifact metadata; ต้องบอกแหล่งที่มาตรง ๆ

## 7. มติที่ 5 — S17-3 approval matrix (Tech Lead + Security Owner)

Canonical Packet Spec (`CT-DEC-002 / S17-3`) ต้องได้ลายเซ็นมนุษย์ครบสามบทบาทก่อนปลด S17-4/S17-5:

| Approver | ขอบเขตขั้นต่ำ |
| --- | --- |
| Tech Lead | schema, canonicalization, determinism contract, implementation feasibility |
| Factory Owner | file contract, machine-profile binding, verifier usability, factory operating fit |
| Security Owner | signature, trust boundary, key semantics, fail-closed behavior |

Security Owner ต้อง review อย่างน้อยส่วน signature/trust boundary/key semantics แต่การอนุมัติสามบทบาทเป็นคนละช่องและต้องบันทึกแยกกัน

## 8. Governance cleanup ที่มีผลทันที

1. Control Tower decision namespace ใช้ `CT-DEC-xxx`; ห้ามใช้ `D-x` ซึ่งชนกับ task IDs ใน repo
2. `SESSION 01A` ขึ้นทะเบียนเป็น **CT-DEC-001**
3. ใช้คำ **pinned/frozen + tamper-evident**; ห้ามใช้ immutable กับ unsigned Git commit
4. Operational branch rule สำหรับ Track A ในรอบนี้คือ exact SHA `9ac7cff3`; ข้อนี้แทน dynamic “latest origin/main” ของ ADR-065 สำหรับ Track A รอบนี้โดยเฉพาะ
5. Chat transcripts ยังคงเป็น advisory provenance; durable authority อยู่ที่ record ใน repo + manifest + commit นี้

## 9. ขอบเขตที่ไม่เปลี่ยน

- PRD v5.1 เป็น Target-State Canonical แต่ยังไม่ใช่ production-ready
- มตินี้ไม่ปิด P0 ใด ๆ
- ADR-064 ยังต้อง Product Owner + Tech Lead + Security Owner + Factory Owner ลงชื่อครบสี่บทบาท
- Track B implementation ยังล็อกจน CT-DEC-002/S17-3 อนุมัติครบ
- **ห้ามตัดชิ้นงานจริงจาก packet** จนกว่า S17 ปิดและ gate ตัดจริงผ่านครบสี่เงื่อนไข

## 10. Single next governance action

ร่าง **CT-DEC-002 / S17-3 Canonical Packet Specification** โดยต้องกำหนดอย่างน้อย `packetContentId`, `jobRunId`, signed identity ที่ผูก released revision + machine-profile version + exporter version + schema version, manifest per-file format, signature/trust boundary, full-verifier contract และ `NOT_FOR_PRODUCTION.txt` + `NFP-` prefix ที่มีอยู่จริงใน baseline

CT-DEC-002 คงสถานะ DRAFT จน approval matrix ทั้งสามบทบาทลงชื่อครบ

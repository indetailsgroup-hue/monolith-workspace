# CT-DEC-003-A1 Independent Source Review — Governance Tooling Bytes

วันที่มีผล: 2026-07-16
สถานะ: **RECORDED — independent review evidence (advisory, non-authoritative)**
Record ที่รีวิว: `CT-DEC-003-A1` (2026-07-15) — **คงเดิม ไม่แก้ไข**
ผู้รีวิว: **Claude** — อิสระจาก Codex ผู้จัดทำ/แก้ tooling (builder ≠ reviewer ตาม ADR-065/066)
วัตถุประสงค์: ปิด **independent-source-review leg** ที่ CT-DEC-003 §4 กำหนดก่อนให้สถานะ OFFICIAL

> Record นี้เป็น review evidence เท่านั้น ไม่ได้มอบสถานะ OFFICIAL เอง (เป็น human decision ของ Tech Lead), ไม่อนุมัติ CT-DEC-002, ไม่ปลด Track B, ไม่ปิด P0 blocker

## 1. Scope และ independence

- รีวิว 4 ไฟล์ที่ exact pinned bytes (ตรงกับ CT-DEC-003-A1 §2):

```text
d7e05ddc8ef3b7e5e56c7b68a07adf5555f0366bb9e2c7a6f00796b7487c198a  scripts/render-standalone-markdown.mjs
3cd69ca33cfc1fec7657fd0a242668f24706f38ba52b27be7021579d8e58a584  scripts/write-sha256-manifest.mjs
9fbbf53519a2d45e3298a5d7d7e7b0df6481396b40a440cd707206b359ea2cb8  scripts/verify-sha256-manifest.mjs
cef610700abc1e17258373b99cd0243c757407cfd75f92e6ddbf1e0b07fe8093  scripts/governance-tooling.test.mjs
```

- **Independence**: ผู้จัดทำ/แก้ tooling = Codex; ผู้รีวิว = Claude (agent คนละตัว) — ปิดขา SoD ที่ CT-DEC-003 §4 ต้องการจริง ไม่ใช่ self-review
- **Method**: อ่าน source ครบทุกบรรทัด + reproduce test suite + **adversarial empirical probes** ของ control ที่ test เดิมไม่ครอบ

## 2. Per-file verdict

| ไฟล์ | Verdict | Control หลักที่ยืนยันใน source |
| --- | --- | --- |
| `write-sha256-manifest.mjs` | **SOUND** | containment 2 ชั้น (logical `relative` + physical `realpath`), canonical path (NFC / reject `..` / backslash / win32-absolute / control char / Windows reserved name / trailing dot-space), dedup + case-fold, reject self-list, reject symlink input/output, sort ด้วย `Buffer.compare` unsigned UTF-8 |
| `verify-sha256-manifest.mjs` | **SOUND** | reject: BOM, CR/CRLF, non-UTF-8 (fatal decode), blank line, trailing-LF ≠ 1, malformed entry, non-lowercase-64hex digest, non-canonical path, dup/case-fold, unsorted, symlink, traversal, self-reference (`fileReal === manifestReal`), digest mismatch |
| `render-standalone-markdown.mjs` | **SOUND** | ไม่มี raw-HTML passthrough, escape-first-then-construct, link scheme allowlist `https?`/`mailto` (บล็อก `javascript:`/`data:`/`vbscript:`/`//`/control-char), NUL reject, unclosed-fence throw, `rel=noopener noreferrer` |
| `governance-tooling.test.mjs` | **MEANINGFUL** | assert exact output bytes + exit status บน negative จริง — ไม่ใช่ hollow test |

## 3. Adversarial empirical probes (control ที่ test เดิมไม่มี — ยิงจริง)

| Probe | Input | ผล |
| --- | --- | --- |
| BOM manifest | `﻿` + entry | ✅ INVALID |
| Self-reference | manifest list ตัวเอง | ✅ INVALID |
| Non-lowercase hex | digest ตัวใหญ่ | ✅ INVALID |
| `data:` link | `[x](data:text/html,<script>…)` | ✅ rejected |
| Protocol-relative | `[x](//evil.example/x)` | ✅ rejected |
| Case-fold | `File.txt` vs `file.txt` (verify + write) | ✅ rejected |
| Sanity | manifest ถูกต้อง + doc ปลอดภัย | ✅ **PASS** (ไม่ใช่ reject ทุกอย่าง) |

## 4. Reproduced + newly-locked tests

- `governance-tooling.test.mjs` (cef61070): **5/5 pass** (reproduce)
- **NEW** `governance-tooling-controls.test.mjs` (`08f472431cb7ccffc38623478efa9fd82d1e3ac17586e7de8add6be1195f5ca8`): **7/7 pass** — ล็อก control ที่ยังไม่มี regression test: BOM / non-lowercase-hex / malformed-hex / trailing-LF / self-reference / case-fold / renderer schemes (`data:`/`vbscript:`/`//`) / inline NUL / writer self-list

> ไฟล์ test ใหม่เป็น **ไฟล์แยก** โดยเจตนา เพื่อให้ 4 ไฟล์ที่ A1 §2 pin ไว้**คง byte เดิมทุกตัว** (OFFICIAL classification ไม่ถูกกระทบ) — ยืนยันแล้วว่า 4 hash ยังตรง A1 §2 หลังเพิ่ม test

## 5. Observations (low severity — ไม่ใช่ blocker, สอดคล้อง residual ที่ A1 §3 disclose)

1. Leading-space ใน path segment ไม่ถูก reject (trailing dot/space ถูก) — ไม่มีผล containment, cosmetic
2. NUL reject เฉพาะใน inline text ไม่รวม fenced-code body — browser ignore NUL, trusted input, negligible
3. TOCTOU read race (lstat → realpath → read) — disclosed แล้วใน A1 §3
4. Manifest ตรวจ integrity ของไฟล์ที่ list ไม่ใช่ completeness ของ set — inherent, ไม่ได้อ้างเกิน
5. Windows `CONIN$`/`CONOUT$` ไม่อยู่ใน reserved-name regex — marginal มาก

ไม่พบ defect ระดับ **high หรือ medium**

## 6. SoD status สำหรับ OFFICIAL (ตาม CT-DEC-003 §4)

| เงื่อนไข | สถานะ |
| --- | --- |
| independent source review | ✅ **DONE** — record นี้ (Claude ≠ Codex) |
| reproduce negative tests | ✅ DONE — 5/5 + 7/7 + 7 probes |
| human decision (Tech Lead ratify OFFICIAL) | ⬜ PENDING — สิทธิ์ของ Tech Lead |

## 7. Verdict + endorsement

Tooling ที่ exact pinned bytes **implement control ตาม A1 §3 ครบถ้วน** สำหรับ scope ที่ disclose (governance-document manifests + standalone HTML) · residual limits ระบุตรงไปตรงมา · **ไม่พบ defect high/medium** · OFFICIAL-for-governance-docs classification จึง **defensible** ผม endorse โดยมีเงื่อนไข:

- (ก) ผูกกับ **exact bytes** — byte ใดเปลี่ยน tool นั้นกลับเป็น CANDIDATE (A1 §5 บังคับอยู่แล้ว)
- (ข) supplementary regression suite เพิ่มแล้ว (§4) เพื่อกัน control เหล่านี้ regress เงียบ

ขั้นที่เหลือ = **Tech Lead ratify** อย่างมีสติ (ไม่ใช่ builder self-elevate)

## 8. Boundary ที่ไม่เปลี่ยน

- CT-DEC-002 ยัง DRAFT — approval 3 บทบาทยัง PENDING
- Track B (S17-4/5) ยัง LOCKED · ไม่มี P0 ปิด · ADR-064 ยังต้องครบ 4 บทบาท
- dogfood จริงยัง `AUTHORIZED/PREPARED — NOT STARTED`
- `verify-sha256-manifest.mjs` **ไม่ใช่** S17-5 factory packet verifier (ไม่ทำ schema-bundle / NFP precedence / registry lookup / ECDSA raw r‖s / KMS trust / machine admission)
- ผลจาก governance tools เหล่านี้ห้าม emit หรือสื่อเป็น bare `PKT_OK` / `CUT` / production-ready / approval authority

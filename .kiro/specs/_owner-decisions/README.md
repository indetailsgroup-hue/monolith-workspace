# Owner Business-Decision Form — Phase 2 gaps

> **✅ RESOLVED (grill session 3 ก.ค. 2026)** — ทั้ง 7 ข้อถูกตัดสินใจแล้ว ดู ADR-028..032 ใน `.kiro/steering/architecture-decisions.md`
> ฟอร์ม HTML/Apps Script ด้านล่างเก็บไว้เผื่อทบทวนภายหลัง

## ผลการตัดสินใจ (3 ก.ค. 2026)

| ข้อ | การตัดสินใจ | งานที่ตามมา |
|---|---|---|
| 1. Vendor Master | **tax_id หลัก + ชื่อรอง** (ADR-028) | แก้ master_refs + unique index tax_id + signal `name_mismatch` |
| 2. Material Master | **คง auto-upsert + needs_review queue + normalize ชื่อ** (ADR-029) | คอลัมน์ needs_review + merge RPC + normalize fn |
| 3. Ledger | **Monolith = operational ledger หลัก + export ให้นักบัญชียื่นงบ** (ADR-030) | export RPC/report (posted only, read-only) |
| 4. ราคาซื้อจริง | **ยังไม่มี PO — คง po_ref optional** + ใช้ price ceiling ต่อวัสดุ + total_anomaly กันแทน (ratify 0070) | เพิ่ม price ceiling ใน material_master (optional) |
| 5. Released_Spec | **gate confirmer = Designer Lead** ผ่าน RACI approver-resolver (ADR-031 amended — designer_lead ไม่ใช่ C12 role) | ต่อ promote path เข้า Approval_Request (pattern 0023) — migration ใหม่ |
| 6. MCP exposure | **ยังไม่เปิด** — internal เท่านั้น ทบทวนเมื่อมี use case (ADR-032) | ไม่มี |
| 7. Auto-approve / OCR | **มนุษย์ตรวจทุกใบ** (ratify verify gate เดิม); OCR: **Claude เป็น bridge → Typhoon เมื่อ GPU พร้อม + ผ่าน dual-run ≥95%** (ADR-033) | Extraction_Engine adapter seam + flag `cloud_allowed` ต่อ capture_type; เอกสารบุคคลธรรมดา (site_survey, installation_proof) = manual entry ระหว่าง bridge |

---

## เอกสารเดิม (ก่อนตัดสินใจ)

เก็บการตัดสินใจเชิงธุรกิจ/schema ที่ค้างอยู่ ก่อนสร้างส่วนที่เหลือ (master tables, commit-target adapters, MCP external exposure)

## ตัวเลือกที่ 1 (แนะนำ) — HTML form แบบ self-contained

ไฟล์: **`owner-decisions-form.html`** — เปิดไฟล์เดียวจบ ไม่ต้องติดตั้ง/ไม่ต้องมีบัญชี Google

1. ดับเบิลคลิกเปิด `owner-decisions-form.html` ในเบราว์เซอร์ (เปิด offline ได้ — ไม่ส่งข้อมูลออกนอก = on-prem/PDPA)
2. กรอกทั้ง 7 หัวข้อ (ข้อที่ยังไม่ชัดเลือก "ยังไม่ตัดสินใจ"; ความคืบหน้าถูก autosave ในเบราว์เซอร์)
3. กด **บันทึก → ดาวน์โหลด `answers.json`** (หรือปุ่ม "คัดลอก JSON")
4. ส่งไฟล์ `answers.json` กลับให้ทีมพัฒนา → จะสร้าง table/adapter ตามคำตอบ

## ตัวเลือกที่ 2 — Google Form (ถ้าอยากเก็บออนไลน์)

ไฟล์: **`generate-owner-form.gs`** (Google Apps Script)

1. เปิด <https://script.google.com> → New project → วางโค้ดทับ `Code.gs`
2. Run `createOwnerDecisionForm` → authorize → Execution log จะให้ลิงก์ LIVE/EDIT

> ผมสร้างฟอร์มในบัญชี Google ของคุณโดยตรงไม่ได้ จึงทำเป็นสคริปต์/HTML ให้รันเอง

## แต่ละคำตอบปลดล็อก gap ไหน

| หัวข้อในฟอร์ม | Gap ที่ปลดล็อก | สร้างอะไรต่อ |
|---|---|---|
| 1. Vendor Master | L2 (fraud `vendor not in master`) | ตาราง `vendor_master` + wire ใน `rpc_capture_set_extraction` (unverified-mark) |
| 2. Material Master | L2 (`material_receipt` ตรงสเปค) | ตาราง `material_master` + verify_rule lookup |
| 3. Ledger | L3 adapter (`expense_document`→ledger) | ตาราง ledger หรือ export seam + commit ใน `rpc_capture_promote` |
| 4. ราคาซื้อจริง | L3 adapter (`material_receipt`→actual_purchase_price) | costing seam + PO match |
| 5. Released_Spec | L3 adapter (`spec_draft`→Released_Spec) | spec gate/state + commit adapter |
| 6. MCP exposure | MCP-capture external | MCP Write_Tool wrapping capture (reconcile double-gate) |
| 7. auto-approve / OCR | OQ-CS-2 / OQ-CS-3 | autonomy tier policy + Typhoon infra |

## สถานะปัจจุบัน (ไม่ต้องตัดสินใจ — ทำเสร็จแล้ว)

- workflow-copilot (→0061): core + D1 (Daily_Digest) RESOLVED
- mcp-layer (0036–0048): core + PBT 19/19 + Approval_Tool integration verified
- capture-spine (0049–0063): core + capture-loop types + **L3 adapter #1 (installation_proof→Work_Item) ทำงานจริงแล้ว**
- db reset 0001–0063 เขียว · 214 vitest เขียว · scrutinized ทุก wave

> **installation_proof** ใช้งานได้เลย (commit เข้า Work_Item จริง) — ไม่ต้องรอฟอร์ม.
> ฟอร์มนี้ปลดล็อกแผนกที่เหลือ (บัญชี/จัดซื้อ/ออกแบบ) ที่ต้องมี business table ก่อน

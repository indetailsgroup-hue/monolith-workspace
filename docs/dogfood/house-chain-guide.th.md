# คู่มือเดินสายบ้าน Dogfood — ปฏิบัติจริงทีละขั้น (house-01)

รุ่น: 1.0 (2026-07-18) · คู่กับ `first-house-runbook.md` (ขั้น 3–8 + shadow-compare)
สำหรับ: ทีมหน้างาน (Field Operator / Finance / Designer) — เปิดอ่านได้เองไม่ต้องถามใคร

---

## หลักการที่ใช้ทุกขั้น (อ่านครั้งเดียว ใช้ตลอด)

1. **งานจริงเกิดในระบบเดิมก่อนเสมอ** (แอป/RPC โดยคนตามบทบาท) → แล้วค่อยเอา **id / ref / เวลา** มาประทับลง git ด้วยเครื่องมือ — ไม่ใช่กลับกัน
2. **กรอกไฟล์นอก git เสมอ** เช่น `C:\temp\house01-contract.json` — กัน PII หลุดเข้า history โดยอุบัติเหตุ
3. เวลาใช้รูปแบบ **ISO8601 UTC มี ms**: `2026-07-19T03:30:00.000Z` (เวลาไทย −7 ชั่วโมง)
4. ref ทุกช่อง ≥ 4 ตัวอักษร · **ห้าม**: ชื่อลูกค้า, ที่อยู่, เบอร์โทร, LINE, ยอดเงิน — ใส่มาเครื่องมือจะปฏิเสธเอง (PDPA redaction lint) แต่อย่าลองของ
5. คำสั่งรันจากรากโปรเจกต์ (checkout `main` ล่าสุด):

   ```
   node scripts/dogfood-record.mjs house-01 <step> C:\temp\ไฟล์.json
   ```

6. สำเร็จแล้วเครื่องมือจะพิมพ์ path + sha256 + คำสั่ง commit — **ตรวจตาด้วยคนหนึ่งครั้งก่อน commit** แล้ว push/เปิด PR ตามปกติ (คุณเดฟ merge)
7. **Record เป็น immutable** — กรอกผิดและ commit ไปแล้ว: ห้ามแก้ไฟล์เดิม ให้แจ้งเจ้าของระบบเปิด correction commit ใหม่ (ลบพร้อมบันทึกเหตุผล — ประวัติเดิมอยู่ใน git ตลอด)
8. เช็คความคืบหน้าได้ทุกเมื่อ:

   ```
   node scripts/dogfood-record.mjs house-01 --status
   ```

---

## ขั้น 3 — สัญญา (`contract`)

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | Field Operator (ลูกค้าเซ็นจริง) |
| ในระบบ | `rpc_field_generate_contract` → `send_contract` → `submit_signed_contract` |
| เก็บค่า | id ของสัญญาในระบบ + เวลาที่เซ็นสำเร็จ |

```json
{
  "contractId": "contract-h01-001",
  "signed": true,
  "signedAt": "2026-07-19T03:30:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 contract C:\temp\h01-contract.json
```

หมายเหตุ: `signed` ต้องเป็น `true` เท่านั้น — ยังไม่เซ็น = ยังไม่บันทึก (record นี้คือหลักฐานว่า "เซ็นแล้ว")

---

## ขั้น 4 — แผนเงิน + สลิปงวดแรก (`payment`)

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | Field Operator ตั้งแผน / Finance รับสลิป + เช็คยอดเอง |
| ในระบบ | `rpc_field_set_payment_plan` → `rpc_finance_submit_slip` → `record_payment` |
| เก็บค่า | id แผนเงิน + ref ของสลิปงวดแรก (id ในระบบ ไม่ใช่รูปสลิป) |

```json
{
  "paymentPlanId": "plan-h01-001",
  "firstInstallmentSlipRef": "slip-h01-001",
  "recordedAt": "2026-07-20T04:00:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 payment C:\temp\h01-payment.json
```

🔴 **ยอดเงินห้ามลง git** — schema ปิดตาย ใส่ field `amount` ใด ๆ มาก็โดนปฏิเสธ ยอดจริงอยู่ในระบบ + สลิปเท่านั้น

---

## ขั้น 5 — แผนติดตั้ง + วัดหน้างาน (`install-plan`)

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | Field Operator (ไปวัดหน้างานจริง — human ตรวจก่อนอนุมัติตาม runbook §4) |
| ในระบบ | `rpc_field_draft_install_plan` → `send_install_plan` + บันทึก SiteSurveyZone จากการวัดจริง |
| เก็บค่า | id แผนติดตั้ง + ref ของ SiteSurveyZone |

```json
{
  "installPlanId": "install-h01-001",
  "siteSurveyZoneRef": "zone-h01-001",
  "draftedAt": "2026-07-21T06:00:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 install-plan C:\temp\h01-install.json
```

---

## ขั้น 6 — Variation Order (เฉพาะเมื่อมีแก้แบบ — ข้ามได้)

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | Field Operator (ลูกค้าเซ็น VO) |
| ในระบบ | `rpc_field_create_variation` → `submit_signed` |

```json
{
  "variationId": "vo-h01-001",
  "submittedSignedAt": "2026-07-22T05:00:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 variation C:\temp\h01-vo.json
```

ขั้นนี้**ไม่นับ**ใน core chain — ไม่มีก็ครบสายได้

---

## ขั้น 7 — ผลิต (`production`) — ขั้นที่หลักเหล็กแรงที่สุด

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | โรงงาน + Field Operator ติดตาม milestone |
| ในระบบ | โรงงานตัดจาก**ใบสั่งผลิตเดิม** · ติดตามผ่าน `rpc_factory_list_milestones` |
| เก็บค่า | ref ของ milestone การผลิต |

```json
{
  "milestoneRef": "milestone-h01-cut-001",
  "source": "legacy_work_order",
  "notedAt": "2026-07-25T08:00:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 production C:\temp\h01-production.json
```

🔴 `source` รับค่าเดียวคือ `legacy_work_order` — พิมพ์อย่างอื่น (เช่นอ้าง packet) = ปฏิเสธทันที นี่คือหลัก **"ห้ามตัดจริงจาก packet"** ที่ถูกแปลงเป็นโค้ด

---

## ขั้น 8 — ตรวจรับ/ส่งมอบ (`acceptance`)

| หัวข้อ | รายละเอียด |
| --- | --- |
| ใครทำ | Field Operator + ลูกค้าตรวจรับหน้างาน |
| ในระบบ | milestone handover/acceptance |

```json
{
  "acceptanceRef": "accept-h01-001",
  "handoverAt": "2026-08-05T07:00:00.000Z"
}
```

```
node scripts/dogfood-record.mjs house-01 acceptance C:\temp\h01-accept.json
```

บันทึกขั้นนี้เสร็จ → รัน `--status` จะขึ้น **"✔ core chain COMPLETE — dogfood≥1"** — บ้านนี้กลายเป็นเครดิตแรกของ real-cut gate

---

## ขนานตลอดสาย — Shadow-compare ของ Designer (ทำได้หลายรอบ ยิ่งบ่อยยิ่งดี)

**นี่คือของขวัญที่บ้านนี้ให้ S17** — ทุกครั้งที่แบบนิ่งพอ:

1. Designer ในแอป: ออกแบบ → **Freeze → Release → Export to CNC** → ได้ไฟล์ `NFP-factory-packet-….zip`
2. หา sha256 ของไฟล์ (PowerShell):

   ```
   certutil -hashfile "C:\ที่เก็บ\NFP-factory-packet-....zip" SHA256
   ```

3. **เทียบกับใบสั่งผลิตเดิม**ที่โรงงานใช้จริง ชิ้นต่อชิ้น: ขนาดตัด, ตำแหน่ง/จำนวนรู — จดเฉพาะจุดที่**ต่าง**
4. กรอก (diff กี่รายการก็ได้ — ว่าง `[]` = ตรงหมด ก็มีค่ามาก):

```json
{
  "packetFilename": "NFP-factory-packet-4f9be2a7-33c1-4d68-9b21-5f0e8d7a6c15-813ab601dcf7.zip",
  "packetSha256": "8a40f975c9712baca03a9b441736671c17484528a8f40daac4adc40cbf990ddb",
  "legacyOrderRef": "wo-h01-001",
  "comparedAt": "2026-07-24T09:00:00.000Z",
  "partsCompared": 12,
  "diffs": [
    { "ref": "part-07", "field": "cutWidthUm", "packet": 600000, "actual": 600500, "unit": "um" },
    { "ref": "part-11", "field": "holeCount", "packet": 8, "actual": 6 }
  ]
}
```

```
node scripts/dogfood-record.mjs house-01 shadow-compare C:\temp\h01-compare.json
```

ไฟล์จะ auto-number (`shadow-compare-01`, `-02`, …) — รอบใหม่ = record ใหม่เสมอ · ชื่อไฟล์ packet ต้องเป็นรูปแบบ NFP จริง (กัน packet นอกระบบ) · 🔴 packet ใช้**เทียบเท่านั้น ห้ามส่งเข้าเครื่องตัด**

---

## สรุปภาพเดียว

```
งานจริงในระบบ → เก็บ ref → กรอกไฟล์นอก git → รัน tool → ตรวจตา → commit/PR
ทำซ้ำทีละขั้นจน --status ขึ้น "core chain COMPLETE — dogfood≥1"
```

ตลอดสาย: โรงงานตัดจากกระบวนการเดิมเท่านั้น · Designer packet = NFP เพื่อเทียบ · `realCutAllowed` เปลี่ยนได้ทางเดียวคือ real-cut gate 4 เงื่อนไข (ไม่ใช่ทางคู่มือนี้)

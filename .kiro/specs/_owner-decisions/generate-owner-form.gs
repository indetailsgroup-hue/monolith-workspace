/**
 * DAPH Monolith — Owner Business-Decision Form generator (Google Apps Script)
 * ──────────────────────────────────────────────────────────────────────────
 * วัตถุประสงค์: เก็บการตัดสินใจเชิงธุรกิจ/schema ที่ค้าง (blocking gaps) ก่อน implement ต่อ
 *   - L2  : Vendor / Material master tables (capture master validation)
 *   - L3  : Commit-target adapters (expense→ledger, material_receipt→actual_purchase_price, spec_draft→Released_Spec)
 *   - MCP : เปิด capture ให้ external AI agent ผ่าน MCP Write_Tool หรือไม่ (double-gate)
 *   - OQ  : แผนกแรกที่ deploy / auto-approve / Typhoon OCR infra
 *
 * วิธีใช้ (เจ้าของทำเอง ~2 นาที):
 *   1) เปิด https://script.google.com  →  New project
 *   2) วางโค้ดนี้ทั้งไฟล์ทับ Code.gs
 *   3) กด Run เลือกฟังก์ชัน `createOwnerDecisionForm`  (ครั้งแรกจะขอ authorize — อนุญาต)
 *   4) ดู Execution log → จะมีลิงก์ "EDIT" (แก้ฟอร์ม) และ "LIVE" (ส่งให้กรอก)
 *
 * หมายเหตุ: ฟอร์มถูกสร้างในบัญชี Google ของผู้รัน — ไม่มีข้อมูลรั่วออกนอกองค์กร
 */

function createOwnerDecisionForm() {
  var form = FormApp.create('DAPH Monolith — การตัดสินใจเชิงธุรกิจก่อนสร้างต่อ (Phase 2 gaps)');
  form.setDescription(
    'แบบฟอร์มนี้เก็บการตัดสินใจที่จำเป็นต่อการสร้างส่วนที่เหลือ (master tables, commit-target adapters, ' +
    'การเปิดให้ AI ภายนอกใช้งาน). ตอบเท่าที่ทราบ — ข้อที่ยังไม่ชัดเลือก "ยังไม่ตัดสินใจ" ได้\n' +
    'อ้างอิง gap: L2 (master), L3 (commit adapters), MCP-exposure. แต่ละหัวข้อมีผลต่อ schema ที่จะสร้าง.'
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);

  // ─────────────────────────────────────────────────────────────
  // 0. ภาพรวม / ลำดับความสำคัญ
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('0. ภาพรวมและลำดับความสำคัญ');

  form.addMultipleChoiceItem()
    .setTitle('แผนกแรกที่อยากเปิดใช้ Capture Spine จริง (OQ-CS-1)')
    .setHelpText('เลือกแผนกที่จะลงมือก่อน — กำหนดว่า adapter/master ตัวไหนต้องสร้างก่อน')
    .setChoiceValues([
      'บัญชี/การเงิน (expense_document → ledger) — ROI ชัด',
      'ติดตั้ง (installation_proof → Work_Item) — พร้อมแล้ว ✓',
      'จัดซื้อ (material_receipt → ราคาซื้อจริง)',
      'ออกแบบ (spec_draft → Released_Spec)',
      'หน้างาน/สำรวจ (site_survey → SiteSurveyZone)',
      'ยังไม่ตัดสินใจ'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('ต้องการให้สร้าง adapter/master ตัวไหนในรอบถัดไป (เลือกได้หลายข้อ)')
    .setChoiceValues([
      'Vendor master (ผู้ขาย)',
      'Material master (วัสดุ/สเปค)',
      'Ledger / ผังบัญชี (expense)',
      'Costing/ราคาซื้อจริง (material_receipt)',
      'Released_Spec / Spec gate (spec_draft)',
      'SiteSurveyZone (site_survey)'
    ]);

  // ─────────────────────────────────────────────────────────────
  // 1. Vendor Master (L2)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('1. Vendor Master (ผู้ขาย) — สำหรับ fraud check "vendor not in master"');

  form.addMultipleChoiceItem()
    .setTitle('มีฐานข้อมูล vendor อยู่แล้วหรือไม่')
    .setChoiceValues([
      'มีอยู่แล้ว (จะส่ง schema/ไฟล์ให้)',
      'ยังไม่มี — ให้สร้างใหม่',
      'ยังไม่ตัดสินใจ'
    ])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('field ของ vendor ที่ต้องเก็บ (ระบุชื่อ field + ชนิด)')
    .setHelpText('เช่น: vendor_code, ชื่อ, เลขผู้เสียภาษี (tax_id), ที่อยู่, สถานะ active. ระบุที่จำเป็นต่อการตรวจสอบใบกำกับภาษี');

  form.addMultipleChoiceItem()
    .setTitle('ใช้ field ใดเป็น "ตัวตรงกับเอกสาร" (matching key) เวลาตรวจ vendor not-in-master')
    .setChoiceValues(['เลขผู้เสียภาษี (tax_id)', 'ชื่อผู้ขาย (อาจไม่ตรงเป๊ะ)', 'vendor_code', 'อื่น ๆ (ระบุในข้อถัดไป)']);

  // ─────────────────────────────────────────────────────────────
  // 2. Material Master (L2)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('2. Material Master (วัสดุ/สเปค) — สำหรับ material_receipt "ตรงสเปค"');

  form.addMultipleChoiceItem()
    .setTitle('มีฐานข้อมูลวัสดุ/สเปคอยู่แล้วหรือไม่')
    .setChoiceValues(['มีอยู่แล้ว', 'ยังไม่มี — ให้สร้างใหม่', 'ยังไม่ตัดสินใจ'])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('field ของวัสดุที่ต้องเก็บ')
    .setHelpText('เช่น: material_code, ชื่อ, หน่วย, สเปค, ราคาอ้างอิง/เพดาน, ผู้ขายที่อนุมัติ');

  // ─────────────────────────────────────────────────────────────
  // 3. Ledger / บัญชี (expense → ledger)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('3. Ledger / บัญชี — commit-target ของ expense_document');

  form.addMultipleChoiceItem()
    .setTitle('ปลายทางการบันทึกค่าใช้จ่ายเมื่ออนุมัติแล้ว')
    .setChoiceValues([
      'สร้างตาราง ledger ใน Monolith เอง',
      'ส่งออกไประบบบัญชีภายนอก (เช่น Express/PEAK/QuickBooks) — ระบุชื่อ',
      'ยังไม่ commit ใน core (เก็บ artifact ไว้ก่อน)',
      'ยังไม่ตัดสินใจ'
    ])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('ถ้าสร้าง ledger เอง — ต้องการ field/หมวด (chart of accounts) อะไรบ้าง')
    .setHelpText('เช่น: บัญชี/หมวด (category), เดบิต/เครดิต, vat, wht, vendor, เลขเอกสาร, วันที่');

  // ─────────────────────────────────────────────────────────────
  // 4. Costing / ราคาซื้อจริง (material_receipt)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('4. ราคาซื้อจริง (actual_purchase_price) — commit-target ของ material_receipt');

  form.addMultipleChoiceItem()
    .setTitle('มีตาราง/seam สำหรับ "ราคาซื้อจริง" + การเทียบ PO อยู่แล้วหรือไม่')
    .setChoiceValues(['มีอยู่แล้ว', 'ยังไม่มี — ให้สร้าง', 'ยังไม่ตัดสินใจ'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('มีระบบ PO (ใบสั่งซื้อ) ให้เทียบราคาหรือไม่')
    .setChoiceValues(['มี PO ในระบบ (เทียบได้)', 'ไม่มี PO — รับเข้าโดยไม่เทียบ', 'ยังไม่ตัดสินใจ']);

  // ─────────────────────────────────────────────────────────────
  // 5. Released_Spec (spec_draft)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('5. Released_Spec / Spec gate — commit-target ของ spec_draft');

  form.addMultipleChoiceItem()
    .setTitle('flow ของแบบ (spec) เป็นอย่างไร')
    .setChoiceValues([
      'DRAFT → Gate ยืนยัน → FROZEN → RELEASED (ตามที่ออกแบบไว้)',
      'flow อื่น (ระบุ)',
      'ยังไม่ตัดสินใจ'
    ]);

  form.addParagraphTextItem()
    .setTitle('"Bible code" คืออะไร + ใครเป็นผู้ยืนยัน gate (role)')
    .setHelpText('เพื่อผูก gate_confirmed กับผู้มีสิทธิ์จริง');

  // ─────────────────────────────────────────────────────────────
  // 6. AI ภายนอก (MCP exposure)
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('6. เปิดให้ AI ภายนอกใช้งาน (MCP Write_Tool)');

  form.addMultipleChoiceItem()
    .setTitle('ต้องการให้ AI agent ภายนอก (ผ่าน MCP) เสนอ "สร้างงาน/capture" ได้หรือไม่')
    .setHelpText('ถ้าเปิด: AI เสนอ → มนุษย์อนุมัติผ่าน MCP gate → ระบบทำจริง (มี human-in-the-loop เสมอ)')
    .setChoiceValues([
      'เปิด — อยากให้ AI ช่วยเสนองานได้',
      'ยังไม่เปิด — ใช้ภายใน (LINE/Gmail) ก่อน',
      'ยังไม่ตัดสินใจ'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('ถ้าเปิด — ยอมรับว่าต้องมีมนุษย์อนุมัติทุกครั้งก่อนมีผลจริงหรือไม่ (human-in-the-loop)')
    .setChoiceValues(['ใช่ มนุษย์อนุมัติทุกครั้ง', 'อยากให้ auto บางเคส (ดูข้อ 7)', 'ยังไม่ตัดสินใจ']);

  // ─────────────────────────────────────────────────────────────
  // 7. Auto-approve / OCR infra
  // ─────────────────────────────────────────────────────────────
  form.addSectionHeaderItem().setTitle('7. Auto-approve & Typhoon OCR (infra)');

  form.addMultipleChoiceItem()
    .setTitle('ช่วงแรก ให้ทุก capture ผ่านมนุษย์ตรวจหรือไม่ (OQ-CS-2)')
    .setChoiceValues([
      'มนุษย์ตรวจทุกใบ (ปลอดภัยสุด — แนะนำช่วงแรก)',
      'เปิด auto-approve เมื่อ confidence สูง + ความเสี่ยงต่ำ (ต้องมี data baseline ก่อน)',
      'ยังไม่ตัดสินใจ'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Typhoon OCR self-host (on-prem) พร้อมหรือยัง (OQ-CS-3)')
    .setHelpText('จำเป็นต่อ PDPA-by-architecture — OCR ต้องอยู่ใน infra องค์กร ไม่ส่งออกนอก')
    .setChoiceValues([
      'พร้อม (มี GPU/server ในองค์กร)',
      'ยังไม่พร้อม — ต้องจัดหา',
      'ต้องให้ทนายตรวจ license เชิงพาณิชย์ก่อน',
      'ยังไม่ตัดสินใจ'
    ]);

  form.addParagraphTextItem()
    .setTitle('ข้อกังวล/หมายเหตุเพิ่มเติม (เช่น เอกสารการเงิน/ภาษี ต้องผ่านผู้สอบบัญชี)')
    .setHelpText('anti-fraud + เอกสารการเงินควรผ่านทนาย/ผู้สอบบัญชีไทยก่อน production');

  // ─────────────────────────────────────────────────────────────
  // เก็บคำตอบลง Google Sheet อัตโนมัติ
  // ─────────────────────────────────────────────────────────────
  var ss = SpreadsheetApp.create('DAPH Owner Decisions — คำตอบ');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('✅ สร้างฟอร์มแล้ว');
  Logger.log('EDIT (แก้ฟอร์ม): ' + form.getEditUrl());
  Logger.log('LIVE (ส่งให้กรอก): ' + form.getPublishedUrl());
  Logger.log('SHEET (คำตอบ): ' + ss.getUrl());
  return { edit: form.getEditUrl(), live: form.getPublishedUrl(), sheet: ss.getUrl() };
}

# เปลี่ยน automation เอกสารให้ส่งผ่าน PR

คำสั่งเจ้าของ: เปลี่ยน Generator/Changelog จาก push ตรง main เป็น PR ฐานคือ62651733ffe8d249a1eacc627382dc8fdd3eaaa8 งานนี้ต่อจากPR121 การอนุมัติmergePR121ไม่ใช่การอนุมัติmergePRใหม่

## แบบและแผนดำเนินงาน

- [x] เขียน tests ที่แสดงปัญหาการส่งผลเข้า protected main และ entry ซ้ำ
- [x] Generator: checkout main ล่าสุด จัดลำดับรัน สร้างและตรวจข้อมูลตามเดิม สร้าง/อัปเดต codex/automated-site-data รวมเฉพาะ chapters.json, search_index.json และ chapter-cache.json 
- [x] Dry run: ตรวจข้อมูลอย่างเดียว ส่วนรันปกติที่ผลลัพธ์ตรงกับ main ให้ action จัดการสถานะ PR ตาม diff จริง
- [x] Changelog: checkout main ล่าสุด แต่ใช้SHAของeventต้นทางหาไฟล์และmetadata แยกbranch codex/changelog-SHA ต่อหนึ่งsource commit เพื่อไม่ให้eventใหม่แทนที่entryที่ยังไม่merge ใช้full-SHA markerกันซ้ำ และแปลงเวลาเป็นUTCจริง
- [x] ใช้signed bot commits ผ่านcreate-pull-request v7.0.8 pinที่271a8d0340265f705b14b6d32b9829c1cb33d45e จำกัดadd-paths ส่งเข้าmainและให้PRกลับเป็นdraftทุกครั้งที่อัปเดต ไม่มีauto-merge
- [x] เพิ่มcache-only PRเข้าpath filterของrequired docs CI
- [ ] Reviewอิสระ ผ่านcommit hookปกติ เปิดdraft PRของการแก้ไขนี้และเก็บผลActionsจริง
- [ ] หลังเจ้าของอนุมัติPRแก้ไข: merge ตรวจPRแรกที่botสร้างรวมsignature จากนั้นเริ่มrequired checksและreviewตามปกติ

## ขั้นตอนผู้ดูแล

1. Repository Actions settingsต้องอนุญาตให้GitHub Actionsสร้างPRได้ งานนี้กำหนดcontents:writeและpull-requests:writeให้สองworkflows แต่ไม่เปลี่ยนrepository settingsหรือbranch protection หากpolicyไม่อนุญาต runจะfailและต้องให้เจ้าของเปิดsetting ห้ามใช้credentialเก่าหรือข้ามกฎbranch
2. GITHUB_TOKENลงลายเซ็นbotได้ แต่ไม่triggerCIจากpush/pull_requestต่ออัตโนมัติ หลังbotอัปเดตครั้งล่าสุด ผู้ดูแลต้องใช้บัญชีGitHubปกติปิดแล้วเปิดPRอีกครั้ง เพื่อสร้างreopened eventจากคน การเปลี่ยนdraftเป็นreadyอย่างเดียวไม่พอ เพราะworkflowเดิมไม่ได้subscribe ready_for_review หากbotอัปเดตใหม่ต้องปิด/เปิดซ้ำสำหรับheadใหม่
3. ตรวจrequired checksทั้ง5ที่headของPRและreviewdiff ห้ามนับcheckที่ไม่รันว่าผ่าน เปลี่ยนเป็นreadyแล้วให้เจ้าของตัดสินใจmerge คง[skip changelog]ในข้อความmerge/squashของPRที่สร้างอัตโนมัติ
4. Changelog PRคนละรายการอาจconflictที่จุดแทรก หลังmergePRก่อนหน้าให้rerun workflowของsourceเดิม แล้วปิด/เปิดPRและreviewใหม่ checkout mainล่าสุดจะคงentryที่mergeไปแล้ว
5. Generator successหมายถึงสร้างข้อมูลและจัดการPRสำเร็จ ไม่ใช่mainหรือเว็บเปลี่ยนแล้ว Auto-Deploy SciSpace Siteเดิมอาจรันเมื่อgeneratorจบ แต่checkout mainจึงไม่deploybranchของbotที่ยังไม่merge ต้องmergePRข้อมูลก่อนจึงเผยแพร่JSONใหม่ และตรวจhostingจริงแยกกัน

## ทางเลือกและข้อจำกัด

GitHub App tokenทำให้CIเริ่มอัตโนมัติได้ แต่ต้องมีidentityและsecretที่อนุมัติแยก งานนี้ไม่เพิ่ม ส่วนการเขียนREST/GraphQL publisherเองจะซ้ำซ้อนกับbranch/diff/signature/retryที่actionมีอยู่ ใช้actionที่pinรุ่นเพื่อลดขอบเขตการแก้ แยกChangelog PRเพื่อรักษาทุกevent แม้จำนวนPRมากขึ้น

Patchนี้ไม่แก้เนื้อหาsite data, Slack settings, SciSpace hosting หรือbranch protection ส่วนsync-chapters.ymlเป็นworkflowreleaseแยกและอยู่นอกคำสั่งนี้ ต้องยืนยันpolicyสร้างPRและsignatureจากrunจริงหลังworkflowมีผล testsในเครื่องยืนยันการตั้งค่าจริงเหล่านั้นไม่ได้

## การตรวจสอบ

Baselineผ่าน23tests Testsใหม่เริ่มต้นfailจากไม่มีขั้นสร้างPR, แทรกchangelogซ้ำ และcache-onlyไม่เข้าCI Candidateที่แก้ผ่าน27documentation tests รวมรันPythonที่ฝังในworkflowจริงสองครั้ง รักษาentryอื่น และตรวจshell syntaxของdocs workflowsทั้ง9 ผลGitHub ActionsจริงจะบันทึกในPRหลังpush

ตรวจparent governance rootและnested product worktreeแยกกันและรักษาสภาพเดิม งานแก้อยู่ในworktreeเอกสารแยกบนbranch codex/docs-automation-pr ฐานจากsourceที่mergeแล้วในGitHub ผลtestsนี้ไม่รับรองความพร้อมruntimeผลิตภัณฑ์

อ้างอิง: [action v7.0.8](https://github.com/peter-evans/create-pull-request/tree/v7.0.8), [การtriggerworkflowsต่อ](https://github.com/peter-evans/create-pull-request/blob/v7.0.8/docs/concepts-guidelines.md#triggering-further-workflow-runs)

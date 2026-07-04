# Archived Specs

โฟลเดอร์นี้เก็บ spec ที่ถูกแทนที่ด้วยฉบับ canonical ที่ใหม่กว่า **เก็บไว้ไม่ลบ** ตามหลัก
non-destructive (ดู `.kiro/steering/architecture-decisions.md` → ADR-006 และ invariant ใน
`ubiquitous-language.md`) เพื่อคงร่องรอยการตัดสินใจไว้อ้างอิง/ตรวจสอบย้อนหลัง

| spec ที่ archive | ฉบับ canonical ที่ใช้แทน | เหตุผล | วันที่ archive |
|---|---|---|---|
| `obsidian-second-brain` | `daph-obsidian-second-brain` | draft รุ่นก่อน — config เก่าไม่มี `specId`; ฉบับใหม่ implement เสร็จแล้ว (Vault 224 ไฟล์, 55/55 tasks) | 2026-06-25 |
| `monolith-tcck-separation` | `separate-monolith-tcck` | **specId เดียวกัน** (`a522ecf0-cc45-489a-9289-ae2d1b7b4bac`) = spec สายเดียวกันที่ถูกแทนที่ในที่เดิม; ฉบับเก่าตั้งบน premise ที่ผิด (สมมติว่า MONOLITH/TCCK พันกัน) ฉบับใหม่พบว่าไม่เคยผูกกันจริง (canonical promoted = 0) จึงไม่ต้องมีกลไกแยกแบบหนัก | 2026-06-25 |

> คุณค่าเชิง audit: `monolith-tcck-separation` บันทึกว่าครั้งหนึ่งเคยเข้าใจว่าสองโปรเจกต์พันกัน
> ก่อนจะพบว่าไม่จริง — เป็นบริบทที่มีประโยชน์หากมีคำถามภายหลังว่าทำไมจึงไม่สร้างระบบแยกโปรเจกต์

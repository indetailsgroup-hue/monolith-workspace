# บันทึกหลักฐาน CI — 9ac7cff3

วันที่บันทึก: 2026-07-11  
สถานะ: **E0 CI PASS — scope-limited**  
Commit: `9ac7cff39d02d9430879275645e377728bc0abc5`  
อำนาจการจัดชั้นหลักฐาน: มติ Tech Lead ใน CT-DEC-001

> บันทึกนี้พิสูจน์เฉพาะขอบเขตที่ workflow รันจริง ไม่ใช่หลักฐาน deployment, operational readiness, production readiness หรือการปิด P0

## 1. Primary run บน main

| รายการ | ค่า |
| --- | --- |
| Workflow | `verify-full` |
| Run | `29142280872` — https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/29142280872 |
| Ref | `refs/heads/main` |
| Environment | `ubuntu-latest / node v22.23.1` |
| ผลทดสอบ | **4,553/4,553 ผ่าน**, 0 ล้มเหลว, 1,762 suites |
| ขั้นตอนที่ผ่าน | checkout, install, full typecheck, automated tests, build, evidence manifest, artifact upload |
| Artifact | ID `8245562223`; retention 90 วัน; หมดอายุ `2026-10-09T06:06:13Z` |
| Artifact ZIP SHA-256 | `6fb49466fee477b54f05c8e1d2470cacc6c83cba91e889700cc1cdde7f6886fd` |

ไฟล์ `verify-evidence.json` ข้างบันทึกนี้คือสำเนา payload ที่ workflow สร้างสำหรับ main run โดยตรง ส่วน `artifact.sha256` เก็บ digest ที่ GitHub รายงานสำหรับ archive ทั้ง main และ branch เพื่อให้ยังตรวจอ้างอิงได้หลัง artifact 90 วันหมดอายุ

## 2. Corroborating branch run

| รายการ | ค่า |
| --- | --- |
| Run | `29142279488` — https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/29142279488 |
| Ref | `refs/heads/fix/drillmap-bolt-and-brun-dowels` |
| Commit | SHA เต็มเดียวกับ main: `9ac7cff39d02d9430879275645e377728bc0abc5` |
| Artifact | ID `8245562538`; retention 90 วัน; หมดอายุ `2026-10-09T06:06:10Z` |
| Artifact ZIP SHA-256 | `d777e9a10c716665e8083ce1b5cd5c082ebcdc72afa843809d4501112c0efa78` |

## 3. Exclusion list ที่ต้องติดกับ claim นี้เสมอ

1. Invariant สองตัวใน `tools/vault-builder/src/pipeline.test.ts` return ก่อนตรวจบน CI เมื่อไม่มีข้อมูล development-only `_daph_extract`; หลักฐานของ invariant สองตัวนี้ยังเป็น local-only แม้ตัว runner จะนับ test case ว่าผ่าน
2. สายทดสอบ DB/psql (`AB-DB-01`) ไม่ได้อยู่ใน workflow นี้
3. E2E ไม่ได้อยู่ใน workflow นี้
4. E0 ชุดนี้ไม่พิสูจน์ deployment, operational readiness, production readiness, P0 closure หรือสิทธิ์ตัดชิ้นงานจริง

## 4. Provenance และความทนทาน

- `verify-evidence.json`: payload หลักฐานที่ผูก commit, environment, เวลา และผลทดสอบ
- `run-register.json`: register ที่เก็บ run/artifact IDs, URLs, digest, วันสร้างและวันหมดอายุ
- `artifact.sha256`: lowercase SHA-256 digest ของ artifact archives ตาม metadata ที่ GitHub รายงาน; ตัว ZIP ไม่ได้เก็บใน repo
- `evidence-record.sha256`: manifest ของไฟล์ durable record ชุดนี้ คิดจาก byte แบบ LF, UTF-8 และ lowercase hex
- Git commit ทำให้ record นี้ pinned/frozen และ tamper-evident แต่ commit ไม่ได้ sign จึงไม่เรียก immutable

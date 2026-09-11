# FieldFlow artifact — ภาคผนวกสถานะงาน

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee

วันที่ตรวจ: 11 กันยายน 2026 · TH

## ข้อสรุป
ชุดนี้มี source FieldFlow Mobile v0.1.0 บน Expo/React Native, schema, tests และเอกสาร Sprint 1–3 จริง แต่ยังเป็น implementation ที่ประกอบไม่ครบและมีข้อขัดแย้งในโค้ด จึงยังรับรอง build, test, staging หรือการปิด sprint ไม่ได้

โฟลเดอร์จริงใช้ชื่อ agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566 เป็นชื่อเดียว ไม่ใช่ path สามชั้นที่ส่งมา ชุดนี้อยู่นอก nested product repository; ไม่มีหลักฐานจากการตรวจนี้ว่า source ถูก merge เข้า GitHub main แล้ว

ตรวจ Git ทั้งสอง root ซ้ำ: parent aa1b30e509ece9d8efad3d68e949860aa79bdecf, nested 9c4bee6759f6d1919a320a2f56088ce683287f58; ทั้งคู่มี changes เดิมค้างและไม่ได้แก้ไข ผล CI ในรายงาน 10 ก.ย. เป็น snapshot เดิม ไม่ใช่การตรวจ GitHub สดวันที่ 11 ก.ย.

## งานที่มีแล้วและสิ่งที่เหลือ

| งาน | หลักฐาน source | สถานะที่สรุปได้ |
|---|---|---|
| T1 Database/Drizzle | schema 5 ตาราง, migration และ seed | มี source; ยังไม่ยืนยัน apply/RLS บน DB จริง |
| T2 Auth | Supabase client + SecureStore adapter + auth helpers | มี code; dependencies/types ยังไม่ครบ |
| T3 QR scan | app/(tabs)/scan.tsx, QR schema, debounce, jobs API | มี code; ยังไม่พบ offline queue และไม่มี device acceptance |
| T4 Photo | camera/gallery/compression/upload/record/delete | บางส่วน; contract คืนค่าขัดกันและ storage rules ไม่สอดคล้อง |
| T5 Email/password | app/login.tsx + lib/auth.ts | มี code/tests; ไม่มีผลรันสด |
| T6 Magic Link | signInWithOtp + fieldflow://login | ส่งลิงก์ได้ตาม source; callback/session completion ยังไม่พบ |
| T7 Countdown | login.tsx มี timer และ resend guard | มี code/tests; ไม่มีผลรันสด |
| T8 Forgot password | เปลี่ยนเป็น magic-link mode + Alert | มี code; ไม่ใช่ flow ตั้งรหัสผ่านใหม่ และพึ่ง T6 |
| T9–T10 Session/protected routes | app/_layout.tsx subscribe/getSession/redirect | มี code; ไม่ใช่หลักฐาน server-side authorization |
| T11 Job status | detail screen เรียก updateJobStatus เป็น completed | มีบาง flow; ยังไม่พิสูจน์ acceptance ทั้งสถานะ |
| T12 Filtering/search | รายการงานและ API มีแล้ว | ไม่พบ search/filter UI ในหน้า list ที่ตรวจ |
| CI / EAS / Sprint DoD | YAML, eas.json และเอกสาร | มี configuration/เกณฑ์; ยังไม่มี run/deployment/signoff evidence |

เกณฑ์อ้างอิง: docs/sprint1-dod.md (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/docs/sprint1-dod.md>), docs/sprint2-dod.md (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/docs/sprint2-dod.md>), docs/sprint3-dod.md (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/docs/sprint3-dod.md>). Sprint 2 retro ยังมีช่องคะแนน/ผล AC ว่าง จึงเป็น template ไม่ใช่หลักฐานว่าผ่านแล้ว

## ช่องว่างที่ยืนยันได้

1. **B1 — Photo contract ไม่ตรงกัน (VERIFIED FACT):** fieldflow-mobile/lib/supabase.ts (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/fieldflow-mobile/lib/supabase.ts:72>) ระบุ Promise<string> และคืน public URL แต่ fieldflow-mobile/lib/api/photos.ts (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/fieldflow-mobile/lib/api/photos.ts:53>) อ่าน uploadResult.path/publicUrl. ต้องทำ contract ให้ตรงกันและตรวจ upload → DB row → display/delete จริง
2. **B1 — Package ยังประกอบไม่ครบ (VERIFIED FACT):** ไม่พบ package-lock.json, tsconfig.json, types/supabase.ts และ local ESLint config ใน package. supabase.ts import types/supabase ที่ไม่มีอยู่; expo-secure-store และ expo-constants ถูก import แต่ไม่ประกาศตรงใน package.json. .github/workflows/ci.yml (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/.github/workflows/ci.yml>) ใช้ npm ci และ cache-dependency-path ไปยัง lockfile ที่ไม่มี
3. **B1 — Magic Link callback ขาดจาก source ที่ตรวจ (INFERENCE):** detectSessionInUrl=false ใน Supabase client; ไม่พบ auth.setSession/exchangeCodeForSession หรือ URL listener สำหรับ token callback. onAuthStateChange อย่างเดียวไม่แสดงขั้นตอนแปลง callback เป็น session. ต้องทดสอบเปิดจากอีเมลทั้ง cold/warm start
4. **B1 — Storage privacy/path contract ขัดกัน (VERIFIED FACT):** fieldflow-mobile/drizzle/migrations/0001_initial.sql (local artifact; not published)/agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566/fieldflow-mobile/drizzle/migrations/0001_initial.sql:182>) เป็น comment ให้ตั้ง public bucket และ upload แบบ authenticated-only ขณะที่ Sprint 1 ต้องการ own-org access. delete comment ใช้ path segment 3 แต่ uploader สร้าง jobId/timestamp.jpg เพียงสอง segment. ยังไม่อ้างว่าระบบ deployed รั่ว เพราะไม่ตรวจ deployment
5. **B1 — Storage/DB ไม่เป็น operation เดียวกัน (VERIFIED FACT):** addPhotoRecord อัปโหลดก่อนตรวจ user/insert row; failure หลัง upload ไม่มี cleanup. deletePhoto ลบ storage ก่อน DB; failure หลังลบไม่มี recovery. ต้องมี acceptance กรณี partial failure
6. **B2 — Offline และ test evidence ยังไม่ครบ (UNKNOWN/INFERENCE):** มี 5 test files แต่ไม่มี node_modules หรือผล CI ในชุดนี้; ไม่พบ offline queue ใน mobile source. รูปแบบ DoD และไฟล์ test ไม่ใช่ผล PASS

## สิ่งที่เปลี่ยนจากรายงาน MONOLITH ก่อนหน้า
เพิ่มอีกหนึ่งแถวสถานะ: **FieldFlow native mobile — มี source แยก บางส่วน ขาด build/integration evidence**. ห้ามนำ CI ของ packages/field-app ใน MONOLITH ไปอ้างว่า fieldflow-mobile ชุดนี้ผ่าน เพราะเป็นคนละ source/package

ชุดยังมี Barausse research, BOI deck, factory packet/shop drawing/quotation และ PRD/roadmap exports. สิ่งเหล่านี้ยืนยันว่ามี artifacts; การตรวจนี้ไม่ได้รับรอง technical/commercial claims ทุกไฟล์ หรือถือว่า PDF/ใบเสนอราคาคือการใช้งาน production จริง

## งานต่อที่เสนอ (PROPOSAL)
1. ทำ package ให้ reproducible: dependencies, lockfile, types และ configs
2. แก้ photo return contract และ storage org/path policy พร้อม partial-failure handling
3. ปิด magic-link callback, offline requirements และ T12 search/filter
4. รัน typecheck/lint/tests, DB RLS negatives และ device tests; บันทึกผลลง DoD ตามจริง
5. เทียบ schema/identity กับ MONOLITH ก่อนเสนอ integration PR; ไม่ apply migration นี้ลง production โดยอนุมานว่า jobs/users ตรงกัน

## ข้อจำกัด
เป็น static review ของ extracted source; ไม่ได้ติดตั้ง dependencies, รันแอป, apply migration, deploy หรือแก้ source. ไม่อ้างว่า tests ผ่านหรือ sprint ใดปิดครบแล้ว. รักษารายงานก่อนหน้าเป็น snapshot และเพิ่มภาคผนวกนี้แทนการเขียนประวัติทับ


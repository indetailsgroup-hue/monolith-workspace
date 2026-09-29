# FieldFlow artifact — ภาคผนวกสถานะงาน

หมายเหตุการเผยแพร่: เอกสารอ้างหลักฐานตามวันที่เดิม ไม่ใช่การตรวจ runtime หรือ CI ใหม่ ไฟล์หลักฐานเฉพาะในเครื่องไม่ได้รวมในการเผยแพร่นี้ SC-01–SC-18 เป็นรหัสสายงาน roadmap แยกจากรหัสมติ Steering Committee

วันที่ตรวจ: 11 กันยายน 2026 · TH

## ข้อสรุป
ชุดนี้มี source FieldFlow Mobile v0.1.0 บน Expo/React Native, schema, tests และเอกสาร Sprint 1–3 จริง โดย source มี contract ขัดกันและ imports ไม่ตรงกับ dependency declarations; การประกอบ package ให้ทำซ้ำได้ยังไม่ยืนยัน จึงยังรับรอง build, test, staging หรือการปิด sprint ไม่ได้

โฟลเดอร์จริงใช้ชื่อ agent-artifacts-zip_abcf131c-4325-49f4-af02-38af4d5555d6_1789040566 เป็นชื่อเดียว ไม่ใช่ path สามชั้นที่ส่งมา ชุดนี้อยู่นอก nested product repository; ไม่มีหลักฐานจากการตรวจนี้ว่า source ถูก merge เข้า GitHub main แล้ว

ตรวจ Git ทั้งสอง root ซ้ำ: parent aa1b30e509ece9d8efad3d68e949860aa79bdecf, nested 9c4bee6759f6d1919a320a2f56088ce683287f58; ทั้งคู่มี changes เดิมค้างและไม่ได้แก้ไข ผล CI ในรายงาน 10 ก.ย. เป็น snapshot เดิม ไม่ใช่การตรวจ GitHub สดวันที่ 11 ก.ย.

## งานที่มีแล้วและสิ่งที่เหลือ

| งาน | หลักฐาน source | สถานะที่สรุปได้ |
|---|---|---|
| T1 Database/Drizzle | schema 5 ตาราง, migration และ seed | มี source; ยังไม่ยืนยัน apply/RLS บน DB จริง |
| T2 Auth | Supabase client + SecureStore adapter + auth helpers | มี code; dependencies/types ยังไม่ครบ |
| T3 QR scan | app/(tabs)/scan.tsx, QR schema, debounce, jobs API | มี code; ยังไม่พบ offline queue และไม่มี device acceptance |
| T4 Photo | camera/gallery/compression/upload/record/delete | บางส่วน; contract คืนค่าขัดกันและ storage rules ไม่สอดคล้อง |
| T5 Email/password | app/login.tsx + lib/auth.ts | มี code/tests; การรันทดสอบอยู่นอกขอบเขต static review วันที่ 11 ก.ย. |
| T6 Magic Link | signInWithOtp + fieldflow://login | มีขั้นตอนส่งลิงก์ใน source ที่ตรวจ; callback/session completion ยังไม่ยืนยันจากการตรวจวันที่ 11 ก.ย. |
| T7 Countdown | login.tsx มี timer และ resend guard | มี code/tests; ไม่มีผลรันสด |
| T8 Forgot password | เปลี่ยนเป็น magic-link mode + Alert | มี code; ไม่ใช่ flow ตั้งรหัสผ่านใหม่ และพึ่ง T6 |
| T9–T10 Session/protected routes | app/_layout.tsx subscribe/getSession/redirect | มี code; ไม่ใช่หลักฐาน server-side authorization |
| T11 Job status | detail screen เรียก updateJobStatus เป็น completed | มีบาง flow; ยังไม่พิสูจน์ acceptance ทั้งสถานะ |
| T12 Filtering/search | รายการงานและ API มีแล้ว | ไม่พบ search/filter UI ในหน้า list ที่ตรวจ |
| CI / EAS / Sprint DoD | YAML, eas.json และเอกสาร | มี configuration/เกณฑ์; ยังไม่มี run/deployment/signoff evidence |

เกณฑ์อ้างอิง: `docs/sprint1-dod.md`, `docs/sprint2-dod.md` และ `docs/sprint3-dod.md` (artifacts ภายในชุดไฟล์; ไม่ได้เผยแพร่). Sprint 2 retro ยังมีช่องคะแนน/ผล AC ว่าง จึงเป็น template ไม่ใช่หลักฐานว่าผ่านแล้ว

## ข้อค้นพบจาก source และการยอมรับที่ยังไม่ยืนยัน

ข้อค้นพบต่อไปนี้อ้างถึงชุดไฟล์ที่แตกออกมาตรวจเมื่อ 11 กันยายน 2026 โดยแยกข้อสังเกตเกี่ยวกับ source contract ออกจากการยอมรับที่ยังไม่ยืนยัน จึงไม่ใช่ข้อสรุปว่าสิ่งใดขาดจากผลิตภัณฑ์ทั้งหมดหรือเป็นสถานะของ package revision ภายหลัง

1. **B1 — Photo contract ไม่ตรงกัน (VERIFIED FACT):** `fieldflow-mobile/lib/supabase.ts` ระบุ Promise<string> และคืน public URL แต่ `fieldflow-mobile/lib/api/photos.ts` อ่าน uploadResult.path/publicUrl (source ภายในชุดไฟล์; ไม่ได้เผยแพร่). ต้องทำ contract ให้ตรงกันและตรวจ upload → DB row → display/delete จริง
2. **B1 — การยอมรับ package assembly ยังรอผล (UNKNOWN; บันทึกข้อเท็จจริงจาก source):** Static review วันที่ 11 ก.ย. ยังไม่ยืนยัน buildability. ต้องตรวจ `package-lock.json`, `tsconfig.json`, `types/supabase.ts` และ local ESLint configuration ให้ตรงกับ package ที่ตรวจ ก่อนยอมรับการประกอบชุด. `fieldflow-mobile/lib/supabase.ts` import generated type `Database` พร้อม expo-secure-store และ expo-constants. `package.json` ที่ตรวจประกาศ เช่น expo ~51.0.0, @supabase/supabase-js ^2.43.0 และ expo-router ~3.5.0; เมื่อเทียบ dependency declarations ทั้งหมดกับ imports เหล่านั้น พบว่า expo-secure-store และ expo-constants เป็น direct imports ที่ต้องเพิ่ม declaration. ต้องแก้ manifest mismatch นี้และจัดเตรียม generated types. `.github/workflows/ci.yml` ของชุดนี้ใช้ npm ci และ lockfile caching จึงต้องพิสูจน์ reproducible installation ในเกณฑ์รับงานนี้
3. **B1 — การยอมรับ Magic Link callback ยังรอผล (INFERENCE):** Client ที่ตรวจตั้ง `detectSessionInUrl=false`; auth helper เรียก `signInWithOtp` ด้วย `fieldflow://login` และ session guard subscribe `onAuthStateChange`. ข้อสังเกตจาก source เหล่านี้ยืนยันขั้นตอนส่งและ subscription ส่วนการแปลง callback เป็น session ยังไม่ยืนยันจากการตรวจวันที่ 11 ก.ย. ต้อง trace token URL handler และเส้นทาง `auth.setSession` หรือ `exchangeCodeForSession` ที่ใช้จริง แล้วทดสอบเปิดจากอีเมลทั้ง cold/warm start
4. **B1 — Storage privacy/path contract ขัดกัน (VERIFIED FACT):** `fieldflow-mobile/drizzle/migrations/0001_initial.sql` (source ภายในชุดไฟล์; ไม่ได้เผยแพร่) เป็น comment ให้ตั้ง public bucket และ upload แบบ authenticated-only ขณะที่ Sprint 1 ต้องการ own-org access. delete comment ใช้ path segment 3 แต่ uploader สร้าง jobId/timestamp.jpg เพียงสอง segment. ยังไม่อ้างว่าระบบ deployed รั่ว เพราะไม่ตรวจ deployment
5. **B1 — เส้นทาง Storage/DB partial failure ต้องผ่านการยอมรับ (VERIFIED FACT / recovery ยังไม่ยืนยัน):** ใน `fieldflow-mobile/lib/api/photos.ts` ที่ตรวจ `addPhotoRecord` อัปโหลดก่อนตรวจ user/insert row; error branch ของ auth/insert ภายหลังเขียน log แล้วคืน null. `deletePhoto` ลบ storage ก่อน DB; DB-error branch เขียน log แล้วคืน false. Operations ที่แยกกันเหล่านี้อาจทำให้คงเหลือ partial state. ต้องทดสอบ cleanup, recovery และ retry ของแต่ละจุด failure ก่อนรับงาน
6. **B2 — การยอมรับ Offline และ tests ยังรอผล (UNKNOWN/INFERENCE):** Inventory วันที่ 11 ก.ย. บันทึก test files 5 ไฟล์. การติดตั้ง dependencies ลง `node_modules`, การรัน tests และ CI อยู่นอกขอบเขต static review นี้; ผล build/test จึงยังไม่ยืนยัน. การยอมรับ mobile offline queue, replay และ conflict recovery ยังไม่ยืนยันเช่นกัน. รูปแบบ DoD และไฟล์ test ไม่ใช่ผล PASS

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


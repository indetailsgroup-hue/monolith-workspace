# Requirements Document

## Introduction

เอกสารนี้กำหนด requirements สำหรับ **Design Hub Platform — Phase 2** ซึ่งเป็นชั้นสาธารณะ (public, multi-sided marketplace + learning center + community) ที่วางทับบน substrate ที่ส่งมอบแล้วใน Phase 1 ของระบบ Monolith (DAPH Decor)

**บริบทธุรกิจ (ground truth):** Design Hub (โดเมน `designhub.asia`) เป็นแพลตฟอร์มหลายแบรนด์/หลายฝ่าย (multi-sided) ด้านออกแบบตกแต่งภายในและผลิตเฟอร์นิเจอร์ ดำเนินการโดยบริษัท DAPH Decorative Co., Ltd. ตามคำยืนยันของเจ้าของ: **"DAPH เป็นเพียงหนึ่งใน หลายแบรนด์ ของ Monolith = Design Hub"** ความสัมพันธ์นี้แมปลงบนโมเดลข้อมูลของ Module A1 (enterprise-structure-topology) ที่ส่งมอบแล้วโดยตรง คือ Company → Brand (หลายแบรนด์) → Location (site_code) โดย:
- **Design Hub Platform = ระดับ Company**
- **DAPH = Brand หลัก (anchor brand)**
- **นักออกแบบ/ผู้รับเหมาพันธมิตรที่ "เติบโต" ไปมีแบรนด์ของตนเอง = Brand row เพิ่มเติม**

**Roadmap ธุรกิจ (จาก Biz Model deck):** Phase 1 Website → **Phase 2 Market Place** → Phase 3 Project Pipeline เอกสารนี้คือ Phase 2

**Substrate ที่ส่งมอบแล้ว (Phase 1) ที่ spec นี้ต้องนำกลับมาใช้ (reuse-not-fork):**
- **A1 (enterprise-structure-topology):** โครงสร้าง Company/Brand/Location/site_code + RLS
- **C12 (security-access-federation):** governed roles {admin, operations, finance, executive_owner} + Branch roles {branch_manager, branch_operator} → projection เป็น JWT `app_metadata` + append-only audit
- **Gate/Evidence model + append-only audit**
- **C12 helper functions:** `public.current_app_roles()`, `public.has_any_app_role(text[])`, `public.has_site_access(text)`, `public.is_governance_role()`, `public.resolve_actor()`, `public.get_active_site_codes()`

**Invariant (ADR-002, ADR-016):** Reuse-not-fork เป็นข้อบังคับเด็ดขาด — โมดูลใหม่ใน Phase 2 ต้อง build บน C12 helper เดิม **ห้าม** นิยาม auth model ใหม่หรือ fork ของเดิม Phase 2 เพียง **ขยาย (extend)** ด้วย role class ใหม่สำหรับ external actor (ผู้ใช้สาธารณะ/มืออาชีพ) โดยไม่แก้ไขโมเดล governance/branch เดิม

**ขอบเขตการเชื่อมต่อกับ CAM kernel (Q-D decided):** เครื่องยนต์ parametric/CAM/geometry เป็น **runtime แยก** จาก Design Hub Phase 2 เชื่อมด้วยสัญญา **Gate / Released_Spec** เท่านั้น — **ไม่ merge รวมกัน** ตามผลตรวจสอบโค้ดจริง (audit) เครื่องยนต์นี้ประกอบด้วย **2 ชั้นที่ต้องแยกให้ชัด**:
- **(ปัจจุบัน) CAM/Manufacturing Engine (TS):** เครื่องยนต์ที่ build แล้วใน workspace `iimos-workspace` (TypeScript) — เป็นเจ้าของ SpecState DRAFT→FROZEN→RELEASED, "Gate is absolute — ห้าม export เมื่อ DRAFT", OperationGraph, nesting (grain-aware), DXF R12, G-code (Biesse/Homag/KDT), Factory Packet, carcass 18mm; เป็น runtime ที่ **emit Released_Spec จริงในปัจจุบัน** (geometry คำนวณด้วย three-bvh-csg ในเบราว์เซอร์ + TS opgraph)
- **(อนาคต) Kernel Truth Service (kernel-pyocc, SPEC-08 v8.2 "Plasticity-DNA Design Engine"):** บริการ B-rep solid kernel (Python + OpenCascade, FastAPI `/kernel/v1/{health,op,batch}`) ที่ออกแบบให้เป็น "source of geometric truth" ระดับลึก — **ยังไม่ wired เข้า pipeline** (ปัจจุบันมีเพียง client stub + CI workflow + SPEC-08 docs; ดู A-5)

Design Hub Phase 2 เชื่อมกับ **CAM/Manufacturing Engine (TS)** ผ่าน Released_Spec/Gate เท่านั้น และ **ไม่เรียก Kernel Truth Service โดยตรง**

> ⚠️ ดูส่วน **Assumptions and Open Questions** ท้ายเอกสารสำหรับสมมติฐานสำคัญที่ยังรอการยืนยันจากเจ้าของ (Monolith = Design Hub = TCCK interpretation และการ flip `get_active_site_codes()`)

## Glossary

- **Design_Hub_Platform**: แพลตฟอร์มสาธารณะระดับ Company (โดเมน `designhub.asia`) ที่รวม Marketplace, Learning Center และชุมชนหลายฝ่าย — เป็นระบบหลักที่ requirements ทั้งหมดอ้างถึง
- **Brand**: แบรนด์ที่ดำเนินการภายใต้ Company (A1 entity) — DAPH เป็น anchor brand; พันธมิตรที่เติบโตเป็น Brand row เพิ่มเติม; ใช้เป็นขอบเขต data isolation (realm) ผ่าน site_code
- **General_User**: ผู้ใช้ทั่วไป (ผู้บริโภค/เจ้าของบ้าน) ที่ลงทะเบียนเข้าใช้ Design_Hub_Platform โดยมีสิทธิ์เข้าถึงข้อมูลแบบจำกัด
- **Professional_Profile**: โปรไฟล์สายอาชีพ (บริษัทออกแบบ, ผู้รับเหมา, นักออกแบบ, ผู้ขาย/Vendor) ที่ผ่านการยืนยันตัวตนผู้มีอำนาจ และผูกกับ A1 Location หนึ่งแห่งแบบ 1:1
- **Vendor_Seller**: Professional_Profile ประเภทผู้ขายสินค้าในตลาด รับผิดชอบสินค้าและการชดใช้ค่าเสียหาย (indemnification) ของสินค้าตนเอง
- **External_Actor_Role**: role class ใหม่ของ Phase 2 สำหรับผู้ใช้ภายนอก (general_user, professional_owner, professional_member) — **ขยายจาก** C12 ไม่แทนที่ governance/branch roles เดิม
- **Bible_Code**: รหัสสินค้า parametric ตามไวยากรณ์กำหนด (deterministic code grammar) ที่เข้ารหัสมิติของตู้/เฟอร์นิเจอร์ เป็นทั้ง product master ที่ขายได้และ seed สำหรับโมเดล parametric ใน **CAM/Manufacturing Engine (TS)**
- **Product_Catalog**: แคตตาล็อกสินค้าของ Design_Hub_Platform ครอบคลุม 6 หมวด (Built In, Furniture, Prop, Curtain, Wallpaper, Appliances) รวมถึง Bible_Code master
- **Key_Plan**: แปลนงานออกแบบที่นักออกแบบเลือก Bible_Code ใส่ลงไปต่อ Function ตาม workflow Interior (เป็นสัญญา/seed ระหว่างฝ่ายออกแบบกับฝ่ายผลิต)
- **Idea_Book**: สมุดภาพรวมรวมรูป/แนวคิด/สินค้าที่ General_User หรือ Professional_Profile สร้างและจัดเก็บ (UGC)
- **Your_Content**: เนื้อหาที่ผู้ใช้นำเข้าระบบ (รูปภาพ, Idea_Book, ความคิดเห็น, รีวิว) — เปิดเผยสาธารณะโดยค่าเริ่มต้น กรรมสิทธิ์ยังเป็นของผู้ใช้
- **Our_Content**: สินทรัพย์ทางปัญญาของแพลตฟอร์ม (Design Hub marks, logo, buttons, badges, widgets) — เป็น IP ของ Design_Hub_Platform
- **Trade_Program**: โปรแกรมพิเศษสำหรับ Professional_Profile ที่ได้รับการคัดเลือก ให้สิทธิประโยชน์เพิ่มยอดขาย
- **Released_Spec**: spec งานผลิตที่ผ่าน Gate (SpecState = RELEASED) จาก **CAM/Manufacturing Engine (TS)** ซึ่งเป็นเงื่อนไขเดียวที่อนุญาตให้ส่งงานผลิต Built-In เข้า CAM kernel
- **Gate**: จุดตรวจเด็ดขาดใน **CAM/Manufacturing Engine (TS)** ที่ห้าม export/ส่งผลิตเมื่อ SpecState = DRAFT หรือ gate.ok ≠ true
- **CAM_Manufacturing_Engine (TS)**: เครื่องยนต์ออกแบบ-สู่-โรงงานที่ build แล้วใน workspace `iimos-workspace` (TypeScript) — เป็นเจ้าของ SpecState/Gate/Released_Spec, OperationGraph, nesting, DXF R12, G-code, Factory Packet; เป็น runtime แยกที่ Design Hub Phase 2 เชื่อมผ่าน Released_Spec contract เท่านั้น (แทนคำเดิม "north-star-foundation" สำหรับชั้นที่ emit Released_Spec จริง)
- **Kernel_Truth_Service (kernel-pyocc)**: บริการ B-rep solid kernel ตาม SPEC-08 v8.2 (Python + OpenCascade, FastAPI `/kernel/v1/*`) ที่ออกแบบให้เป็น geometry-truth ระดับลึกเบื้องหลัง CAM_Manufacturing_Engine — **อนาคต ยังไม่ wired** และโค้ดยัง untracked/unbuilt ใน repo (ดู A-5); Design Hub Phase 2 ไม่เรียกโดยตรง
- **Learning_Center**: ศูนย์เรียนรู้ของ Design_Hub_Platform ครอบคลุม Mentoring_System, Workshop, หลักสูตร 3D, ชุมชนแบ่งปันความรู้, การประกวดออกแบบ, เครือข่ายต่างประเทศ และพื้นที่ co-working จริง
- **Mentoring_System**: ระบบจับคู่ Mentor (ผู้ชำนาญ) กับ Mentee (ผู้มาใหม่) เพื่อถ่ายทอดความรู้
- **Site_Designer_Service**: บริการออกแบบบนแพลตฟอร์มที่อยู่ภายใต้ข้อกำหนดแยก (Site Designer Terms of Use) พร้อมโมเดลแบ่งรายได้
- **Revenue_Share_Policy**: นโยบายแบ่งรายได้ — นักออกแบบได้ 50% ของค่าออกแบบเมื่อออกแบบใหม่ตั้งแต่ต้น (design from scratch), และ 2% ของมูลค่าการผลิตเมื่อลูกค้าใช้บริการผลิตของแพลตฟอร์มบนแบบที่แชร์ไว้ (design sharing)
- **Takedown_Request**: คำร้องเรียนการละเมิดลิขสิทธิ์/เครื่องหมายการค้า (Copyright or Trademark Infringement Claim) ที่นำเข้าสู่ขั้นตอน moderation ผ่าน Gate/Evidence
- **Professional_Rating_Review**: ระบบให้คะแนนและรีวิว Professional_Profile โดยผู้ใช้
- **Acceptable_Use_Policy**: นโยบายการใช้งานที่ยอมรับได้ที่ผู้ใช้ทุกคนต้องปฏิบัติตาม
- **Prohibited_Products_Policy**: นโยบายสินค้าต้องห้ามที่ Vendor_Seller ต้องปฏิบัติตามก่อนลงขาย
- **PDPA_Data_Governance**: การกำกับดูแลข้อมูลส่วนบุคคลระดับ PDPA (เก็บ/ใช้/แบ่งปัน, cookies opt-out, เด็กอายุต่ำกว่า 13, retention, การเข้าถึง/แก้ไข, การระงับข้อพิพาททางเลือก)
- **Audit_Log**: append-only audit ที่ส่งมอบแล้วใน Phase 1 ที่ Phase 2 นำมาใช้บันทึกทุกการเปลี่ยนแปลงที่อ่อนไหว
- **C12 helpers**: ฟังก์ชัน auth ที่ส่งมอบแล้ว — `current_app_roles()`, `has_any_app_role()`, `has_site_access()`, `is_governance_role()`, `resolve_actor()`, `get_active_site_codes()`

## Requirements

### Requirement 1: Account Registration and Identity

**User Story:** As a consumer or professional, I want to register an account on Design Hub using email or social login, so that I can access the platform's content, marketplace, and learning center.

#### Acceptance Criteria

1. WHEN a person submits a registration form with a declared age of 13 years or older, a valid email, and a password, THE Design_Hub_Platform SHALL create a General_User account with a generated UUID, account_status set to active, and created_at timestamp
2. IF a person submits a registration with a declared age below 13 years, THEN THE Design_Hub_Platform SHALL reject the registration and return an error indicating the minimum age is 13 years
3. WHERE a person chooses OAuth registration, THE Design_Hub_Platform SHALL support account creation through Facebook and Google identity providers
4. THE Design_Hub_Platform SHALL enforce uniqueness of email across all accounts — IF a duplicate email is submitted, THEN THE Design_Hub_Platform SHALL reject the registration and return an error indicating the email is already registered
5. WHEN a person completes registration, THE Design_Hub_Platform SHALL require explicit acceptance of the Terms of Use and the Privacy Policy before activating the account
6. IF a person submits registration without accepting the Terms of Use and Privacy Policy, THEN THE Design_Hub_Platform SHALL reject the registration and return an error indicating acceptance is required
7. THE Design_Hub_Platform SHALL store each account's identity by reference to `auth.users.id` so that External_Actor_Role grants are projected through the existing C12 App_Metadata_Projection

### Requirement 2: Account Profile, Settings, and Termination

**User Story:** As a registered user, I want to manage and disable my account, so that I retain control over my participation and personal data.

#### Acceptance Criteria

1. WHEN a registered user updates account profile fields (display_name, contact information, communication preferences), THE Design_Hub_Platform SHALL validate and persist the changes and record an Audit_Log entry with performed_by resolved via `public.resolve_actor()`
2. WHEN a registered user requests a temporary account disable from Account Settings, THE Design_Hub_Platform SHALL set account_status to disabled_temporary and SHALL exclude the account's Your_Content from public listings while retaining the records
3. WHEN a registered user requests a permanent account disable from Account Settings, THE Design_Hub_Platform SHALL set account_status to disabled_permanent and SHALL exclude the account's Your_Content from public listings
4. WHEN an account is disabled (temporary or permanent), THE Design_Hub_Platform SHALL retain comments authored by that account before the disable action in their existing public locations
5. WHEN an account is disabled, THE Design_Hub_Platform SHALL revoke all External_Actor_Role grants for that account through the existing C12 grant mechanism and recompute the App_Metadata_Projection
6. WHILE an account has account_status of disabled_temporary, THE Design_Hub_Platform SHALL allow the account owner to reactivate the account and restore public visibility of retained Your_Content

### Requirement 3: Professional Profile Creation and Verification

**User Story:** As a design firm, contractor, designer, or vendor, I want to create a verified Professional Profile tied to my location, so that I can be discovered, list products, and contact other professionals.

#### Acceptance Criteria

1. WHEN a registered user applies to create a Professional_Profile, THE Design_Hub_Platform SHALL require profile_type (one of: design_firm, contractor, designer, vendor_seller), authorized-person verification confirming the applicant owns the works/products or holds permission from the producer or owner, and a reference Location identifier from A1
2. THE Design_Hub_Platform SHALL allow at most one active Professional_Profile per reference A1 Location — IF a Professional_Profile already exists for the supplied Location, THEN THE Design_Hub_Platform SHALL reject the creation and return an error indicating one professional profile is permitted per location
3. WHERE the profile_type corresponds to a licensed trade, THE Design_Hub_Platform SHALL require License information including license_number and license_expiry_date, and SHALL reject the profile WHERE the supplied license_expiry_date is earlier than the current date
4. WHEN a Professional_Profile is created, THE Design_Hub_Platform SHALL require the applicant to select a business category that matches the actual business type
5. THE Design_Hub_Platform SHALL allow a Professional_Profile to record Projects (portfolio entries) that the profile owner attests are the profile owner's own work
6. THE Design_Hub_Platform SHALL allow a Professional_Profile to record Affiliations that map to A1 Brand and Company relationships, and SHALL allow the profile owner to update Affiliations when relationships change
7. WHEN a Professional_Profile owner submits profile information, THE Design_Hub_Platform SHALL require the information to be accurate and SHALL allow the owner to keep the information up to date
8. THE Design_Hub_Platform SHALL NOT guarantee any ranking or placement position for a Professional_Profile in listings, except WHERE a marketing promotion arrangement with Design_Hub_Platform is in effect

### Requirement 4: External Actor Role Class (C12 Extension)

**User Story:** As a platform architect, I want public and professional users to be authorized through a new external-actor role class that extends C12, so that the existing governance and branch security model is reused, not modified.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL define an External_Actor_Role class with role keys (general_user, professional_owner, professional_member) that are distinct from and additive to the existing C12 governance roles (admin, operations, finance, executive_owner) and branch roles (branch_manager, branch_operator)
2. THE Design_Hub_Platform SHALL grant and revoke External_Actor_Role through the existing C12 Access_Grant mechanism and SHALL project them into JWT `app_metadata.roles` via the existing App_Metadata_Projection
3. THE Design_Hub_Platform SHALL NOT redefine, fork, or modify the existing C12 helper functions `public.current_app_roles()`, `public.has_any_app_role()`, `public.has_site_access()`, `public.is_governance_role()`, `public.resolve_actor()`, and `public.get_active_site_codes()`
4. WHEN a Professional_Profile is approved, THE Design_Hub_Platform SHALL grant the professional_owner role scoped to the Brand realm derived from the profile's reference A1 Location
5. WHERE an External_Actor_Role user holds professional_owner, THE Design_Hub_Platform SHALL allow that user to access Vendor, Seller, Advertiser, and Site_Designer information that a General_User is restricted from accessing
6. WHILE a user holds only general_user without any professional or governance role, THE Design_Hub_Platform SHALL restrict access to professional-only information and SHALL allow public content access only

### Requirement 5: Marketplace Product Listings

**User Story:** As a vendor or seller, I want to list products across the supported categories, so that consumers can browse and purchase decoration goods.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL support Product_Catalog listings in exactly six categories: Built_In, Furniture, Prop, Curtain, Wallpaper, and Appliances
2. WHEN a Vendor_Seller creates a product listing, THE Design_Hub_Platform SHALL require category (one of the six supported categories), title (1–200 characters), price, and at least one product image, and SHALL record listing_owner resolved via `public.resolve_actor()`
3. WHERE the listing category is Built_In, THE Design_Hub_Platform SHALL support pricing that varies by size and function rather than a single fixed price
4. WHEN a Vendor_Seller submits a product listing, THE Design_Hub_Platform SHALL validate the listing against the Prohibited_Products_Policy before publishing
5. IF a product listing violates the Prohibited_Products_Policy, THEN THE Design_Hub_Platform SHALL reject the listing and return an error identifying the violated policy clause
6. WHEN a consumer queries the Product_Catalog, THE Design_Hub_Platform SHALL support filtering by category, price range, Brand, and text search on title with offset-based pagination (default page_size 20, maximum 100) and SHALL include total_count in the response

### Requirement 6: Purchase of Goods and Seller Indemnification

**User Story:** As a consumer, I want to purchase goods through the platform with clear seller responsibility, so that I know who is accountable for the products I buy.

#### Acceptance Criteria

1. WHEN a consumer places an order for one or more product listings, THE Design_Hub_Platform SHALL create an order record with a generated UUID, buyer identity via `public.resolve_actor()`, ordered line items, total amount, and order_status set to placed
2. THE Design_Hub_Platform SHALL record, for every order line item, the Vendor_Seller responsible for the listed goods as the party liable for buyer claims and indemnification for that line item
3. WHEN a buyer raises a claim against a purchased line item, THE Design_Hub_Platform SHALL route the claim to the responsible Vendor_Seller for indemnification or explanation, and SHALL record the claim and its routing in the Audit_Log
4. THE Design_Hub_Platform SHALL present to the buyer, before order confirmation, that the Vendor_Seller (not Design_Hub_Platform) is responsible for the goods and any related claims, consistent with the No Endorsement or Verification policy
5. WHERE a buyer purchases the Site_Designer_Service, THE Design_Hub_Platform SHALL apply the separate Site_Designer_Service terms to that line item rather than the standard goods terms

### Requirement 7: Revenue and Profit Sharing

**User Story:** As a designer or contractor, I want my revenue share computed according to the platform's profit-sharing model, so that I am compensated fairly for designs and production.

#### Acceptance Criteria

1. WHEN a client uses Design_Hub_Platform production service on a design that a designer shared on the website (design sharing), THE Design_Hub_Platform SHALL compute a designer revenue share equal to 2 percent of the production value for that project
2. WHEN a client engages a designer to design their space from scratch (design from scratch), THE Design_Hub_Platform SHALL compute a designer revenue share equal to 50 percent of the design fee for that project
3. WHERE adjustment or customization of a shared design is required, THE Design_Hub_Platform SHALL record that the platform performs requirement conclusion while the designer performs the design work, and SHALL apply the design-sharing share model to the project
4. WHEN a revenue share is computed for a project, THE Design_Hub_Platform SHALL record the share basis (design_sharing or design_from_scratch), the computed amount, the beneficiary Professional_Profile, and an Audit_Log entry
5. IF the share basis cannot be determined for a project, THEN THE Design_Hub_Platform SHALL withhold automatic share computation and flag the project for human review rather than computing a default share

### Requirement 8: The Bible Product and Component Catalog

**User Story:** As a designer, I want a canonical parametric cabinet catalog with a deterministic code grammar, so that I can specify furniture precisely as both a sellable product and a manufacturing seed.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL maintain a Bible_Code master where each entry encodes a furniture type, width, depth, height, and options according to a deterministic code grammar
2. THE Design_Hub_Platform SHALL parse a Counter Bible_Code using the grammar prefix `DKC` followed by width, depth, height, and option tokens, where option tokens are S (Shelve), D (Drawer ALTO), M (Microwave), L (L-shape open left), and R (L-shape open right)
3. THE Design_Hub_Platform SHALL parse a Cabinet Bible_Code using the grammar prefix `DC` followed by width, depth, height, and a shelve-count option token
4. THE Design_Hub_Platform SHALL parse a Wardrobe Bible_Code using the grammar prefix `DWD` followed by width, depth, and height
5. THE Design_Hub_Platform SHALL accept width values in 50 mm steps from 300 mm to 1200 mm inclusive — IF a Bible_Code encodes a width outside the range 300–1200 mm or not aligned to a 50 mm step, THEN THE Design_Hub_Platform SHALL reject the code and return a grammar validation error
6. THE Design_Hub_Platform SHALL provide a Bible_Code formatter that renders a parsed cabinet specification back into a Bible_Code string
7. FOR ALL valid Bible_Code strings, THE Design_Hub_Platform SHALL guarantee that parsing a code then formatting the parsed specification then parsing the result produces an equivalent specification (round-trip property)
8. IF a submitted Bible_Code does not conform to the grammar for its declared furniture type, THEN THE Design_Hub_Platform SHALL reject the code and return a descriptive grammar error identifying the invalid token
9. THE Design_Hub_Platform SHALL expose each Bible_Code entry both as a sellable Product_Catalog item in the Built_In category and as a manufacturing seed usable by Key_Plan and the Released_Spec contract

### Requirement 9: Key Plan and Design-to-Manufacturing Handoff

**User Story:** As a designer, I want to select Bible codes into a Key Plan and hand off only released specs to manufacturing, so that production receives a gated, validated design.

#### Acceptance Criteria

1. WHEN a designer adds a Bible_Code to a Key_Plan against a Function, THE Design_Hub_Platform SHALL validate the Bible_Code against the grammar in Requirement 8 before recording the Key_Plan line item
2. THE Design_Hub_Platform SHALL associate each Key_Plan with a project and the authoring Professional_Profile, and SHALL record created_at and an Audit_Log entry on each Key_Plan change
3. WHEN a Built_In production order is initiated from a Key_Plan, THE Design_Hub_Platform SHALL hand off to the CAM/Manufacturing Engine (TS) only through a Released_Spec whose Gate state is RELEASED
4. IF a production handoff is attempted while the associated spec Gate state is DRAFT or gate.ok is not true, THEN THE Design_Hub_Platform SHALL reject the handoff and return an error indicating production requires a released spec
5. THE Design_Hub_Platform SHALL treat the CAM/Manufacturing Engine (TS) as a separate runtime connected only by the Released_Spec contract and SHALL NOT execute parametric or geometry computation within Design_Hub_Platform, and SHALL NOT call the Kernel_Truth_Service (kernel-pyocc, SPEC-08) directly because that B-rep geometry-truth layer sits behind the CAM/Manufacturing Engine and is not yet wired (see Assumption A-5)
6. WHEN a Released_Spec is consumed for a production order, THE Design_Hub_Platform SHALL record the released spec identifier and Gate confirmation in the order record and the Audit_Log

### Requirement 10: User Content and Idea Books

**User Story:** As a user, I want to publish photos, idea books, comments, and reviews that I retain ownership of, so that I can share inspiration while controlling my own content.

#### Acceptance Criteria

1. WHEN a user publishes Your_Content (photos, Idea_Book, comments, or reviews), THE Design_Hub_Platform SHALL set the content visibility to public by default and SHALL record the content owner via `public.resolve_actor()`
2. THE Design_Hub_Platform SHALL retain content ownership with the publishing user and SHALL act only as the custodian that stores Your_Content
3. WHEN a user publishes a photo, design, or product image as Your_Content, THE Design_Hub_Platform SHALL require the user to attest that the user owns the work or holds a license or permission from the owner
4. THE Design_Hub_Platform SHALL allow the content owner to edit, update, or remove their own Your_Content at any time
5. WHERE Design_Hub_Platform determines a Your_Content item is non-compliant, THE Design_Hub_Platform SHALL allow Design_Hub_Platform to edit or reject the item and SHALL record the action in the Audit_Log
6. THE Design_Hub_Platform SHALL allow a user to organize Your_Content into one or more Idea_Book collections

### Requirement 11: Platform Intellectual Property and Acceptable Use

**User Story:** As the platform operator, I want platform IP protected and an acceptable use policy enforced, so that the brand and the community are safeguarded.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL classify Design Hub marks, logo, buttons, badges, and widgets as Our_Content owned by Design_Hub_Platform, excluding Your_Content
2. THE Design_Hub_Platform SHALL grant each user a limited license to access platform content under the Terms of Use, and SHALL allow Design_Hub_Platform to revoke that license for cause
3. WHEN a user accepts the Terms of Use, THE Design_Hub_Platform SHALL bind the user to the Acceptable_Use_Policy
4. IF Design_Hub_Platform detects a use that violates the Acceptable_Use_Policy (including data mining, robots, scraping tools, harassment, or harm to platform reputation), THEN THE Design_Hub_Platform SHALL restrict the offending access and record an Audit_Log entry
5. THE Design_Hub_Platform SHALL provide a Feedback channel for users to submit suggestions

### Requirement 12: Copyright and Trademark Takedown

**User Story:** As a rights holder, I want a claim process to report infringement and request removal, so that my intellectual property is protected on the platform.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL provide a Takedown_Request form for reporting copyright or trademark infringement
2. WHEN a Takedown_Request is submitted, THE Design_Hub_Platform SHALL create a moderation case recorded through the existing Gate and Evidence model with claimant identity, the referenced content, and the asserted right
3. WHEN a moderation decision is made on a Takedown_Request, THE Design_Hub_Platform SHALL record the decision, the deciding actor via `public.resolve_actor()`, and the rationale in the append-only Audit_Log
4. WHERE a moderation decision is to remove content, THE Design_Hub_Platform SHALL set the referenced content visibility to removed and SHALL retain the original record without deletion
5. WHEN Design_Hub_Platform becomes aware of infringing third-party content, THE Design_Hub_Platform SHALL be able to remove that content and record the removal in the Audit_Log
6. THE Design_Hub_Platform SHALL process other-violation reports under applicable law and platform policy rather than on personal-opinion grounds alone

### Requirement 13: Professional Rating and Review

**User Story:** As a consumer, I want to rate and review professionals, so that the community can assess provider quality.

#### Acceptance Criteria

1. WHEN a user submits a Professional_Rating_Review for a Professional_Profile, THE Design_Hub_Platform SHALL record a numeric rating, optional text, the reviewer identity via `public.resolve_actor()`, and a created_at timestamp
2. THE Design_Hub_Platform SHALL treat a Professional_Rating_Review as Your_Content owned by the reviewer that is public by default
3. THE Design_Hub_Platform SHALL compute and display an aggregate rating per Professional_Profile derived from that profile's active reviews
4. IF a Professional_Rating_Review violates the Acceptable_Use_Policy, THEN THE Design_Hub_Platform SHALL allow moderation of the review through the Gate and Evidence model and SHALL record the action in the Audit_Log

### Requirement 14: Personal Data Collection, Use, and Sharing (PDPA-grade)

**User Story:** As a user, I want my personal data collected, used, and shared transparently and lawfully, so that my privacy is respected.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL collect personal data through three channels: directly from the user, from third parties, and automatically from site activity, and SHALL record the collection category for each data element
2. THE Design_Hub_Platform SHALL restrict the use of collected personal data to the documented purposes (improving platform functions, personalizing experience, completing transactions, quality control, security protection, advertising relevance, and lawful promotions)
3. THE Design_Hub_Platform SHALL share personal data only within the documented sharing categories: agents/contractors/service providers, analytics and usage partners, third-party advertising networks, affiliated entities, business transfers, other users for publicly shared content, and lawful investigations
4. THE Design_Hub_Platform SHALL NOT sell a user's address or contact details to third parties for marketing purposes
5. WHEN a user adjusts tracking preferences, THE Design_Hub_Platform SHALL allow the user to opt out of cookies and tracking technologies through browser-level settings and account preferences
6. WHEN a user requests access to or correction of their personal data, THE Design_Hub_Platform SHALL allow the user to view and correct the personal information they provided at registration
7. THE Design_Hub_Platform SHALL retain a user's data according to the documented data retention policy, and WHEN an account is disabled, THE Design_Hub_Platform SHALL remove the account's data from public view except for comments authored before the disable action
8. IF a person under 13 years of age is detected to have registered directly, THEN THE Design_Hub_Platform SHALL remove that registration data
9. WHERE a dispute arises that qualifies for alternative dispute resolution, THE Design_Hub_Platform SHALL offer arbitration as a dispute resolution channel under the applicable policy

### Requirement 15: Learning Center — Mentoring, Workshops, and Curriculum

**User Story:** As a designer or partner, I want mentoring, workshops, and a 3D curriculum, so that I can develop professional skills and grow toward my own brand.

#### Acceptance Criteria

1. WHEN a Mentor and a Mentee are paired in the Mentoring_System, THE Design_Hub_Platform SHALL record the pairing with both identities, a start date, and status, and SHALL record an Audit_Log entry
2. THE Design_Hub_Platform SHALL support Workshop offerings of two kinds: skill-development workshops and life-development workshops
3. WHEN a user enrolls in a Workshop or a 3D training curriculum module, THE Design_Hub_Platform SHALL record the enrollment with the user identity, the offering identifier, and an enrollment timestamp
4. THE Design_Hub_Platform SHALL provide a 3D training curriculum that can be completed by learners without prior 3D background
5. THE Design_Hub_Platform SHALL provide knowledge-sharing communities and an international network channel for learners and professionals
6. WHERE the Learning_Center content overlaps the existing Knowledge context (`daph-obsidian-second-brain`), THE Design_Hub_Platform SHALL reference the Knowledge context as the source rather than duplicating knowledge content

### Requirement 16: Learning Center — Design Competitions and Co-Working Space

**User Story:** As a member, I want design competitions and a physical co-working learning space, so that I can showcase work and collaborate in person.

#### Acceptance Criteria

1. WHEN a design competition is created, THE Design_Hub_Platform SHALL record the competition with a title, submission_period_start, submission_period_due (a date later than submission_period_start), and status set to open
2. WHEN a user submits an entry to an open design competition, THE Design_Hub_Platform SHALL record the entry as Your_Content owned by the submitting user with a submission timestamp
3. IF a competition entry is submitted after submission_period_due, THEN THE Design_Hub_Platform SHALL reject the entry and return an error indicating the submission period has closed
4. THE Design_Hub_Platform SHALL support booking of the physical co-working and learning space, recording the booking user, the requested time slot, and a booking status
5. IF a co-working space booking requests a time slot that conflicts with an existing confirmed booking, THEN THE Design_Hub_Platform SHALL reject the booking and return an error indicating the slot is unavailable

### Requirement 17: Multi-Brand Data Isolation and Access Control

**User Story:** As a platform architect, I want every Phase 2 entity protected by RLS that reuses C12 helpers and isolated by brand realm, so that the multi-brand platform enforces consistent, auditable access.

#### Acceptance Criteria

1. THE Design_Hub_Platform SHALL protect every Phase 2 entity (accounts, Professional_Profile, Product_Catalog listings, orders, Bible_Code master, Key_Plan, Your_Content, Idea_Book, reviews, Learning_Center records) with Supabase RLS policies gated `TO authenticated` that reuse the existing helper functions `public.has_any_app_role()`, `public.has_site_access()`, and `public.is_governance_role()`
2. THE Design_Hub_Platform SHALL perform all mutations of Phase 2 entities through SECURITY DEFINER RPC functions that re-check the caller's role inside the function and resolve the actor via `public.resolve_actor()` rather than trusting client-supplied actor identifiers
3. THE Design_Hub_Platform SHALL isolate brand-scoped data using A1 Brand and site_code realm boundaries so that a Professional_Profile owner accesses only data within their own Brand realm except for content that is public by default
4. WHILE a user holds a Governance_Role (admin, operations, finance, or executive_owner), THE Design_Hub_Platform SHALL allow cross-brand read access to Phase 2 entities consistent with the existing C12 model
5. IF a user attempts a mutation on a Phase 2 entity without the required role, THEN THE Design_Hub_Platform SHALL reject the operation and return a permission denied error
6. WHEN any sensitive change occurs on a Phase 2 entity (create, update, deactivate, moderation decision, grant change, revenue-share computation, or production handoff), THE Design_Hub_Platform SHALL record an entry in the append-only Audit_Log containing entity_type, entity_id, action_type, performed_by via `public.resolve_actor()`, and performed_at
7. THE Design_Hub_Platform SHALL store Audit_Log entries in an append-only table that rejects UPDATE and DELETE operations

## Assumptions and Open Questions

> ส่วนนี้บันทึกสมมติฐานสำคัญที่ **ยังรอการยืนยันจากเจ้าของ** เพื่อให้สามารถแก้ไขภายหลังได้โดยไม่ต้อง re-architect

### A-1 — "Monolith = Design Hub = TCCK" (PENDING owner confirmation)

ถ้อยแถลงของเจ้าของว่า "Monolith = Design Hub = TCCK" ถูกตีความในเอกสารนี้ว่า: **Design Hub และ TCCK ใช้ "พิมพ์เขียวสถาปัตยกรรมเดียวกัน" (A1 / C12 / Gate / Evidence / Audit) แต่รันเป็น runtime/ฐานข้อมูล แยกกัน** (สอดคล้องกับ spec `separate-monolith-tcck` ที่ส่งมอบแล้ว และ ADR-016 standalone) — Design Hub เป็นโดเมนตกแต่ง (decor) เท่านั้น (`designhub.asia`) และ **ไม่ใช่** ฐานข้อมูล/ดีพลอยเดียวกับธุรกิจอาหาร TCCK

- **สถานะ:** PENDING — รอเจ้าของยืนยันขั้นสุดท้าย
- **ผลกระทบถ้าตีความผิด:** ถ้าเจ้าของหมายถึงฐานข้อมูลเดียวกันจริง จะกระทบขอบเขต data isolation, RLS realm และ deployment topology — จึง flag ไว้เพื่อแก้ได้โดยไม่ต้องรื้อ
- **การออกแบบเชิงป้องกัน:** requirements ทั้งหมดอ้าง A1/C12 แบบ reuse-not-fork ดังนั้นเปลี่ยนการตีความนี้ภายหลังจะกระทบเฉพาะ deployment/realm config ไม่กระทบ business rules

### A-2 — `get_active_site_codes()` ยังเป็น placeholder (must be flipped)

ปัจจุบัน (ตาม ADR-016) `public.get_active_site_codes()` คืนค่า placeholder ค่าเดียวคือ `'BKK-HQ-01'` (single-site) ซึ่ง **ไม่เพียงพอ** ต่อการรองรับแพลตฟอร์มหลายแบรนด์/หลายสาขาของ Phase 2

- **สิ่งที่ต้องทำ:** ต้อง flip `get_active_site_codes()` ให้ query จริงจากตาราง A1 brands/locations เพื่อคืน site_code ที่ active ทั้งหมดต่อ Brand/Location
- **สถานะ:** PENDING — ขึ้นกับรหัส Site_Code จริงของ DAPH HQ + แผนขยายสาขา/แบรนด์ (เจ้าของต้องยืนยัน)
- **ผลกระทบ:** ตราบใดที่ยังเป็น placeholder การ isolation ตาม Brand realm (Req 17.3) และการ grant professional_owner ตาม Location (Req 4.4) จะทำงานบน single site เท่านั้น

### A-3 — Site Designer Service terms (separate document)

Site_Designer_Service อ้างถึง "Site Designer Terms of Use" ที่เป็นเอกสารแยก — เอกสารนี้สมมติว่ามีข้อกำหนดแยกจริงและอ้างถึงเท่านั้น (Req 6.5) รายละเอียดเงื่อนไขเต็มอยู่นอกขอบเขต spec นี้

### A-4 — ขอบเขต Bible_Code grammar

ไวยากรณ์ Bible_Code (Req 8) อ้างอิงจากแคตตาล็อก "The Bible Cabinet" ที่สำรวจแล้ว ครอบคลุม Counter (`DKC`), Cabinet (`DC`), Wardrobe (`DWD`) โดย Counter/Cabinet ใช้ width 300–1200mm step 50mm; **Wardrobe ใช้ช่วงความกว้างและความลึกของตัวเอง (เช่น D530/D600, H2400)** ซึ่งอาจอยู่นอกช่วง 300–1200 ของ Req 8.5 — ขอบเขต width step สำหรับ Wardrobe โดยเฉพาะ PENDING การยืนยันจากแคตตาล็อกฉบับเต็ม

### A-5 — Kernel Truth Service (kernel-pyocc) อยู่ใน iimos-workspace แบบ untracked + unbuilt (IP / SPOF risk)

จากการตรวจสอบโค้ดจริง (audit): "source of geometric truth" ระดับ B-rep คือ **Kernel Truth Service (kernel-pyocc, SPEC-08 v8.2)** — Python + OpenCascade + FastAPI, ออกแบบให้รันที่ `services/kernel-pyocc/` ภายใน workspace `iimos-workspace` แต่ **โค้ดตัวจริงไม่ปรากฏใน repository**:
- ไม่มีโฟลเดอร์ `services/kernel-pyocc/` บนดิสก์ และ `git ls-files services/*` ว่างเปล่าทุก branch (`master`, `fix/drillmap-bolt-and-brun-dowels`, `wip/brun-sandbox`); `git log --all` ของ path นั้นไม่มี history; ไม่มี git remote ตั้งไว้
- สิ่งที่มีในปัจจุบัน = client stub (`src/core/kernelClient` + `contracts/kernel/client.ts`) + CI workflow (`.github/workflows/kernel-pyocc.yml`) + SPEC-08 docs เท่านั้น
- **ยังไม่ wired:** `KernelClient` ถูกเรียกเฉพาะใน smoke test; ไม่มี `initKernelClient()` ใน bootstrap; pipeline ปัจจุบันใช้ three-bvh-csg (browser) + TS OperationGraph แทน

- **สถานะ:** PENDING — เจ้าของต้องยืนยัน (ก) โค้ด kernel-pyocc ตัวจริงอยู่ที่ไหน (เครื่อง local `C:\Projects\iimos-workspace`? remote ส่วนตัว? หรือยังไม่ได้สร้าง) (ข) build/รันได้จริงแล้วหรือยัง
- **ผลกระทบ (IP / Single Point Of Failure):** ถ้าโค้ด geometry-truth kernel หายหรือไม่ถูก backup คือความเสี่ยงทรัพย์สินทางปัญญาขั้นรุนแรง และเป็น SPOF เชิงสถาปัตยกรรมหากอนาคตจะพึ่งพาใน production
- **คำแนะนำเชิงป้องกัน (ก่อนพึ่งพาใน production):** ต้อง **commit โค้ด kernel-pyocc เข้า version control + ตั้ง remote + backup** ก่อนนำเข้า production path; ระหว่างที่ยังไม่ wired Phase 2 พึ่งเฉพาะ Released_Spec จาก CAM/Manufacturing Engine (TS) ได้โดยไม่ block (Req 9.3–9.5)
- **การออกแบบเชิงป้องกัน:** Req 9 เชื่อมผ่าน Released_Spec contract กับ CAM/Manufacturing Engine (TS) เท่านั้น ไม่ผูกกับ kernel-pyocc โดยตรง ดังนั้นสถานะของ kernel-pyocc **ไม่ block** Phase 2 และเปลี่ยนภายหลังได้โดยไม่ต้อง re-architect

### A-6 — Panel Material & Thickness Model (วัสดุแผ่น/ความหนา = มิติแยกจาก Bible_Code)

จากการยืนยันของเจ้าของ (WO-0 Q4: carcass "มีหลายขนาดความหนา แล้วแต่ประเภทไม้และงบลูกค้า") + การสำรวจผู้ผลิตจริง 8 แหล่ง (Panel Plus, Agro, SGB, AGF, Birchwood, PTK, Metro Ply, Dongstar) ที่บันทึกใน `#[[file:../../../_daph_extract/MATERIAL_CATALOG_REFERENCE.md]]` ได้ข้อสรุปเชิงออกแบบที่ verified:

- **ความหนา/วัสดุ เป็น material spec แยกจาก Bible_Code grammar** — Bible_Code (Req 8) เข้ารหัสเฉพาะ "รูปทรง" (furniture type, W/D/H, options) เท่านั้น **ไม่เข้ารหัสความหนา/ชนิดวัสดุ/ผิว** การเลือกวัสดุทำที่ระดับ Key_Plan line / order option (Req 9)
- **ความหนาไม่ใช่ค่าคงที่ 18mm** อีกต่อไป — บางสายเป็น "ช่วงสั่งผลิต" (เช่น MDF 1.7–40mm), บางเกรดเป็นชุดค่าจำกัด (เช่น HMR 4/6/9/12/15/18/25mm); การ validate ความหนาต้องเทียบกับ (material_type × moisture_grade)
- **Material เป็น catalog table แบบ row-extensible** (สอดคล้อง WO-0 Q2) ไม่ใช่ enum hardcode — ครอบคลุมมิติ: `material_type` (PARTICLE · MDF · HDF · THIN_MDF · FLAME_RETARDANT · PVC_FOAM · PLYWOOD · HARDBOARD · OSB · WPC · ENGINEERED_VENEER · BLOCKBOARD · FILM_FACED_PLYWOOD · ACOUSTIC_PANEL), `moisture_grade` (STANDARD · MR · HMR_V313), `emission_grade` (SUPER_E0/Purple Core · E0 · E1 · E2 · SE0 · CARB_P2_EPA · F-four-star JIS), `surface_finish` (RAW · MELAMINE · SYNCHRONOUS · HPL · MELLOW_MATTE), `veneer_face` (ไม้จริง teak/oak/ash/beech/maple/birch/walnut…), `glue_grade` (plywood: MR · WBP_MARINE · ENF), `cert_standard` (TIS 178-2549 / 192-2549 · V313 · ASTM E84 · EN 13501-1 · FSC), `sheet_size_mm`, `supplier`
- **Sheet size มีหลายค่า** (1220×2440 · 1230×2450 · 1830×2440 · 2440×1220) — **กระทบ nesting/yield ใน CAM/Manufacturing Engine (TS) โดยตรง** ดังนั้น Released_Spec ต้องส่ง sheet_size เข้า nesting ไม่ fix ค่าเดียว (ดู design §6 — `manufacturingOutputs.nesting`)

- **สถานะ:** ทิศทาง verified แล้ว — material catalog table เป็น Phase 2 work (row-extensible) แยกจาก Bible_Code
- **ยังรอยืนยัน (ไม่ block substrate):**
  - **B-1b:** ความหนา default + ตัวเลือกต่อ "ชิ้นส่วนตู้" (carcass body / back panel / door / shelf / drawer) — ขึ้นกับ construction profile (OQ-4, สัมภาษณ์ช่าง)
  - **B-2:** ช่วง Bible_Code custom (W/D/H min/max/step ต่อ furniture type) ตาม WO-0 Q5 ("custom ได้") — กระทบ round-trip property (Req 8.7) จึงต้องระบุช่วงก่อนเขียน validator
- **การออกแบบเชิงป้องกัน:** material model เป็นตารางแยก เพิ่ม row/ชนิดได้โดยไม่ re-architect; B-1b/B-2 เป็น data/validation detail เติมภายหลังได้โดยไม่กระทบ schema หลัก

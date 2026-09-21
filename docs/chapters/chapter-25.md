---
num: 25
title: "ระบบฝึกอบรม (Training)"
phase: "Foundation"
phase_num: 0
mcp_tools: 0
status: complete
dependencies: "—"
---

# บทที่ 25: ระบบฝึกอบรม (Training & Onboarding)

## บทที่ 25: ระบบฝึกอบรม (Training & Onboarding)

### 25.1 ภาพรวมและวัตถุประสงค์

ระบบฝึกอบรมเป็น module สุดท้ายที่ออกแบบมาเพื่อปิด gap ที่ SLR ระบุ Vukman et al. เน้นอย่างชัดเจนว่า training เป็น critical success factor สำหรับ ERP implementation และ user experience มีบทบาทสำคัญ [6] นอกจากนี้ยังเน้นว่า "human intervention in the effective and responsible implementation of artificial intelligence" ชี้ให้เห็นว่าการฝึกอบรมเป็นเงื่อนไขจำเป็นสำหรับความสำเร็จของ digital transformation [6]

**วัตถุประสงค์หลัก:**

  * จัดการ onboarding flow สำหรับพนักงานใหม่
  * สร้าง skill development paths สำหรับแต่ละตำแหน่ง
  * Training modules แยกตาม role
  * ติดตาม certification
  * Knowledge base สำหรับ self-learning
  * Video tutorials และ interactive content
  * Assessment system สำหรับวัดความรู้



### 25.2 สถาปัตยกรรมของ Module

#### 25.2.1 Database Schema
[code] 
    Table: training_programs
      - id: UUID (PK)
      - name: VARCHAR(200)
      - type: ENUM ('onboarding', 'skill_development', 'certification',
                    'safety', 'compliance', 'system_training', 'leadership')
      - target_roles: VARCHAR[]
      - target_departments: VARCHAR[]
      - description: TEXT
      - modules: UUID[] -- FK → training_modules (ordered)
      - estimated_hours: DECIMAL
      - is_mandatory: BOOLEAN
      - passing_score: DECIMAL -- 0-100
      - certificate_template_id: UUID NULL
      - status: ENUM ('draft', 'published', 'archived')
      - created_at: TIMESTAMPTZ
    
    Table: training_modules
      - id: UUID (PK)
      - program_id: UUID (FK → training_programs)
      - title: VARCHAR(200)
      - sequence: INTEGER
      - content_type: ENUM ('video', 'document', 'interactive', 'quiz',
                             'hands_on', 'live_session', 'external')
      - content: JSONB {
          video_url, document_url, slides_url,
          interactive_config, quiz_questions,
          hands_on_instructions, session_details
        }
      - duration_minutes: INTEGER
      - is_mandatory: BOOLEAN
      - prerequisites: UUID[] -- module IDs
    
    Table: employee_enrollments
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - program_id: UUID (FK → training_programs)
      - enrolled_at: TIMESTAMPTZ
      - deadline: DATE NULL
      - status: ENUM ('enrolled', 'in_progress', 'completed', 'failed',
                       'expired', 'withdrawn')
      - progress_percentage: DECIMAL DEFAULT 0
      - completed_at: TIMESTAMPTZ NULL
    
    Table: module_progress
      - id: UUID (PK)
      - enrollment_id: UUID (FK → employee_enrollments)
      - module_id: UUID (FK → training_modules)
      - status: ENUM ('not_started', 'in_progress', 'completed', 'skipped')
      - started_at: TIMESTAMPTZ NULL
      - completed_at: TIMESTAMPTZ NULL
      - time_spent_minutes: INTEGER DEFAULT 0
      - attempts: INTEGER DEFAULT 0
    
    Table: assessments
      - id: UUID (PK)
      - enrollment_id: UUID (FK → employee_enrollments)
      - module_id: UUID NULL (FK → training_modules)
      - type: ENUM ('quiz', 'practical', 'observation', 'peer_review', 'final_exam')
      - questions: JSONB [{question_id, question, type, options, correct_answer, points}]
      - answers: JSONB [{question_id, answer, is_correct, points_earned}]
      - score: DECIMAL
      - max_score: DECIMAL
      - passed: BOOLEAN
      - attempt_number: INTEGER
      - submitted_at: TIMESTAMPTZ
    
    Table: certifications
      - id: UUID (PK)
      - employee_id: UUID (FK → employees)
      - program_id: UUID (FK → training_programs)
      - certification_name: VARCHAR(200)
      - issued_date: DATE
      - expiry_date: DATE NULL
      - certificate_url: VARCHAR(500)
      - status: ENUM ('active', 'expired', 'revoked')
      - issued_by: UUID (FK → employees)
    
    Table: knowledge_base
      - id: UUID (PK)
      - title: VARCHAR(200)
      - category: ENUM ('process', 'machine', 'material', 'safety', 'quality',
                         'system_guide', 'troubleshooting', 'best_practice')
      - content: TEXT -- markdown
      - tags: VARCHAR[]
      - attachments: JSONB [{url, filename, type}]
      - author_id: UUID (FK → employees)
      - view_count: INTEGER DEFAULT 0
      - is_published: BOOLEAN
      - version: INTEGER
      - created_at: TIMESTAMPTZ
      - updated_at: TIMESTAMPTZ
    
    Table: skill_development_paths
      - id: UUID (PK)
      - name: VARCHAR(200) -- 'CNC Operator Track', 'QC Inspector Track'
      - target_role: VARCHAR(100)
      - levels: JSONB [{level, name, required_programs, required_skills,\
                         estimated_months}]
      - is_active: BOOLEAN
    
[/code]

#### 25.2.2 API Endpoints

Method | Endpoint | Description  
---|---|---  
GET | `/api/v1/training/programs` | รายการ training programs  
POST | `/api/v1/training/programs` | สร้าง program ใหม่  
GET | `/api/v1/training/programs/:id` | รายละเอียด program  
POST | `/api/v1/training/enroll` | ลงทะเบียนพนักงาน  
GET | `/api/v1/training/enrollments/:employeeId` | enrollments ของพนักงาน  
PATCH | `/api/v1/training/progress/:enrollmentId` | อัปเดต progress  
POST | `/api/v1/training/assessments` | ส่ง assessment  
GET | `/api/v1/training/assessments/:id/results` | ผล assessment  
GET | `/api/v1/training/certifications/:employeeId` | certifications ของพนักงาน  
GET | `/api/v1/training/knowledge-base` | ค้นหา knowledge base  
POST | `/api/v1/training/knowledge-base` | สร้าง article ใหม่  
GET | `/api/v1/training/paths` | skill development paths  
GET | `/api/v1/training/analytics` | training analytics  
  
#### 25.2.3 UI Screens

  1. **Training Dashboard** — my enrollments, upcoming training, completion rates, certificates
  2. **Learning Catalog** — browse available programs, filter by role/department
  3. **Course Player** — video player, document viewer, interactive content, quiz interface
  4. **Assessment Center** — take quizzes, practical assessments, view results
  5. **Certification Wall** — แสดง certificates ที่ได้รับ, expiry alerts
  6. **Knowledge Base** — searchable wiki-style knowledge repository
  7. **Skill Development Roadmap** — visual path แสดง career progression
  8. **Training Admin** — สร้าง/จัดการ programs, modules, assessments
  9. **Onboarding Checklist** — step-by-step onboarding สำหรับพนักงานใหม่



### 25.3 Workflow Diagrams

#### 25.3.1 Onboarding Flow สำหรับพนักงานใหม่
[code] 
    วันที่ 1: Orientation
      → ลงทะเบียนในระบบ HR (บทที่ 20) → auto-enroll onboarding program
      → ดู welcome video → company overview module
      → Safety induction (mandatory) → quiz → ต้องผ่าน 100%
      → รับ PPE (link บทที่ 24) → safety tour
    
    สัปดาห์ที่ 1: Foundation Training
      → System training modules (ใช้งาน Monolith OS)
      → Department-specific orientation
      → Buddy/mentor assignment
      → Daily check-in quiz
    
    สัปดาห์ที่ 2-4: Role-Specific Training
      → Machine operations (ถ้าเป็น production)
      → QC procedures (ถ้าเป็น QC)
      → Installation techniques (ถ้าเป็นช่าง)
      → Hands-on practice + observation assessment
      → Supervisor sign-off
    
    เดือนที่ 2-3: Supervised Work
      → ทำงานจริงภายใต้ supervision
      → Periodic assessments
      → Skill matrix update (link บทที่ 20)
    
    เดือนที่ 3: Probation Review
      → Final assessment → ผ่าน → issue certification → fully onboarded
      → ไม่ผ่าน → extended training / reassignment
    
[/code]

#### 25.3.2 Continuous Development Workflow
[code] 
    ขั้นตอนที่ 1: ระบบวิเคราะห์ skill gaps จาก:
      → Performance evaluations (บทที่ 20)
      → QC defect data attributed to operator (บทที่ 15)
      → Safety incidents (บทที่ 24)
      → New technology/process introduction
    
    ขั้นตอนที่ 2: แนะนำ training programs ที่เหมาะสม
    ขั้นตอนที่ 3: Employee/Supervisor enroll
    ขั้นตอนที่ 4: ดำเนินการเรียน → quizzes → hands-on
    ขั้นตอนที่ 5: Assessment → ผ่าน → update skill matrix + issue certificate
    ขั้นตอนที่ 6: Review impact → ดู KPI improvement post-training
    
[/code]

### 25.4 TypeScript Interface Definitions
[code] 
    interface TrainingProgram {
      id: string;
      name: string;
      type: ProgramType;
      targetRoles: string[];
      targetDepartments: string[];
      description: string;
      modules: string[]; // module IDs in order
      estimatedHours: number;
      isMandatory: boolean;
      passingScore: number;
      certificateTemplateId: string | null;
      status: 'draft' | 'published' | 'archived';
    }
    
    type ProgramType =
      | 'onboarding' | 'skill_development' | 'certification'
      | 'safety' | 'compliance' | 'system_training' | 'leadership';
    
    interface TrainingModule {
      id: string;
      programId: string;
      title: string;
      sequence: number;
      contentType: ContentType;
      content: ModuleContent;
      durationMinutes: number;
      isMandatory: boolean;
      prerequisites: string[];
    }
    
    type ContentType =
      | 'video' | 'document' | 'interactive' | 'quiz'
      | 'hands_on' | 'live_session' | 'external';
    
    interface ModuleContent {
      videoUrl?: string;
      documentUrl?: string;
      slidesUrl?: string;
      interactiveConfig?: Record<string, unknown>;
      quizQuestions?: QuizQuestion[];
      handsOnInstructions?: string;
      sessionDetails?: { date: Date; location: string; instructor: string };
    }
    
    interface EmployeeEnrollment {
      id: string;
      employeeId: string;
      programId: string;
      enrolledAt: Date;
      deadline: Date | null;
      status: EnrollmentStatus;
      progressPercentage: number;
      completedAt: Date | null;
    }
    
    type EnrollmentStatus =
      | 'enrolled' | 'in_progress' | 'completed' | 'failed'
      | 'expired' | 'withdrawn';
    
    interface Assessment {
      id: string;
      enrollmentId: string;
      moduleId: string | null;
      type: 'quiz' | 'practical' | 'observation' | 'peer_review' | 'final_exam';
      questions: QuizQuestion[];
      answers: QuizAnswer[];
      score: number;
      maxScore: number;
      passed: boolean;
      attemptNumber: number;
      submittedAt: Date;
    }
    
    interface QuizQuestion {
      questionId: string;
      question: string;
      type: 'multiple_choice' | 'true_false' | 'short_answer' | 'practical';
      options: string[] | null;
      correctAnswer: string;
      points: number;
    }
    
    interface QuizAnswer {
      questionId: string;
      answer: string;
      isCorrect: boolean;
      pointsEarned: number;
    }
    
    interface Certification {
      id: string;
      employeeId: string;
      programId: string;
      certificationName: string;
      issuedDate: Date;
      expiryDate: Date | null;
      certificateUrl: string;
      status: 'active' | 'expired' | 'revoked';
      issuedBy: string;
    }
    
    interface KnowledgeBaseArticle {
      id: string;
      title: string;
      category: KbCategory;
      content: string;
      tags: string[];
      attachments: Attachment[];
      authorId: string;
      viewCount: number;
      isPublished: boolean;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }
    
    type KbCategory =
      | 'process' | 'machine' | 'material' | 'safety' | 'quality'
      | 'system_guide' | 'troubleshooting' | 'best_practice';
    
    interface SkillDevelopmentPath {
      id: string;
      name: string;
      targetRole: string;
      levels: PathLevel[];
      isActive: boolean;
    }
    
    interface PathLevel {
      level: number;
      name: string;
      requiredPrograms: string[];
      requiredSkills: string[];
      estimatedMonths: number;
    }
    
[/code]

### 25.5 Integration กับ Modules อื่น

Module | ทิศทาง | รายละเอียด  
---|---|---  
HR & Team (บทที่ 20) | Bidirectional | skill gaps → training needs; completion → skill matrix update  
Safety (บทที่ 24) | Bidirectional | safety incidents → mandatory re-training; safety certifications  
Quality Control (บทที่ 15) | Inbound | operator defect patterns → targeted training  
Production Planning (บทที่ 19) | Inbound | new machine/process → training requirement  
Installation (บทที่ 13) | Inbound | installation quality feedback → skill assessment  
BI Dashboard (บทที่ 21) | Outbound | training completion rates, skill coverage, ROI  
  
### 25.6 Role-Based Access Control (RBAC)

Role | สิทธิ์  
---|---  
Training Manager | สร้าง/จัดการ programs, modules, assessments, analytics  
Department Head | ดู training status ของทีม, enroll members, approve  
Instructor | สร้าง content, ดำเนินการ live sessions, grade practical assessments  
Employee (Learner) | ดูและเรียน enrolled programs, take assessments, ค้นหา KB  
HR Admin | ดู training analytics ภาพรวม, manage certifications  
Knowledge Base Editor | สร้าง/แก้ไข KB articles  
  
### 25.7 Mobile/Responsive Design Considerations

  * **Mobile learning** : ดู video, อ่าน documents, ทำ quiz ได้จาก mobile
  * **Offline content** : download training materials สำหรับดูแบบ offline (พื้นที่โรงงานอาจไม่มี WiFi)
  * **Micro-learning** : content สั้นๆ 5-10 นาทีเหมาะกับช่วงพัก
  * **Push reminders** : แจ้งเตือน deadline, expiring certifications
  * **QR code access** : scan QR ที่เครื่องจักร → เปิด relevant training/KB article ทันที



### 25.8 KPIs และ Metrics

KPI | คำอธิบาย | เป้าหมาย  
---|---|---  
Training Completion Rate | % enrollments ที่เสร็จตาม deadline | ≥ 90%  
Average Assessment Score | คะแนนเฉลี่ยของ assessments | ≥ 80%  
Onboarding Time-to-Productivity | เวลาจาก hire ถึง fully productive | ลดลง 20%  
Certification Currency Rate | % certifications ที่ยังไม่หมดอายุ | ≥ 95%  
Knowledge Base Usage | จำนวน article views ต่อเดือน | เพิ่มขึ้น MoM  
Training ROI | improvement in KPIs post-training vs cost | positive  
Mandatory Training Compliance | % พนักงานที่ทำ mandatory training ครบ | 100%  
Skill Gap Closure Rate | % skill gaps ที่ปิดได้ภายใน 6 เดือน | ≥ 70%  
  
### 25.9 อ้างอิงจากงานวิจัย

Vukman et al. ระบุอย่างชัดเจนว่า training เป็น critical success factor สำหรับ ERP implementation ในอุตสาหกรรมไม้ โดยรวมถึง user experience ด้วย ซึ่งหมายความว่าระบบที่ดีต้องคู่กับผู้ใช้ที่ถูกฝึกมาอย่างดี นอกจากนี้ยังเน้นว่า "human intervention in the effective and responsible implementation of artificial intelligence" ต้องอาศัยพนักงานที่มีทักษะเพียงพอ [6] SLR สรุปว่า training modules ไม่ได้รับการศึกษาในงานวิจัยใดเลยในบริบทของ MES/ERP สำหรับเฟอร์นิเจอร์ [7] การออกแบบระบบนี้จึงเป็นส่วนเติมเต็มสำคัญ โดยเชื่อมโยง gap ระหว่างเทคโนโลยี (AI, IoT, Cloud ที่ Hoa et al. เสนอ [3]) กับบุคลากรที่ต้องใช้งานเทคโนโลยีเหล่านั้น — เพราะระบบที่ดีที่สุดก็ไม่มีประโยชน์หากผู้ใช้ไม่ได้รับการฝึกอบรมอย่างเพียงพอ

# สรุปภาพรวม: Integration Architecture ระหว่าง 13 Modules

## สรุปภาพรวม: Integration Architecture ระหว่าง 13 Modules

บทที่ 13–25 ทั้ง 13 modules ไม่ได้ทำงานแยกส่วน (silo) แต่เชื่อมต่อกันเป็น unified platform ผ่าน event-driven architecture สอดคล้องกับหลักการที่ Lü et al. เน้นว่าการแก้ปัญหา information islands ต้องอาศัยการ "deep collaboration" ข้ามทุกส่วน [1] ภาพรวมของ data flow ระหว่าง modules มีดังนี้:
[code] 
    CRM (18) → [Confirmed Order]
      ↓
    Production Planning (19) ← Inventory (16) ← Procurement (23) ← Suppliers
      ↓                          ↑
    Quality Control (15) ────────┘
      ↓
    Inventory (16) → Logistics (17) → Installation (13) → After-Sales (22)
    
    Cross-cutting modules:
    ├── Inter-Dept Communication (14) — connects all
    ├── HR & Team Management (20) — workforce for all
    ├── BI & Dashboard (21) — analytics from all
    ├── Safety & Compliance (24) — governs all
    └── Training & Onboarding (25) — enables all
    
[/code]

การออกแบบทั้งหมดตั้งอยู่บนฐานของ SLR ที่สังเคราะห์งานวิจัย 6 ชิ้น [7] โดยขยายจากจุดแข็งของงานวิจัยที่มี — ได้แก่ intelligent scheduling [1], distributed fabrication [2], IoT/AI/Cloud integration [3], multi-center cloud platform [4], ERP/MES collaborative platform [5] และ critical success factors [6] — ไปยัง modules ที่ยังเป็น research gap เพื่อสร้าง end-to-end manufacturing OS ที่ครอบคลุมทุก business operation ของอุตสาหกรรมเฟอร์นิเจอร์โมดูลาร์

# บทที่ 26–31: MCP Governance, AI Modules, Phase 2–3 Tools & Test Suite

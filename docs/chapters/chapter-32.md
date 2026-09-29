---
num: 32
title: "Notification, Reporting & Backup Tools"
phase: 4
phase_label: "Phase 4"
phase_num: 4
mcp_tools: 9
status: complete
dependencies: "Phase 3"
---

# บทที่ 32: Phase 4 — Notification, Reporting & Backup Management

## บทที่ 32: Phase 4 — Notification, Reporting & Backup Management

### 32.1 ภาพรวม Phase 4

Phase 4 ของ Migration Plan เพิ่ม MCP Tools 9 ตัว สำหรับ 3 โมดูลสำคัญที่รองรับ operational excellence:

โมดูล | Tool File | จำนวน Tools | ToolClass  
---|---|---|---  
Notification Management | `notification-management.ts` | 3 | Write / Write / Read  
Reporting Management | `reporting-management.ts` | 3 | Write / Write / Read  
Backup Management | `backup-management.ts` | 3 | Approval / Approval / Read  
  
แมปกับ monolith-workspace: `src/notifications/`, `src/reports/`, `src/backup/`

# Section 55

### 32.2 Notification Management Module

#### 32.2.1 manage_notification_rule

จัดการกฎการแจ้งเตือน — สร้าง, อัปเดต, ลบ, ดึง, หรือแสดงรายการ

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`action` | `"create" \ | "update" \ | "delete" \  
`ruleId` | `string` | for update/delete/get | Rule ID  
`name` | `string` | optional | ชื่อกฎ  
`trigger` | `RuleTrigger` | optional | เหตุการณ์ที่ trigger  
`channels` | `NotificationChannel[]` | optional | ช่องทางส่ง  
`recipients` | `string[]` | optional | ผู้รับ  
`priority` | `"low" \ | "normal" \ | "high" \  
`enabled` | `boolean` | optional | เปิด/ปิดกฎ  
`cooldownMinutes` | `number` | optional | ระยะเวลา cooldown  
  
**Supported Triggers:**

  * `job_created`, `job_status_changed`, `qc_failed`, `delivery_delayed`
  * `inventory_low`, `payment_overdue`, `backup_completed`, `system_alert`



**Supported Channels:**`email`, `sms`, `line`, `push`, `webhook`

**Response (list action):**
[code] 
    {
      "rules": [\
        {\
          "ruleId": "rule_abc123",\
          "name": "QC Failure Alert",\
          "trigger": "qc_failed",\
          "channels": ["email", "line"],\
          "recipients": ["qa-team@monolith.io"],\
          "priority": "high",\
          "templateId": "tpl_qc_fail",\
          "enabled": true,\
          "cooldownMinutes": 15,\
          "createdAt": "2025-01-15T10:30:00.000Z"\
        }\
      ],
      "action": "list",
      "message": "Found 4 notification rules"
    }
    
[/code]

#### 32.2.2 send_notification

ส่งการแจ้งเตือนตรงไปยังผู้รับ — รองรับหลายช่องทางพร้อมกัน

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`channel` | `NotificationChannel` | ✅ | ช่องทางส่ง  
`recipient` | `string` | ✅ | ผู้รับ (email/phone/userId)  
`subject` | `string` | ✅ | หัวข้อ  
`body` | `string` | ✅ | เนื้อหา  
`priority` | `NotificationPriority` | optional | ระดับ (default: normal)  
`ruleId` | `string` | optional | ผูกกับ rule  
  
**Response:**
[code] 
    {
      "notificationId": "notif_xyz789",
      "channel": "email",
      "recipient": "admin@company.com",
      "status": "delivered",
      "sentAt": "2025-01-15T10:35:00.000Z",
      "deliveredAt": "2025-01-15T10:35:02.000Z"
    }
    
[/code]

#### 32.2.3 get_notification_log

ดึงประวัติการแจ้งเตือน — filter ตาม channel, status, วันที่

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`channel` | `NotificationChannel` | optional | filter ตามช่องทาง  
`status` | `NotificationStatus` | optional | filter ตามสถานะ  
`from` | `string` | optional | วันที่เริ่มต้น ISO  
`to` | `string` | optional | วันที่สิ้นสุด ISO  
`limit` | `number` | optional | จำนวนสูงสุด (default: 50)  
  
**Response:** Array ของ `NotificationRecord` พร้อม summary statistics (totalSent, deliveryRate, channelBreakdown)

# Section 56

### 32.3 Reporting Management Module

#### 32.3.1 generate_report

สร้างรายงาน production, quality, finance หรือ custom report

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`type` | `ReportType` | ✅ | ประเภทรายงาน  
`title` | `string` | optional | ชื่อรายงาน custom  
`format` | `"pdf" \ | "xlsx" \ | "csv" \  
`from` | `string` | ✅ | วันที่เริ่มต้น  
`to` | `string` | ✅ | วันที่สิ้นสุด  
`tenantId` | `string` | optional | filter ตาม tenant  
`filters` | `Record` | optional | filter เพิ่มเติม  
  
**Supported Report Types:**

`production_summary`, `quality_analysis`, `financial_statement`, `inventory_status`, `delivery_performance`, `oee_report`, `cost_breakdown`, `staff_utilization`, `custom`

**Response:**
[code] 
    {
      "reportId": "rpt_abc123",
      "title": "Monthly Production Summary",
      "type": "production_summary",
      "format": "pdf",
      "status": "completed",
      "pageCount": 12,
      "downloadUrl": "/api/reports/rpt_abc123/download",
      "generatedAt": "2025-01-15T12:00:00.000Z",
      "dataPoints": 1847,
      "highlights": ["Total output: 4,250 units", "Defect rate: 1.2%"]
    }
    
[/code]

#### 32.3.2 schedule_report

ตั้งเวลาสร้างรายงานอัตโนมัติ — รองรับ daily ถึง yearly

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`action` | `"create" \ | "update" \ | "delete" \  
`scheduleId` | `string` | for update/delete | Schedule ID  
`reportType` | `ReportType` | for create | ประเภทรายงาน  
`frequency` | `"daily" \ | "weekly" \ | "biweekly" \  
`recipients` | `string[]` | optional | ผู้รับรายงาน  
`format` | `ReportFormat` | optional | รูปแบบ output  
`enabled` | `boolean` | optional | เปิด/ปิด schedule  
  
#### 32.3.3 get_report_history

ดึงประวัติรายงานที่สร้างแล้ว — filter ตามประเภท, วันที่, สถานะ

**Parameters:**`type`, `from`, `to`, `status`, `limit`

**Response:** Array ของ `ReportHistoryEntry` พร้อม summary (totalReports, completedCount, failedCount, avgGenerationMs)

# Section 57

### 32.4 Backup Management Module

#### 32.4.1 create_backup (Approval_Tool)

สร้าง backup ทั้ง database, storage, config หรือ all — ต้อง MANAGER+ role

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`type` | `"full" \ | "incremental" \ | "differential" \  
`target` | `"database" \ | "storage" \ | "config" \  
`retentionPolicy` | `"7d" \ | "30d" \ | "90d" \  
`tenantId` | `string` | optional | tenant เฉพาะ (ไม่ใส่ = ทุก tenant)  
`encrypt` | `boolean` | optional | เข้ารหัส (default: true)  
`description` | `string` | optional | คำอธิบาย  
  
**Response:**
[code] 
    {
      "backupId": "bkp_20250115_abc",
      "type": "full",
      "target": "all",
      "status": "completed",
      "sizeBytes": 524288000,
      "sizeFormatted": "500 MB",
      "encrypted": true,
      "retentionPolicy": "30d",
      "expiresAt": "2025-02-14T12:00:00.000Z",
      "checksum": "sha256:abc123...",
      "durationMs": 45000,
      "startedAt": "2025-01-15T02:00:00.000Z",
      "completedAt": "2025-01-15T02:00:45.000Z"
    }
    
[/code]

#### 32.4.2 restore_backup (Approval_Tool)

กู้ข้อมูลจาก backup — รองรับ point-in-time recovery และ dry run

**Parameters:**

Field | Type | Required | Description  
---|---|---|---  
`backupId` | `string` | ✅ | Backup ID ที่ต้องการ restore  
`targetEnvironment` | `"production" \ | "staging" \ | "development" \  
`pointInTime` | `string` | optional | จุดเวลาที่ต้องการกู้ ISO  
`dryRun` | `boolean` | optional | จำลองโดยไม่ restore จริง (default: false)  
`notifyOnComplete` | `boolean` | optional | แจ้งเมื่อเสร็จ (default: true)  
  
#### 32.4.3 get_backup_status

ตรวจสอบสุขภาพ backup — แสดง last backup times, storage usage, retention compliance

**Parameters:**`tenantId`, `includeRecent`, `limit`

**Response:**`BackupHealthStatus` พร้อม lastFullBackup, lastIncrementalBackup, totalBackups, storageUsedBytes, retentionCompliance, recentBackups

# Section 58

### 32.5 Governance Integration

ทั้ง 9 tools ผ่าน governance pipeline ครบถ้วน:

Tool | ToolClass | Min Plan | PDPA Scopes  
---|---|---|---  
manage_notification_rule | Write_Tool | PROFESSIONAL | CONTACT_INFO  
send_notification | Write_Tool | PROFESSIONAL | CONTACT_INFO  
get_notification_log | Read_Tool | STARTER | GENERAL_PERSONAL  
generate_report | Write_Tool | PROFESSIONAL | GENERAL_PERSONAL  
schedule_report | Write_Tool | PROFESSIONAL | —  
get_report_history | Read_Tool | STARTER | —  
create_backup | Approval_Tool | ENTERPRISE | —  
restore_backup | Approval_Tool | ENTERPRISE | —  
get_backup_status | Read_Tool | PROFESSIONAL | —  
  
### 32.6 Unit Tests

ผลลัพธ์ unit tests สำหรับ Phase 4:

  * `notification-management.test.ts` — 12 tests passed
  * `reporting-management.test.ts` — 13 tests passed
  * `backup-management.test.ts` — 16 tests passed
  * รวม: **41 tests** ครอบคลุม CRUD, error handling, และ edge cases



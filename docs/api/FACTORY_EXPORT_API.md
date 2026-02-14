# Factory Export API Reference

> REST API Endpoints for Factory-Gated Export System

**Version:** 2.0.0
**Base URL:** `/api`
**Last Updated:** February 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Export Options](#export-options)
4. [Job Export](#job-export)
5. [Bundle Upload](#bundle-upload)
6. [ZIP Export](#zip-export)
7. [Export History](#export-history)
8. [Download](#download)
9. [Audit Trail](#audit-trail)
10. [Error Codes](#error-codes)

---

## Overview

The Factory Export API provides endpoints for:
- Querying available export formats (dialects, profiles)
- Triggering exports for manufacturing jobs
- Uploading and verifying artifact bundles
- Downloading export packages with integrity verification
- Querying audit logs for compliance

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Factory UI / Export Configurator                    │   │
│  └───────────────────────┬─────────────────────────────┘   │
└──────────────────────────│──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Factory Server                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Express.js API                                      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  /factory/export/options       Export configuration  │   │
│  │  /factory/jobs/:id/export      Trigger export        │   │
│  │  /export/zip                   Gated ZIP export      │   │
│  │  /bundle/upload                Bundle verification   │   │
│  │  /audit                        Compliance trail      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication

Currently, the API uses IP-based tracking for audit purposes. Future versions will support:
- Bearer token authentication
- API key authentication
- OAuth2 integration

### Headers

| Header | Description |
|--------|-------------|
| `X-Factory-Id` | Optional factory identifier for scoped operations |
| `X-Operator-Id` | Optional operator identifier for audit trail |

---

## Export Options

### GET /factory/export/options

Returns available export configuration options.

**Request:**
```http
GET /api/factory/export/options HTTP/1.1
Host: factory.example.com
Accept: application/json
```

**Response:**
```json
{
  "dialects": [
    {
      "id": "KDT",
      "name": "KDT",
      "profiles": [
        {
          "id": "kdt_mvp_v1",
          "name": "KDT MVP v1",
          "dialect": "KDT",
          "description": "Basic KDT G-code output",
          "enabled": true
        },
        {
          "id": "kdt_pro_v1",
          "name": "KDT Pro v1",
          "dialect": "KDT",
          "description": "Advanced KDT G-code with optimizations",
          "enabled": true
        }
      ]
    },
    {
      "id": "BIESSE",
      "name": "Biesse",
      "profiles": [
        {
          "id": "biesse_iso_v1",
          "name": "Biesse ISO v1",
          "dialect": "BIESSE",
          "description": "Biesse ISO G-code format",
          "enabled": true
        }
      ]
    },
    {
      "id": "HOMAG",
      "name": "Homag",
      "profiles": [
        {
          "id": "homag_iso_v1",
          "name": "Homag ISO v1",
          "dialect": "HOMAG",
          "description": "Homag ISO G-code format",
          "enabled": true
        },
        {
          "id": "homag_weeke_v1",
          "name": "Homag Weeke v1",
          "dialect": "HOMAG",
          "description": "Homag Weeke format",
          "enabled": false
        }
      ]
    }
  ],
  "modes": [
    {
      "id": "PER_SHEET",
      "name": "Per Sheet",
      "description": "Generate separate files for each sheet"
    },
    {
      "id": "PER_JOB",
      "name": "Per Job",
      "description": "Generate a single combined file for the entire job"
    }
  ],
  "targets": [
    {
      "id": "GCODE",
      "name": "G-Code",
      "description": "CNC machine G-code output",
      "enabled": true
    },
    {
      "id": "DXF",
      "name": "DXF",
      "description": "AutoCAD DXF format for CAD software",
      "enabled": true
    },
    {
      "id": "BUNDLE",
      "name": "Bundle",
      "description": "Complete export bundle with all files",
      "enabled": true
    },
    {
      "id": "MANIFEST",
      "name": "Manifest Only",
      "description": "Export manifest JSON only",
      "enabled": true
    }
  ]
}
```

---

## Job Export

### POST /factory/jobs/:jobId/export

Trigger an export for a specific job with verify-on-export.

**Request:**
```http
POST /api/factory/jobs/JOB-2026-0012/export HTTP/1.1
Host: factory.example.com
Content-Type: application/json

{
  "target": "GCODE",
  "dialect": "KDT",
  "profileId": "kdt_mvp_v1",
  "mode": "PER_JOB",
  "include": {
    "manifest": true,
    "packet": false,
    "dxf": false
  }
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target` | string | Yes | Export target: `GCODE`, `DXF`, `BUNDLE`, `MANIFEST` |
| `dialect` | string | Yes | Machine dialect: `KDT`, `BIESSE`, `HOMAG` |
| `profileId` | string | Yes | Profile ID: `kdt_mvp_v1`, `biesse_iso_v1`, etc. |
| `mode` | string | Yes | Export mode: `PER_SHEET`, `PER_JOB` |
| `include.manifest` | boolean | No | Include manifest in bundle (default: true) |
| `include.packet` | boolean | No | Include packet JSON (default: false) |
| `include.dxf` | boolean | No | Include DXF drawings (default: false) |

**Success Response (200 OK):**
```json
{
  "ok": true,
  "exportId": "EXP-M5K8J2-ABC1",
  "sha256": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
  "sizeBytes": 12345,
  "filename": "JOB-2026-0012_kdt_export.zip",
  "downloadPath": "/api/factory/jobs/JOB-2026-0012/export/EXP-M5K8J2-ABC1/download",
  "exportedAt": "2026-02-01T10:30:00.000Z",
  "dialect": "KDT",
  "profileId": "kdt_mvp_v1",
  "contents": {
    "sheets": 6,
    "files": 8,
    "hasManifest": true,
    "hasPacket": false
  }
}
```

**Response Headers:**

| Header | Description |
|--------|-------------|
| `X-MONOLITH-ZIP-SHA256` | SHA-256 hash of the export ZIP file |

**Error Response (400 Bad Request):**
```json
{
  "ok": false,
  "code": "E_EXPORT_LOCKED",
  "message": "Export blocked: verification did not pass",
  "details": {
    "verifyVerdict": "FAIL",
    "verifyCode": "E_GATE_TOOL"
  }
}
```

---

## Bundle Upload

### POST /bundle/upload

Upload and verify an artifact bundle.

**Request:**
```http
POST /api/bundle/upload HTTP/1.1
Host: factory.example.com
Content-Type: application/json

{
  "bundle": {
    "files": [
      {
        "name": "manifest.json",
        "content": "{ ... }",
        "sha256": "abc123..."
      },
      {
        "name": "manifest.sig.json",
        "content": "{ ... }",
        "sha256": "def456..."
      },
      {
        "name": "cutlist.csv",
        "content": "...",
        "sha256": "789ghi..."
      }
    ],
    "createdAtIso": "2026-02-01T10:00:00.000Z"
  },
  "signature": {
    "algorithm": "Ed25519",
    "publicKeyId": "key-factory-001",
    "signature": "base64-encoded-signature"
  }
}
```

**Success Response (200 OK):**
```json
{
  "ok": true,
  "bundleId": "bundle-abc123def456",
  "verify": {
    "ok": true,
    "manifestValid": true,
    "signatureValid": true,
    "hashesValid": true,
    "issues": []
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "ok": false,
  "error": "VERIFICATION_FAILED",
  "verify": {
    "ok": false,
    "issues": [
      {
        "severity": "ERROR",
        "code": "E_HASH_MISMATCH",
        "message": "File hash mismatch for cutlist.csv"
      }
    ]
  }
}
```

---

## ZIP Export

### POST /export/zip

Synchronous gated export returning ZIP file with SHA-256 verification.

**Request:**
```http
POST /api/export/zip HTTP/1.1
Host: factory.example.com
Content-Type: application/json

{
  "bundle": { ... },
  "request": {
    "format": "KDT",
    "jobName": "JOB-2026-0012"
  }
}
```

**Success Response (200 OK):**
- Content-Type: `application/zip`
- Body: Binary ZIP file

**Response Headers:**

| Header | Description |
|--------|-------------|
| `X-MONOLITH-ZIP-SHA256` | SHA-256 hash for integrity verification |
| `X-MONOLITH-Entry-Count` | Number of files in the ZIP |
| `X-MONOLITH-Processing-Ms` | Processing time in milliseconds |
| `Content-Disposition` | `attachment; filename="factory-package-JOB-2026-0012.zip"` |

**Error Response (403 Forbidden):**
```json
{
  "ok": false,
  "error": "NOT_RELEASED",
  "specState": "FROZEN",
  "message": "Job must be RELEASED for export (current: FROZEN)"
}
```

---

## Export History

### GET /factory/jobs/:jobId/export/history

Get export history for a job.

**Request:**
```http
GET /api/factory/jobs/JOB-2026-0012/export/history HTTP/1.1
Host: factory.example.com
Accept: application/json
```

**Response:**
```json
{
  "ok": true,
  "jobId": "JOB-2026-0012",
  "count": 3,
  "exports": [
    {
      "exportId": "EXP-M5K8J2-ABC1",
      "dialect": "KDT",
      "profileId": "kdt_mvp_v1",
      "target": "GCODE",
      "exportedAt": "2026-02-01T10:30:00.000Z"
    },
    {
      "exportId": "EXP-K4N7P9-DEF2",
      "dialect": "BIESSE",
      "profileId": "biesse_iso_v1",
      "target": "GCODE",
      "exportedAt": "2026-02-01T09:15:00.000Z"
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "ok": false,
  "code": "E_EXPORT_JOB_NOT_FOUND",
  "message": "Invalid job ID format"
}
```

---

## Download

### GET /factory/jobs/:jobId/export/:exportId/download

Download a previously generated export file.

**Request:**
```http
GET /api/factory/jobs/JOB-2026-0012/export/EXP-M5K8J2-ABC1/download HTTP/1.1
Host: factory.example.com
```

**Success Response (200 OK):**
- Content-Type: `application/zip`
- Body: Binary ZIP file

**Error Response (404 Not Found):**
```json
{
  "error": "Export not found or access denied",
  "code": "E_EXPORT_NOT_FOUND"
}
```

---

## Audit Trail

### GET /audit

Query export audit log entries.

**Request:**
```http
GET /api/audit?bundleId=bundle-abc123&limit=10 HTTP/1.1
Host: factory.example.com
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `bundleId` | string | Filter by bundle ID |
| `jobId` | string | Filter by job ID |
| `status` | string | Filter by status: `SUCCESS`, `VERIFY_FAIL`, `POLICY_DENIED`, `ERROR` |
| `format` | string | Filter by export format |
| `fromIso` | string | Start date (ISO 8601) |
| `toIso` | string | End date (ISO 8601) |
| `limit` | number | Maximum entries to return (default: 100) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "ok": true,
  "count": 3,
  "entries": [
    {
      "id": "audit-001",
      "timestamp": "2026-02-01T10:30:00.000Z",
      "status": "SUCCESS",
      "bundleId": "bundle-abc123",
      "format": "KDT",
      "requester": "192.168.1.100",
      "zipHashHex": "a1b2c3d4...",
      "fileCount": 6,
      "processingTimeMs": 245
    }
  ]
}
```

### GET /audit/stats

Get audit statistics summary.

**Response:**
```json
{
  "ok": true,
  "stats": {
    "total": 156,
    "success": 142,
    "verifyFail": 8,
    "policyDenied": 4,
    "error": 2,
    "byFormat": {
      "KDT": 89,
      "BIESSE": 45,
      "HOMAG": 22
    }
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `E_EXPORT_LOCKED` | 403 | Export blocked due to failed verification |
| `E_EXPORT_JOB_NOT_FOUND` | 404 | Job ID not found |
| `E_EXPORT_DIALECT_INVALID` | 400 | Invalid or unsupported dialect |
| `E_EXPORT_PROFILE_INVALID` | 400 | Invalid or disabled profile |
| `E_EXPORT_GENERATION_FAILED` | 500 | Failed to generate export bundle |
| `E_EXPORT_NOT_FOUND` | 404 | Export not found or expired |
| `E_EXPORT_EXPIRED` | 410 | Export file has expired |
| `E_EXPORT_INTERNAL` | 500 | Internal server error |
| `E_BUNDLE_NOT_FOUND` | 404 | Bundle not found |
| `E_VERIFICATION_FAILED` | 400 | Bundle verification failed |
| `E_POLICY_DENIED` | 403 | Export policy denied |
| `E_NOT_RELEASED` | 403 | Job not in RELEASED state |

---

## TypeScript Types

```typescript
// Export Dialects
type ExportDialect = 'KDT' | 'BIESSE' | 'HOMAG';

// Export Profiles
type ExportProfileId =
  | 'kdt_mvp_v1'
  | 'kdt_pro_v1'
  | 'biesse_iso_v1'
  | 'homag_iso_v1'
  | 'homag_weeke_v1';

// Export Targets
type ExportTarget = 'GCODE' | 'DXF' | 'BUNDLE' | 'MANIFEST';

// Export Modes
type ExportMode = 'PER_SHEET' | 'PER_JOB';

// Export Request
interface ExportRequest {
  target: ExportTarget;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  mode: ExportMode;
  include?: {
    manifest?: boolean;
    packet?: boolean;
    dxf?: boolean;
  };
}

// Export Response (Success)
interface ExportResponseSuccess {
  ok: true;
  exportId: string;
  sha256: string;
  sizeBytes: number;
  filename: string;
  downloadPath: string;
  exportedAt: string;
  dialect: ExportDialect;
  profileId: ExportProfileId;
  contents: {
    sheets: number;
    files: number;
    hasManifest: boolean;
    hasPacket: boolean;
  };
}

// Export Response (Error)
interface ExportResponseError {
  ok: false;
  code: string;
  message: string;
  details?: {
    verifyVerdict?: string;
    verifyCode?: string;
  };
}

type ExportResponse = ExportResponseSuccess | ExportResponseError;
```

---

## Client Usage Example

```typescript
import {
  fetchExportOptionsApi,
  runGatedExportApi,
  downloadExportApi,
  triggerBrowserDownload,
} from '@/factory/api/exportApi';

// 1. Fetch available options
const { data: options } = await fetchExportOptionsApi();
console.log('Available dialects:', options.dialects);

// 2. Trigger export
const { response, sha256 } = await runGatedExportApi('JOB-2026-0012', {
  target: 'GCODE',
  dialect: 'KDT',
  profileId: 'kdt_mvp_v1',
  mode: 'PER_JOB',
  include: { manifest: true },
});

if (response.ok) {
  // 3. Download the file
  const { blob, sha256: downloadSha } = await downloadExportApi(response.downloadPath);

  // 4. Verify integrity
  if (sha256 === downloadSha) {
    triggerBrowserDownload(blob, response.filename);
  } else {
    console.error('SHA-256 mismatch!');
  }
} else {
  console.error('Export failed:', response.message);
}
```

---

## Verify-on-Export Flow

```
1. Client submits export request
   │
   ▼
2. Server validates request parameters
   ├── Invalid dialect/profile → E_EXPORT_DIALECT_INVALID
   │
   ▼
3. Server runs verification check
   ├── FAIL verdict → E_EXPORT_LOCKED (blocked)
   ├── PASS_WITH_WARN → Continue (with warnings)
   │
   ▼
4. Server evaluates export policy
   ├── DENY decision → E_POLICY_DENIED
   │
   ▼
5. Server generates export bundle
   ├── Generation error → E_EXPORT_GENERATION_FAILED
   │
   ▼
6. Server logs audit entry
   │
   ▼
7. Server returns response with SHA-256 header
   │
   ▼
8. Client downloads and verifies integrity
```

---

*© 2026 Monolith Project. All rights reserved.*

# Monolith Manufacturing OS — Documentation Site

[![Deploy Manufacturing OS Docs](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/deploy-docs-pages.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/deploy-docs-pages.yml)
[![CI — Validate Site Files](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/deploy-docs-ci.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/deploy-docs-ci.yml)
[![Sync Chapters on Release](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/sync-chapters.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/sync-chapters.yml)
[![Auto-Update Changelog](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/auto-update-changelog.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/auto-update-changelog.yml)
[![Notify Slack on Deploy](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/notify-slack-deploy.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/notify-slack-deploy.yml)
[![Lighthouse Audit](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/lighthouse-audit.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/lighthouse-audit.yml)
[![Generate Site Data](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/generate-site-data.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/generate-site-data.yml)
[![Auto-Deploy SciSpace](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/auto-deploy-scispace.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/auto-deploy-scispace.yml)
[![Validate Frontmatter](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/validate-chapter-frontmatter.yml/badge.svg)](https://github.com/indetailsgroup-hue/monolith-workspace/actions/workflows/validate-chapter-frontmatter.yml)

> Static documentation site covering **55 chapters** across **15 development phases**  
> from Core Architecture to Predictive Maintenance AI.

**Live (SciSpace):** https://0ly1b489.scispace.co  
**GitHub Pages:** https://indetailsgroup-hue.github.io/monolith-workspace/ *(auto-deployed via GitHub Actions)*

---

## Quick Start — Local Preview

```bash
# Clone the repository
git clone https://github.com/indetailsgroup-hue/monolith-workspace.git
cd monolith-workspace/docs/manufacturing-os-site

# Option 1: Python (built-in, no install needed)
python3 -m http.server 3000
# → Open http://localhost:3000

# Option 2: Node.js
npx serve .
# → Open http://localhost:3000

# Option 3: VS Code
# Right-click index.html → "Open with Live Server"
```

> **Note:** Must be served via HTTP — opening `index.html` directly as `file://` will fail  
> because the site fetches `chapters.json` and `search_index.json` via `fetch()`.

---

## File Structure

```
docs/manufacturing-os-site/
├── index.html          # Main SPA — 55-chapter reader with sidebar navigation
├── script.js           # Search (Ctrl+K), theme toggle, chapter analytics
├── style.css           # Full styling — dark/light mode CSS variables
├── analytics.html      # Chapter-view analytics dashboard (Chart.js)
├── changelog.html      # Version history v1.0.0 → v2.0.0 (15-phase timeline)
├── chapters.json       # Pre-rendered HTML for all 55 chapters  (~955 KB)
├── search_index.json   # Plain-text search index for all 55 chapters (~391 KB)
└── README.md           # This file
```

---

## Full Chapter Index (55 Chapters)

### Foundation — Core Design (Ch 1–12)

| Ch | Title |
|----|-------|
| 1 | บทสรุปสำหรับผู้บริหาร (Executive Summary) |
| 2 | ภาพรวมของระบบ (System Overview) |
| 3 | งานวิจัยและฐานทางวิชาการ (Research & Academic Foundation) |
| 4 | สถาปัตยกรรมทางเทคนิค (Technical Architecture) |
| 5 | ข้อกำหนดผลิตภัณฑ์ (PRD) |
| 6 | ข้อกำหนดทางเทคนิค (Technical Specification) |
| 7 | เอกสารสำหรับนักพัฒนา (Developer Documentation) |
| 8 | Rebuild Blueprint |
| 9 | การจัดการความเสี่ยงและความท้าทาย (Risk Management) |
| 10 | แผนงานและ Roadmap |
| 11 | บทสรุปและข้อเสนอแนะ (Conclusion & Recommendations) |
| 12 | API Reference — MCP Server & REST Endpoints |

### Core Operational Modules (Ch 13–27)

| Ch | Title | Phase |
|----|-------|-------|
| 13 | ระบบจัดการช่างติดตั้ง (Installation Module) | Phase 1 |
| 14 | การสื่อสารระหว่างแผนก (Inter-Department Communication) | Phase 1 |
| 15 | ระบบควบคุมคุณภาพ (Quality Control) | Phase 1 |
| 16 | ระบบจัดการคลังวัสดุ (Inventory Management) | Phase 1 |
| 17 | ระบบโลจิสติกส์และจัดส่ง (Logistics & Delivery) | Phase 2 |
| 18 | ระบบจัดการลูกค้า (CRM) | Phase 2 |
| 19 | ระบบวางแผนการผลิต (Production Planning) | Phase 2 |
| 20 | ระบบจัดการทีมและบุคลากร (HR & Team Management) | Phase 2 |
| 21 | ระบบ Business Intelligence และ Dashboard | Phase 3 |
| 22 | ระบบ After-Sales และการรับประกัน (After-Sales & Warranty) | Phase 3 |
| 23 | ระบบจัดซื้อจัดจ้าง (Procurement) | Phase 3 |
| 24 | ระบบความปลอดภัยและมาตรฐาน (Safety & Compliance) | Phase 3 |
| 25 | ระบบฝึกอบรม (Training & Onboarding) | Phase 4 |
| 26 | MCP Governance Stack | Phase 4 |
| 27 | Governance Middleware & Pipeline | Phase 4 |

### Phase Development Chapters (Ch 28–55)

| Ch | Title | Phase |
|----|-------|-------|
| 28 | AI Module MCP Tools | Phase 4 |
| 29 | Phase 2 Tools — Factory, CNC, Workflow | Phase 2 |
| 30 | Phase 3 Tools — Digital Shadow, Customer Portal, Analytics | Phase 3 |
| 31 | Test Suite & Quality Assurance | Phase 5 |
| 32 | Phase 4 — Notification, Reporting & Backup Management | Phase 4 |
| 33 | Phase 5 — Organization, Culture & CI/CD Hardening | Phase 5 |
| 34 | Architecture Decision Records (ADR) | Phase 5 |
| 35 | Phase 6 — Analytics Dashboard & Real-time Monitoring | Phase 6 |
| 36 | Load Testing Strategy & Performance Benchmarks | Phase 6 |
| 37 | Phase 7: Supply Chain Management & Vendor Portal | Phase 7 |
| 38 | Persona User Journey Mapping | Phase 7 |
| 39 | Financial Management & Invoicing (Phase 8) | Phase 8 |
| 40 | Performance Benchmark Report | Phase 8 |
| 41 | HR Management Module (Phase 9) | Phase 9 |
| 42 | Employee Self-Service Module (Phase 9) | Phase 9 |
| 43 | Phase 9 Load Test Results | Phase 9 |
| 44 | Document Management Module (Phase 10) | Phase 10 |
| 45 | E-Signature Module (Phase 10) | Phase 10 |
| 46 | Compliance & Audit Trail Module (Phase 11) | Phase 11 |
| 47 | Regulatory Reporting Module (Phase 11) | Phase 11 |
| 48 | CRM Management Module (Phase 12) | Phase 12 |
| 49 | Customer Feedback & Analytics Module (Phase 12) | Phase 12 |
| 50 | Data Warehouse Integration Module (Phase 13) | Phase 13 |
| 51 | BI Dashboard & Reporting Module (Phase 13) | Phase 13 |
| 52 | IoT Sensor Data Management Module (Phase 14) | Phase 14 |
| 53 | Edge Device & Real-Time Alerting Module (Phase 14) | Phase 14 |
| 54 | Phase 15 — Predictive Maintenance System | Phase 15 |
| 55 | Phase 15 — Deployment, Governance, and Persona Use Cases | Phase 15 |

---

## 15-Phase Roadmap — MCP Tools Summary

| Phase | Scope | New MCP Tools | Cumulative |
|-------|-------|:---:|:---:|
| **Foundation** | Core Design, Auth, Multi-tenant, API | 21 | 21 |
| **Phase 1** | Installation, QC, Inventory, Inter-dept | 9 | 30 |
| **Phase 2** | Logistics, CRM, Production, HR, Factory CNC | 9 | 39 |
| **Phase 3** | BI Dashboard, After-Sales, Procurement, Safety | 9 | 48 |
| **Phase 4** | Training, MCP Governance, AI Modules, Notifications | 9 | 57 |
| **Phase 5** | Org Culture, CI/CD Hardening, Test Suite, ADR | 9 | 66 |
| **Phase 6** | Analytics Dashboard, Real-time Monitoring, Load Testing | 6 | 72 |
| **Phase 7** | Supply Chain, Vendor Portal, Persona Journeys | 6 | 78 |
| **Phase 8** | Financial Management, Invoicing, Performance Benchmarks | 6 | 84 |
| **Phase 9** | HR Module, Employee Self-Service, Load Tests | 6 | 90 |
| **Phase 10** | Document Management, E-Signature | 6 | 96 |
| **Phase 11** | Compliance, Audit Trail, Regulatory Reporting | 6 | 102 |
| **Phase 12** | CRM Module, Customer Feedback & Analytics | 6 | 108 |
| **Phase 13** | Data Warehouse, BI Dashboard & Reporting | 6 | 114 |
| **Phase 14** | IoT Sensor Data, Edge Device, Real-time Alerting | 6 | 120 |
| **Phase 15** | Predictive Maintenance AI, Deployment, Governance | 3 | 123 |

**Total: 55 Chapters · 123 MCP Tools · 15 Phases · 1 Foundation**

---

## Features

| Feature | How to Use |
|---------|-----------|
| **Full-text Search** | Press `Ctrl+K` (or `⌘K` on Mac) — searches all 55 chapters |
| **Dark / Light Mode** | Click 🌙/☀️ in the header — preference saved in `localStorage` |
| **Syntax Highlighting** | Automatic for all code blocks (highlight.js, atom-one-dark theme) |
| **PDF Export** | Click `📥 Export PDF` in any chapter header toolbar |
| **Analytics Dashboard** | Navigate to `/analytics.html` — tracks chapter views locally |
| **Changelog** | Navigate to `/changelog.html` — version timeline v1.0.0 → v2.0.0 |

---

## Deployment

### GitHub Pages (Automated)

Any push to `main` that changes files under `docs/manufacturing-os-site/**`  
automatically triggers `.github/workflows/deploy-docs-pages.yml`.

**GitHub Pages URL:** `https://indetailsgroup-hue.github.io/monolith-workspace/`

### SciSpace Hosting

Deployed manually via SciSpace Agent to:  
**https://0ly1b489.scispace.co**

---

## localStorage Keys

The site stores data locally in the browser — no server, no tracking.

| Key | Type | Purpose |
|-----|------|---------|
| `monolith-theme` | `'light' \| 'dark'` | Saved theme preference |
| `monolith-views` | `{ [chapterNum]: count }` | View count per chapter |
| `monolith-history` | `Array<{ num, ts }>` | Last 50 chapter visits (for history timeline) |

To reset all analytics data: open Analytics Dashboard → click **Clear Data**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vanilla HTML/CSS/JS (zero build step) |
| Search | Client-side full-text (custom, no library) |
| Charts | Chart.js 4.4.0 (CDN) |
| Syntax Highlighting | highlight.js 11.9.0 (CDN, atom-one-dark) |
| Data | Pre-rendered JSON (`chapters.json`, `search_index.json`) |
| Storage | `localStorage` only |
| CI/CD | GitHub Actions → GitHub Pages |

---

*Monolith Manufacturing OS · indetailsgroup-hue · 2026*

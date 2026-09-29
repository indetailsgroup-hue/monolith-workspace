# MONOLITH LINE Flex Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a bilingual, production-shaped standalone Flex Message Studio in LineOS with five presets, real-time preview/JSON/validation, a safe Mock LIFF journey, a truthful demo receipt, board-grade research and exact installation guidance.

**Architecture:** A dependency-free browser application reads immutable preset data into one canonical FlexDraft. Pure modules derive Flex JSON, validation decisions, exact-action demo transactions and SHA-256 demo receipts; a thin DOM controller renders the Studio Console without network requests. The nested product repository remains untouched and is only a reference for future integration.

**Tech Stack:** Semantic HTML5, CSS custom properties, browser-native ES modules, Web Crypto, Node.js built-in test runner, repository-native tools/render_docs.py, local browser verification.

## Global Constraints

- Work only in the parent root **C:\Users\thai3\determined-williams (2)**.
- Use Node.js **22.20.0 or newer**; planning environment observed **v22.21.1** with npm **11.6.2**.
- Do not modify the nested product repository **determined-williams/**.
- Recheck Git status in both roots before every task; preserve all pre-existing changes.
- Starting parent commit observed during planning: **f846044736c3** on **guardrails/claim-linters** with 202 status entries.
- Starting nested commit observed during planning: **a1e9006add32** on **fix/dxf-truth-chain** with 67 status entries.
- Runtime must make zero external network requests and contain no LINE/Supabase credentials or live-send path.
- Customer-facing branding is tenant-first with **Secured by MONOLITH**; internal shell is MONOLITH-first with explicit tenant context.
- Flex tap is never business approval. High-risk action always opens Mock LIFF and production guidance always requires Trust Kernel step-up.
- Receipt name is **Verification Receipt — Demo** and must display **DEMO — NOT A PRODUCTION SIGNATURE**.
- Support exactly one bubble and five approved presets in v1. Carousel/video authoring, raw JSON editing and production integration remain out of scope.
- UI and project documents must exist in Thai and English.
- Every Markdown project deliverable must have a matching standalone HTML file.
- Use official LINE sources for technical constraints; label MONOLITH recommendations as best practice.
- Apply test-driven development: write each behavior test, run it and observe the expected failure, then write the minimum production code.
- Stage and commit only exact files named by the current task.

---

## File map

### Runtime and core modules

| File | Responsibility |
|---|---|
| **LineOS/package.json** | Dependency-free scripts for unit and contract tests |
| **LineOS/line-flex-studio.html** | Semantic Studio Console shell, tabs, dialogs and live regions |
| **LineOS/line-flex-studio.css** | Trust Concierge tokens, three-column layout, responsive tabs, focus and reduced motion |
| **LineOS/line-flex-studio.mjs** | State reducer, safe DOM binding, preview/JSON/validation rendering, copy/download/reset and dialog flow |
| **LineOS/line-flex-model.mjs** | FlexDraft creation, cloning, immutable path updates and canonicalization |
| **LineOS/line-flex-presets.mjs** | Five frozen bilingual presets |
| **LineOS/line-flex-json.mjs** | Supported-subset Flex JSON generation and UTF-8 byte count |
| **LineOS/line-flex-validator.mjs** | Source-labelled validation registry and evaluator |
| **LineOS/line-flex-actions.mjs** | Action selection, risk guard and expiring demo transaction |
| **LineOS/line-flex-receipt.mjs** | Canonical receipt payload and SHA-256 digest |

### Local visual assets

| File | Responsibility |
|---|---|
| **LineOS/assets/line-flex-studio/design-approval-hero.svg** | Warm premium design-review visual |
| **LineOS/assets/line-flex-studio/quote-order-hero.svg** | Quote/order visual |
| **LineOS/assets/line-flex-studio/sla-escalation-hero.svg** | Time/SLA visual |
| **LineOS/assets/line-flex-studio/site-update-hero.svg** | Curated site-progress visual |
| **LineOS/assets/line-flex-studio/issue-evidence-hero.svg** | Issue/evidence visual |

### Tests

| File | Responsibility |
|---|---|
| **LineOS/tests/line-flex-model.test.mjs** | Draft isolation, immutable updates and preset contracts |
| **LineOS/tests/line-flex-json-validator.test.mjs** | Deterministic JSON, source rules and size/action limits |
| **LineOS/tests/line-flex-actions-receipt.test.mjs** | Risk routing, transaction binding, expiry and digest |
| **LineOS/tests/line-flex-structure.test.mjs** | Semantic HTML, local assets, no remote runtime dependencies |
| **LineOS/tests/line-flex-studio-state.test.mjs** | State reducer, language/preset/block changes and export gating |
| **LineOS/tests/docs-contract.test.mjs** | Bilingual Markdown/HTML pairing and status/claim constraints |

### Documents

| File family | Responsibility |
|---|---|
| **LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.{en,th}.{md,html}** | Executive deep-research decision report |
| **LineOS/docs/guides/line-flex-studio-user-guide.{en,th}.{md,html}** | Studio operating guide |
| **LineOS/docs/guides/line-developer-console-installation.{en,th}.{md,html}** | OA, Messaging API and LIFF installation guide |
| **LineOS/docs/guides/line-flex-action-vs-liff-decision-guide.{en,th}.{md,html}** | Action selection and anti-pattern guide |
| **LineOS/docs/guides/line-flex-performance-rendering-checklist.{en,th}.{md,html}** | Performance/device/accessibility checklist |
| **LineOS/docs/reports/2026-08-01-line-flex-studio-implementation-report.{en,th}.{md,html}** | Final evidence and residual-risk report |
| **LineOS/artifacts/line-flex-studio/** | Local desktop/mobile screenshots and machine-readable verification summary |

---

### Task 1: Immutable FlexDraft and five preset contracts

**Files:**
- Create: **LineOS/package.json**
- Create: **LineOS/line-flex-model.mjs**
- Create: **LineOS/line-flex-presets.mjs**
- Test: **LineOS/tests/line-flex-model.test.mjs**

**Interfaces:**
- Produces: **deepFreeze(value)**, **cloneDraft(value)**, **createDraft(preset, language)**, **updateDraftAtPath(draft, path, value)**, **canonicalize(value)**.
- Produces: **PRESET_IDS**, **PRESETS**, **getPreset(id)**.
- Every preset contains context, header, hero, body, footer, intent and evidence seed fields from the approved design.
- Later tasks consume only cloned drafts; no consumer mutates **PRESETS**.

- [ ] **Step 1: Add a dependency-free test command and write the failing model test**

Create **LineOS/package.json**:

```json
{
  "name": "monolith-line-flex-studio",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.20.0" },
  "scripts": {
    "test": "node --test",
    "test:core": "node --test tests/line-flex-model.test.mjs tests/line-flex-json-validator.test.mjs tests/line-flex-actions-receipt.test.mjs tests/line-flex-studio-state.test.mjs",
    "test:contracts": "node --test tests/line-flex-structure.test.mjs tests/docs-contract.test.mjs"
  }
}
```

Create **LineOS/tests/line-flex-model.test.mjs** with these tests:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDraft, updateDraftAtPath, canonicalize } from "../line-flex-model.mjs";
import { PRESET_IDS, PRESETS, getPreset } from "../line-flex-presets.mjs";

test("ships exactly the five approved immutable presets", () => {
  assert.deepEqual(PRESET_IDS, [
    "design-approval",
    "quote-order",
    "sla-escalation",
    "site-update",
    "issue-evidence"
  ]);
  assert.equal(Object.isFrozen(PRESETS), true);
  for (const id of PRESET_IDS) assert.equal(Object.isFrozen(getPreset(id)), true);
});

test("creates isolated bilingual drafts", () => {
  const th = createDraft(getPreset("design-approval"), "th");
  const en = createDraft(getPreset("design-approval"), "en");
  th.body.project = "changed outside the source";
  assert.notEqual(th.body.project, en.body.project);
  assert.notEqual(th.body.project, getPreset("design-approval").copy.th.body.project);
});

test("updates a nested field without mutating the previous draft", () => {
  const before = createDraft(getPreset("design-approval"), "th");
  const after = updateDraftAtPath(before, ["body", "revision"], "D-08");
  assert.equal(before.body.revision, "D-07");
  assert.equal(after.body.revision, "D-08");
  assert.notEqual(after, before);
});

test("canonicalize sorts object keys recursively", () => {
  assert.equal(canonicalize({ z: 1, a: { y: 2, b: 3 } }),
    '{"a":{"b":3,"y":2},"z":1}');
});
```

- [ ] **Step 2: Run the model test and observe RED**

Run:

```powershell
npm.cmd --prefix LineOS run test -- --test-name-pattern "approved immutable|isolated bilingual|nested field|canonicalize"
```

Expected: FAIL because **line-flex-model.mjs** and **line-flex-presets.mjs** do not exist.

- [ ] **Step 3: Implement the minimum immutable model**

Create **LineOS/line-flex-model.mjs**:

```js
export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function cloneDraft(value) {
  return structuredClone(value);
}

export function createDraft(preset, language) {
  if (!preset?.copy?.[language]) throw new Error("unsupported_language");
  return cloneDraft({
    ...preset.base,
    language,
    presetId: preset.id,
    ...preset.copy[language]
  });
}

export function updateDraftAtPath(draft, path, value) {
  const next = cloneDraft(draft);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]];
  }
  cursor[path.at(-1)] = value;
  return next;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) =>
      JSON.stringify(key) + ":" + canonicalize(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
```

- [ ] **Step 4: Implement all five frozen bilingual presets**

Create **LineOS/line-flex-presets.mjs** with the complete five-preset data set:

```js
import { deepFreeze } from "./line-flex-model.mjs";

export const PRESET_IDS = deepFreeze([
  "design-approval", "quote-order", "sla-escalation", "site-update", "issue-evidence"
]);

const sharedContext = {
  version: 1,
  tenantId: "tenant_daph_demo",
  tenantName: "Daph Studio",
  platformMark: "Secured by MONOLITH",
  demoStatus: "standalone_demo",
  recipientRef: "customer_demo_001"
};

const makePreset = ({
  id, audience, asset, canonicalAction, risk, requestedActionType,
  targetRef, expiresInMinutes, correlationPrefix, description, th, en
}) => ({
  id,
  base: {
    context: { ...sharedContext, audience },
    hero: {
      localAsset: "./assets/line-flex-studio/" + asset,
      exportUrl: "https://example.com/monolith/" + asset.replace(".svg", ".png"),
      aspectRatio: "20:13",
      aspectMode: "cover",
      description
    },
    intent: {
      canonicalAction, risk, requestedActionType, targetRef, expiresInMinutes
    },
    evidence: { correlationPrefix }
  },
  copy: { th, en }
});

const entries = [
  makePreset({
    id: "design-approval",
    audience: "customer",
    asset: "design-approval-hero.svg",
    canonicalAction: "design.approve_revision",
    risk: "high",
    requestedActionType: "liff_uri",
    targetRef: "project_s49_main_kitchen",
    expiresInMinutes: 1440,
    correlationPrefix: "LFS-APPROVAL",
    description: "Warm kitchen design preview",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "แบบพร้อมอนุมัติ", status: "REV D-07" },
      body: {
        project: "บ้านสุขุมวิท 49 · ครัวหลัก", revision: "D-07",
        requester: "พิม · Senior Designer", amount: "฿486,000",
        deadline: "3 ส.ค. 2026 · 18:00",
        summary: "ตรวจ revision และผลกระทบก่อนยืนยัน",
        trustNote: "ระบบจะไม่เปลี่ยนสถานะจนกว่าคุณยืนยันในพื้นที่ส่วนตัว"
      },
      footer: { primaryLabel: "เปิดดูแบบและยืนยัน", secondaryLabel: "" },
      altText: "แบบครัว revision D-07 พร้อมให้ตรวจและยืนยัน"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Design ready for review", status: "REV D-07" },
      body: {
        project: "Sukhumvit 49 Residence · Main Kitchen", revision: "D-07",
        requester: "Pim · Senior Designer", amount: "THB 486,000",
        deadline: "3 Aug 2026 · 18:00",
        summary: "Review the revision and consequences before confirming",
        trustNote: "No business state changes until you confirm in the private review"
      },
      footer: { primaryLabel: "Review and confirm", secondaryLabel: "" },
      altText: "Kitchen design revision D-07 is ready for review"
    }
  }),
  makePreset({
    id: "quote-order",
    audience: "customer",
    asset: "quote-order-hero.svg",
    canonicalAction: "commerce.submit_order_intent",
    risk: "high",
    requestedActionType: "liff_uri",
    targetRef: "quote_q-2026-081",
    expiresInMinutes: 2880,
    correlationPrefix: "LFS-ORDER",
    description: "Material cards and quote document",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "ใบเสนอราคาพร้อมตรวจ", status: "QUOTE Q-2026-081" },
      body: {
        project: "บ้านสุขุมวิท 49 · Built-in package", revision: "Q-03",
        requester: "เมย์ · Sales Consultant", amount: "฿1,280,000",
        deadline: "5 ส.ค. 2026 · 18:00",
        summary: "ตรวจราคา ขอบเขต ตัวเลือก และเงื่อนไขก่อนส่งคำสั่งซื้อ",
        trustNote: "ข้อความในแชตไม่ถือเป็น order จนกว่าคุณยืนยันข้อมูลแบบมีโครงสร้าง"
      },
      footer: { primaryLabel: "ตรวจราคาและสั่งซื้อ", secondaryLabel: "ให้ Sale ติดต่อ" },
      altText: "ใบเสนอราคา Q-2026-081 พร้อมให้ตรวจ"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Quote ready for review", status: "QUOTE Q-2026-081" },
      body: {
        project: "Sukhumvit 49 Residence · Built-in package", revision: "Q-03",
        requester: "May · Sales Consultant", amount: "THB 1,280,000",
        deadline: "5 Aug 2026 · 18:00",
        summary: "Review price, scope, options and terms before submitting an order",
        trustNote: "Chat text is not an order until structured details are confirmed"
      },
      footer: { primaryLabel: "Review quote and order", secondaryLabel: "Ask Sales to contact me" },
      altText: "Quote Q-2026-081 is ready for review"
    }
  }),
  makePreset({
    id: "sla-escalation",
    audience: "internal",
    asset: "sla-escalation-hero.svg",
    canonicalAction: "workflow.acknowledge_sla",
    risk: "low",
    requestedActionType: "postback",
    targetRef: "work_item_314",
    expiresInMinutes: 240,
    correlationPrefix: "LFS-SLA",
    description: "Calm SLA clock and workflow lane",
    th: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "งานใกล้เกิน SLA", status: "47 นาที" },
      body: {
        project: "งาน #314 · อนุมัติสั่งฮาร์ดแวร์", revision: "WORK-314",
        requester: "Procurement Queue", amount: "วงเงิน ฿32,800",
        deadline: "วันนี้ · 21:00",
        summary: "รับทราบได้จากการ์ด; การอนุมัติวงเงินต้องเปิดงานและยืนยันสิทธิ์",
        trustNote: "Acknowledgement ไม่เปลี่ยน workflow state"
      },
      footer: { primaryLabel: "รับทราบ SLA", secondaryLabel: "เปิดงาน" },
      altText: "งาน 314 เหลือ 47 นาทีก่อนเกิน SLA"
    },
    en: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "Work item nearing SLA", status: "47 MIN" },
      body: {
        project: "Work #314 · Hardware purchase approval", revision: "WORK-314",
        requester: "Procurement Queue", amount: "Limit THB 32,800",
        deadline: "Today · 21:00",
        summary: "Acknowledge here; open the work item to approve the amount",
        trustNote: "Acknowledgement does not change workflow state"
      },
      footer: { primaryLabel: "Acknowledge SLA", secondaryLabel: "Open work item" },
      altText: "Work item 314 has 47 minutes before SLA breach"
    }
  }),
  makePreset({
    id: "site-update",
    audience: "customer_group",
    asset: "site-update-hero.svg",
    canonicalAction: "field.view_curated_update",
    risk: "low",
    requestedActionType: "uri",
    targetRef: "site_update_2026-08-01",
    expiresInMinutes: 10080,
    correlationPrefix: "LFS-SITE",
    description: "Curated site progress frames",
    th: {
      header: { eyebrow: "DAPH STUDIO", title: "อัปเดตหน้างานที่คัดแล้ว", status: "68% COMPLETE" },
      body: {
        project: "บ้านสุขุมวิท 49 · ชั้น 1", revision: "SITE-2026-08-01",
        requester: "นัท · Site Lead", amount: "เสร็จ 11 จาก 16 เลน",
        deadline: "อัปเดตถัดไป 2 ส.ค. · 17:00",
        summary: "รูปชุดนี้ผ่านการคัดสำหรับกลุ่มลูกค้าแล้ว",
        trustNote: "ระบบไม่ส่งต่อรูปจากกลุ่มทีมโดยอัตโนมัติ"
      },
      footer: { primaryLabel: "ดูความคืบหน้าที่คัดแล้ว", secondaryLabel: "" },
      altText: "อัปเดตหน้างานชั้น 1 ที่คัดแล้ว เสร็จ 68 เปอร์เซ็นต์"
    },
    en: {
      header: { eyebrow: "DAPH STUDIO", title: "Curated site update", status: "68% COMPLETE" },
      body: {
        project: "Sukhumvit 49 Residence · Level 1", revision: "SITE-2026-08-01",
        requester: "Nut · Site Lead", amount: "11 of 16 lanes complete",
        deadline: "Next update 2 Aug · 17:00",
        summary: "This evidence set has been curated for the customer group",
        trustNote: "Internal team photos are never forwarded automatically"
      },
      footer: { primaryLabel: "View curated progress", secondaryLabel: "" },
      altText: "Curated Level 1 site update, 68 percent complete"
    }
  }),
  makePreset({
    id: "issue-evidence",
    audience: "internal_group",
    asset: "issue-evidence-hero.svg",
    canonicalAction: "evidence.acknowledge_issue",
    risk: "low",
    requestedActionType: "postback",
    targetRef: "issue_042",
    expiresInMinutes: 1440,
    correlationPrefix: "LFS-ISSUE",
    description: "Evidence frame and quarantine boundary",
    th: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "รับหลักฐานปัญหาแล้ว", status: "QUARANTINE" },
      body: {
        project: "บ้านสุขุมวิท 49 · ห้องครัว", revision: "ISS-042",
        requester: "LINE Group · ผู้ส่งยังไม่ผูกตัวตน", amount: "ระดับ P2 · รอตรวจ",
        deadline: "Review ภายใน 2 ชม.",
        summary: "รูปถูกเก็บพร้อม source และ provenance แต่ยังไม่เปลี่ยน workflow",
        trustNote: "มนุษย์ต้อง promote หรือ reject หลังยืนยัน actor และ project"
      },
      footer: { primaryLabel: "รับเรื่องและเปิดคิวตรวจ", secondaryLabel: "" },
      altText: "หลักฐานปัญหา ISS-042 อยู่ใน quarantine รอตรวจ"
    },
    en: {
      header: { eyebrow: "MONOLITH · DAPH STUDIO", title: "Issue evidence received", status: "QUARANTINE" },
      body: {
        project: "Sukhumvit 49 Residence · Kitchen", revision: "ISS-042",
        requester: "LINE Group · Unbound sender", amount: "P2 · Review required",
        deadline: "Review within 2 hours",
        summary: "Evidence is stored with provenance but has not changed workflow",
        trustNote: "A human must promote or reject after actor and project verification"
      },
      footer: { primaryLabel: "Acknowledge and review", secondaryLabel: "" },
      altText: "Issue evidence ISS-042 is quarantined for review"
    }
  })
];

export const PRESETS = deepFreeze(Object.fromEntries(entries.map((item) => [item.id, item])));

export function getPreset(id) {
  const preset = PRESETS[id];
  if (!preset) throw new Error("unknown_preset");
  return preset;
}
```

- [ ] **Step 5: Run the model tests and observe GREEN**

Run:

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-model.test.mjs
```

Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- LineOS/package.json LineOS/line-flex-model.mjs LineOS/line-flex-presets.mjs LineOS/tests/line-flex-model.test.mjs
git commit -m "feat(lineos): add immutable Flex Studio presets"
```

---

### Task 2: Deterministic Flex JSON and source-labelled validation

**Files:**
- Create: **LineOS/line-flex-json.mjs**
- Create: **LineOS/line-flex-validator.mjs**
- Test: **LineOS/tests/line-flex-json-validator.test.mjs**

**Interfaces:**
- Consumes: FlexDraft from Task 1.
- Produces: **buildFlexMessage(draft)** returning a Flex message envelope.
- Produces: **measureUtf8Bytes(value)**.
- Produces: **VALIDATION_RULES** and **validateDraft(draft, message)** returning ordered findings.
- Finding shape: **{ ruleId, severity, block, field, classification, sourceUrl, title, explanation, remediation }**.

- [ ] **Step 1: Write failing JSON and validation tests**

Create **LineOS/tests/line-flex-json-validator.test.mjs**:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDraft, updateDraftAtPath } from "../line-flex-model.mjs";
import { getPreset } from "../line-flex-presets.mjs";
import { buildFlexMessage, measureUtf8Bytes } from "../line-flex-json.mjs";
import { validateDraft } from "../line-flex-validator.mjs";

const draft = () => createDraft(getPreset("design-approval"), "th");

test("builds deterministic Header Hero Body Footer JSON", () => {
  const first = buildFlexMessage(draft());
  const second = buildFlexMessage(draft());
  assert.deepEqual(first, second);
  assert.equal(first.type, "flex");
  assert.equal(first.contents.type, "bubble");
  assert.deepEqual(
    ["header", "hero", "body", "footer"].filter((key) => first.contents[key]),
    ["header", "hero", "body", "footer"]
  );
});

test("measures the bubble as UTF-8 and accepts the approved preset", () => {
  const message = buildFlexMessage(draft());
  assert.ok(measureUtf8Bytes(message.contents) < 24 * 1024);
  assert.equal(validateDraft(draft(), message).some((f) => f.severity === "error"), false);
});

test("blocks a high-risk postback and cites it as MONOLITH best practice", () => {
  const unsafe = updateDraftAtPath(draft(), ["intent", "requestedActionType"], "postback");
  const findings = validateDraft(unsafe, buildFlexMessage(unsafe));
  const finding = findings.find((item) => item.ruleId === "MON-ACT-001");
  assert.equal(finding.severity, "error");
  assert.equal(finding.classification, "monolith_best_practice");
});

test("blocks official alt text, URL and label limits", () => {
  let invalid = updateDraftAtPath(draft(), ["altText"], "x".repeat(1501));
  invalid = updateDraftAtPath(invalid, ["hero", "exportUrl"], "http://unsafe.test/image.png");
  invalid = updateDraftAtPath(invalid, ["footer", "primaryLabel"], "x".repeat(41));
  const ids = validateDraft(invalid, buildFlexMessage(invalid)).map((f) => f.ruleId);
  assert.ok(ids.includes("LINE-ALT-002"));
  assert.ok(ids.includes("LINE-IMG-001"));
  assert.ok(ids.includes("LINE-BTN-001"));
});

test("warns at the 24 KB MONOLITH soft budget and errors at the 30 KB official ceiling", () => {
  const message = buildFlexMessage(draft());
  const soft = structuredClone(message);
  soft.contents.body.contents.push({ type: "text", text: "x".repeat(25000), wrap: true });
  const hard = structuredClone(message);
  hard.contents.body.contents.push({ type: "text", text: "x".repeat(33000), wrap: true });
  assert.ok(validateDraft(draft(), soft).some((f) => f.ruleId === "MON-SIZE-001"));
  assert.ok(validateDraft(draft(), hard).some((f) => f.ruleId === "LINE-SIZE-001"));
});
```

- [ ] **Step 2: Run the tests and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-json-validator.test.mjs
```

Expected: FAIL because JSON and validator modules do not exist.

- [ ] **Step 3: Implement the supported Flex JSON subset**

Create **LineOS/line-flex-json.mjs** with:

```js
const actionFor = (draft) => {
  const type = draft.intent.requestedActionType;
  if (type === "postback") {
    return { type: "postback", label: draft.footer.primaryLabel,
      data: "intent=" + encodeURIComponent(draft.presetId) };
  }
  if (type === "message") {
    return { type: "message", label: draft.footer.primaryLabel,
      text: draft.footer.primaryLabel };
  }
  return { type: "uri", label: draft.footer.primaryLabel,
    uri: "https://example.com/monolith/demo/" + encodeURIComponent(draft.presetId) };
};

const factRow = (label, value) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: "sm", color: "#667871", flex: 2 },
    { type: "text", text: value, size: "sm", color: "#173B35",
      weight: "bold", wrap: true, align: "end", flex: 3 }
  ]
});

export function buildFlexMessage(draft) {
  return {
    type: "flex",
    altText: draft.altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: draft.header.eyebrow, size: "xs", color: "#69817B" },
          { type: "text", text: draft.header.title, weight: "bold", size: "lg", wrap: true },
          { type: "text", text: draft.header.status, size: "xs", color: "#0E6B5B" }
        ]
      },
      hero: {
        type: "image",
        url: draft.hero.exportUrl,
        size: "full",
        aspectRatio: draft.hero.aspectRatio,
        aspectMode: draft.hero.aspectMode
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: draft.body.project, weight: "bold", size: "xl", wrap: true },
          factRow(draft.language === "th" ? "Revision" : "Revision", draft.body.revision),
          factRow(draft.language === "th" ? "ผู้ส่ง" : "Requested by", draft.body.requester),
          factRow(draft.language === "th" ? "มูลค่า/ขอบเขต" : "Amount / scope", draft.body.amount),
          factRow(draft.language === "th" ? "ภายใน" : "Due", draft.body.deadline),
          { type: "text", text: draft.body.summary, wrap: true, color: "#526862" },
          { type: "text", text: draft.body.trustNote, wrap: true, size: "xs", color: "#756743" }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#0E6B5B", action: actionFor(draft) }
        ]
      }
    }
  };
}

export function measureUtf8Bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
```

- [ ] **Step 4: Implement the validation registry**

Create **LineOS/line-flex-validator.mjs** with an immutable registry for these exact rules:

| Rule ID | Severity | Classification | Condition |
|---|---|---|---|
| LINE-ALT-001 | error | official_constraint | altText empty |
| LINE-ALT-002 | error | official_constraint | altText over 1,500 UTF-16 code units |
| LINE-SIZE-001 | error | official_constraint | bubble JSON over 30 KB UTF-8 |
| LINE-IMG-001 | error | official_constraint | image URL not HTTPS |
| LINE-IMG-002 | error | official_constraint | image URL over 2,000 characters |
| LINE-BTN-001 | error | official_constraint | button label empty or over 40 characters |
| LINE-POSTBACK-001 | error | official_constraint | postback data over 300 characters |
| LINE-MESSAGE-001 | error | official_constraint | message text over 300 characters |
| LINE-URI-001 | error | official_constraint | URI over 1,000 characters |
| MON-SIZE-001 | warning | monolith_best_practice | bubble JSON over 24 KB and at most 30 KB |
| MON-ACT-001 | error | monolith_best_practice | high-risk action requests postback or message |
| MON-CTA-001 | warning | monolith_best_practice | more than one dominant CTA |
| MON-TRUST-001 | warning | monolith_best_practice | revision, deadline, requester, audience or trust note absent |
| MON-MEDIA-001 | guidance | monolith_best_practice | remote export URL is not fetched by the standalone preview |
| MON-PROD-001 | guidance | monolith_best_practice | production action requires Trust Kernel |

Use these official source URLs in registry metadata:

- https://developers.line.biz/en/reference/messaging-api/
- https://developers.line.biz/en/docs/messaging-api/flex-message-elements/
- https://developers.line.biz/en/docs/messaging-api/actions/

The evaluator must translate title, explanation and remediation from rule copy in **th** and **en**, sort errors before warnings before guidance, then by rule ID.

Use this complete evaluator shape so every rule remains source-labelled and deterministic:

```js
import { deepFreeze } from "./line-flex-model.mjs";
import { measureUtf8Bytes } from "./line-flex-json.mjs";

const LINE_REFERENCE = "https://developers.line.biz/en/reference/messaging-api/";
const FLEX_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/flex-message-elements/";
const ACTION_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/actions/";
const MONOLITH_REFERENCE =
  "./docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.html";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const primaryAction = (message) => message.contents.footer.contents[0].action;
const missingTrustField = (draft) => [
  draft.body.revision, draft.body.deadline, draft.body.requester,
  draft.context.audience, draft.body.trustNote
].some(isBlank);

const rule = (ruleId, severity, classification, block, field, sourceUrl, when) => ({
  ruleId, severity, classification, block, field, sourceUrl, when
});

export const VALIDATION_RULES = deepFreeze([
  rule("LINE-ALT-001", "error", "official_constraint", "header", "altText", LINE_REFERENCE,
    (draft) => isBlank(draft.altText)),
  rule("LINE-ALT-002", "error", "official_constraint", "header", "altText", LINE_REFERENCE,
    (draft) => draft.altText.length > 1500),
  rule("LINE-SIZE-001", "error", "official_constraint", "body", "body.summary", FLEX_REFERENCE,
    (_draft, message) => measureUtf8Bytes(message.contents) > 30 * 1024),
  rule("LINE-IMG-001", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE,
    (draft) => !/^https:\/\//i.test(draft.hero.exportUrl)),
  rule("LINE-IMG-002", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE,
    (draft) => draft.hero.exportUrl.length > 2000),
  rule("LINE-BTN-001", "error", "official_constraint", "footer", "footer.primaryLabel", FLEX_REFERENCE,
    (draft) => isBlank(draft.footer.primaryLabel) || draft.footer.primaryLabel.length > 40),
  rule("LINE-POSTBACK-001", "error", "official_constraint", "footer", "action.data", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message).type === "postback" &&
      primaryAction(message).data.length > 300),
  rule("LINE-MESSAGE-001", "error", "official_constraint", "footer", "action.text", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message).type === "message" &&
      primaryAction(message).text.length > 300),
  rule("LINE-URI-001", "error", "official_constraint", "footer", "action.uri", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message).type === "uri" &&
      primaryAction(message).uri.length > 1000),
  rule("MON-SIZE-001", "warning", "monolith_best_practice", "body", "body.summary",
    MONOLITH_REFERENCE, (_draft, message) => {
      const bytes = measureUtf8Bytes(message.contents);
      return bytes > 24 * 1024 && bytes <= 30 * 1024;
    }),
  rule("MON-ACT-001", "error", "monolith_best_practice", "footer", "intent.requestedActionType",
    MONOLITH_REFERENCE, (draft) => draft.intent.risk === "high" &&
      ["postback", "message"].includes(draft.intent.requestedActionType)),
  rule("MON-CTA-001", "warning", "monolith_best_practice", "footer", "footer.secondaryLabel",
    MONOLITH_REFERENCE, (draft) => !isBlank(draft.footer.secondaryLabel)),
  rule("MON-TRUST-001", "warning", "monolith_best_practice", "body", "body.trustNote",
    MONOLITH_REFERENCE, missingTrustField),
  rule("MON-MEDIA-001", "guidance", "monolith_best_practice", "hero", "localAsset",
    MONOLITH_REFERENCE, (draft) => !isBlank(draft.hero.localAsset)),
  rule("MON-PROD-001", "guidance", "monolith_best_practice", "footer", "canonicalAction",
    MONOLITH_REFERENCE, (draft) => draft.intent.risk === "high")
]);

const TITLES = deepFreeze({
  en: {
    "LINE-ALT-001": "Alt text is required", "LINE-ALT-002": "Alt text exceeds 1,500 characters",
    "LINE-SIZE-001": "Flex bubble exceeds 30 KB", "LINE-IMG-001": "Hero URL must use HTTPS",
    "LINE-IMG-002": "Hero URL exceeds 2,000 characters", "LINE-BTN-001": "Button label is invalid",
    "LINE-POSTBACK-001": "Postback data exceeds 300 characters",
    "LINE-MESSAGE-001": "Message action text exceeds 300 characters",
    "LINE-URI-001": "URI action exceeds 1,000 characters",
    "MON-SIZE-001": "Payload exceeds the MONOLITH 24 KB budget",
    "MON-ACT-001": "Consequential action cannot use chat or postback",
    "MON-CTA-001": "The card has more than one dominant CTA",
    "MON-TRUST-001": "Required trust context is incomplete",
    "MON-MEDIA-001": "Preview uses a local hero substitute",
    "MON-PROD-001": "Production confirmation requires the Trust Kernel"
  },
  th: {
    "LINE-ALT-001": "ต้องมีข้อความสำรอง", "LINE-ALT-002": "ข้อความสำรองเกิน 1,500 ตัวอักษร",
    "LINE-SIZE-001": "Flex bubble เกิน 30 KB", "LINE-IMG-001": "URL ภาพ Hero ต้องใช้ HTTPS",
    "LINE-IMG-002": "URL ภาพ Hero เกิน 2,000 ตัวอักษร", "LINE-BTN-001": "ข้อความบนปุ่มไม่ถูกต้อง",
    "LINE-POSTBACK-001": "ข้อมูล postback เกิน 300 ตัวอักษร",
    "LINE-MESSAGE-001": "ข้อความของ message action เกิน 300 ตัวอักษร",
    "LINE-URI-001": "URI action เกิน 1,000 ตัวอักษร",
    "MON-SIZE-001": "Payload เกินงบ 24 KB ของ MONOLITH",
    "MON-ACT-001": "Action ที่มีผลต่อธุรกิจห้ามยืนยันผ่านแชตหรือ postback",
    "MON-CTA-001": "การ์ดมีปุ่มหลักมากกว่าหนึ่งปุ่ม",
    "MON-TRUST-001": "บริบทเพื่อความน่าเชื่อถือยังไม่ครบ",
    "MON-MEDIA-001": "Preview ใช้ภาพ Hero ภายในเครื่องแทน",
    "MON-PROD-001": "การยืนยันจริงต้องผ่าน Trust Kernel"
  }
});

const EXPLANATION = deepFreeze({
  en: {
    official_constraint: "The generated payload violates a documented LINE Messaging API constraint.",
    monolith_best_practice: "The configuration violates an approved MONOLITH safety or usability rule."
  },
  th: {
    official_constraint: "Payload ที่สร้างขึ้นขัดกับข้อจำกัดในเอกสาร LINE Messaging API",
    monolith_best_practice: "การตั้งค่านี้ขัดกับกติกาความปลอดภัยหรือการใช้งานของ MONOLITH ที่อนุมัติแล้ว"
  }
});

const REMEDIATION = deepFreeze({
  en: {
    official_constraint: "Edit the named field until it is inside the documented limit.",
    monolith_best_practice: "Use the recommended MONOLITH route or restore the required context."
  },
  th: {
    official_constraint: "แก้ฟิลด์ที่ระบุให้อยู่ภายในขีดจำกัดตามเอกสาร",
    monolith_best_practice: "ใช้เส้นทางที่ MONOLITH แนะนำหรือเติมบริบทที่จำเป็นให้ครบ"
  }
});

export function validateDraft(draft, message) {
  const language = draft.language === "en" ? "en" : "th";
  const rank = { error: 0, warning: 1, guidance: 2 };
  return VALIDATION_RULES
    .filter((item) => item.when(draft, message))
    .map(({ when: _when, ...item }) => ({
      ...item,
      title: TITLES[language][item.ruleId],
      explanation: EXPLANATION[language][item.classification],
      remediation: REMEDIATION[language][item.classification]
    }))
    .sort((left, right) => rank[left.severity] - rank[right.severity] ||
      left.ruleId.localeCompare(right.ruleId));
}
```

- [ ] **Step 5: Run the focused and full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-json-validator.test.mjs
npm.cmd --prefix LineOS run test
```

Expected: focused suite PASS 5/5; full suite PASS with 0 failures.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- LineOS/line-flex-json.mjs LineOS/line-flex-validator.mjs LineOS/tests/line-flex-json-validator.test.mjs
git commit -m "feat(lineos): generate and validate Flex JSON"
```

---

### Task 3: Risk-aware actions, bound demo transactions and truthful receipts

**Files:**
- Create: **LineOS/line-flex-actions.mjs**
- Create: **LineOS/line-flex-receipt.mjs**
- Test: **LineOS/tests/line-flex-actions-receipt.test.mjs**

**Interfaces:**
- Consumes: canonical FlexDraft from Task 1.
- Produces: **selectActionMode(intent)** returning message, postback, uri or liff_uri.
- Produces: **createDemoTransaction(draft, options)**.
- Produces: **confirmDemoTransaction(transaction, currentDraft, now)**.
- Produces: **createDemoReceipt(transaction, confirmation)** returning a digest-bearing demo receipt.

- [ ] **Step 1: Write the failing action and receipt tests**

Create **LineOS/tests/line-flex-actions-receipt.test.mjs**:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDraft, updateDraftAtPath } from "../line-flex-model.mjs";
import { getPreset } from "../line-flex-presets.mjs";
import {
  selectActionMode, createDemoTransaction, confirmDemoTransaction
} from "../line-flex-actions.mjs";
import { createDemoReceipt } from "../line-flex-receipt.mjs";

const approval = () => createDraft(getPreset("design-approval"), "th");

test("routes every consequential action through LIFF URI", () => {
  assert.equal(selectActionMode({ risk: "high", requestedActionType: "postback" }), "liff_uri");
  assert.equal(selectActionMode({ risk: "high", requestedActionType: "message" }), "liff_uri");
});

test("allows low-risk acknowledgement postback", () => {
  assert.equal(selectActionMode({ risk: "low", requestedActionType: "postback" }), "postback");
});

test("binds tenant recipient revision action and expiry", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_001",
    now: "2026-08-01T10:00:00.000Z"
  });
  assert.equal(tx.tenantId, "tenant_daph_demo");
  assert.equal(tx.recipientRef, "customer_demo_001");
  assert.equal(tx.revision, "D-07");
  assert.equal(tx.canonicalAction, "design.approve_revision");
  assert.equal(tx.expiresAt, "2026-08-02T10:00:00.000Z");
});

test("fails closed when revision changes or transaction expires", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_002",
    now: "2026-08-01T10:00:00.000Z"
  });
  const changed = updateDraftAtPath(approval(), ["body", "revision"], "D-08");
  assert.throws(() => confirmDemoTransaction(tx, changed, "2026-08-01T11:00:00.000Z"),
    /bound_value_changed/);
  assert.throws(() => confirmDemoTransaction(tx, approval(), "2026-08-02T10:00:01.000Z"),
    /transaction_expired/);
});

test("creates a labelled deterministic digest and changes on bound input", async () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_003",
    now: "2026-08-01T10:00:00.000Z"
  });
  const confirmed = confirmDemoTransaction(tx, approval(), "2026-08-01T11:00:00.000Z");
  const first = await createDemoReceipt(tx, confirmed);
  const second = await createDemoReceipt(tx, confirmed);
  assert.equal(first.digest, second.digest);
  assert.equal(first.label, "DEMO — NOT A PRODUCTION SIGNATURE");
  const changed = { ...confirmed, recipientRef: "customer_demo_002" };
  assert.notEqual(first.digest, (await createDemoReceipt(tx, changed)).digest);
});
```

- [ ] **Step 2: Run the tests and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-actions-receipt.test.mjs
```

Expected: FAIL because action and receipt modules do not exist.

- [ ] **Step 3: Implement action selection and bound transaction checks**

Create **LineOS/line-flex-actions.mjs**:

```js
import { canonicalize } from "./line-flex-model.mjs";

export function selectActionMode(intent) {
  if (intent.risk === "high") return "liff_uri";
  return intent.requestedActionType;
}

const digestInputFor = (draft) => ({
  tenantId: draft.context.tenantId,
  recipientRef: draft.context.recipientRef,
  targetRef: draft.intent.targetRef,
  revision: draft.body.revision,
  canonicalAction: draft.intent.canonicalAction,
  amount: draft.body.amount,
  deadline: draft.body.deadline
});

export function createDemoTransaction(draft, options = {}) {
  const createdAt = options.now ?? new Date().toISOString();
  const ttl = draft.intent.expiresInMinutes;
  const expiresAt = new Date(Date.parse(createdAt) + ttl * 60_000).toISOString();
  const input = digestInputFor(draft);
  return {
    id: options.id ?? crypto.randomUUID(),
    ...input,
    actionMode: selectActionMode(draft.intent),
    createdAt,
    expiresAt,
    boundPayload: canonicalize(input)
  };
}

export function confirmDemoTransaction(transaction, currentDraft, now = new Date().toISOString()) {
  if (Date.parse(now) > Date.parse(transaction.expiresAt)) {
    throw new Error("transaction_expired");
  }
  const current = canonicalize(digestInputFor(currentDraft));
  if (current !== transaction.boundPayload) throw new Error("bound_value_changed");
  return {
    transactionId: transaction.id,
    tenantId: transaction.tenantId,
    recipientRef: transaction.recipientRef,
    targetRef: transaction.targetRef,
    revision: transaction.revision,
    canonicalAction: transaction.canonicalAction,
    confirmedAt: now,
    outcome: "confirmed_demo"
  };
}
```

- [ ] **Step 4: Implement deterministic SHA-256 demo receipts**

Create **LineOS/line-flex-receipt.mjs**:

```js
import { canonicalize } from "./line-flex-model.mjs";

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function createDemoReceipt(transaction, confirmation) {
  const payload = {
    receiptVersion: 1,
    transactionId: transaction.id,
    tenantId: confirmation.tenantId,
    recipientRef: confirmation.recipientRef,
    targetRef: confirmation.targetRef,
    revision: confirmation.revision,
    canonicalAction: confirmation.canonicalAction,
    createdAt: transaction.createdAt,
    confirmedAt: confirmation.confirmedAt,
    outcome: confirmation.outcome
  };
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digest = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  return {
    label: "DEMO — NOT A PRODUCTION SIGNATURE",
    platform: "MONOLITH",
    ...payload,
    digest,
    productionNotice: "Production signing and audit require the MONOLITH Trust Kernel."
  };
}
```

- [ ] **Step 5: Run focused and full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-actions-receipt.test.mjs
npm.cmd --prefix LineOS run test
```

Expected: focused suite PASS 5/5; full suite PASS with 0 failures.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- LineOS/line-flex-actions.mjs LineOS/line-flex-receipt.mjs LineOS/tests/line-flex-actions-receipt.test.mjs
git commit -m "feat(lineos): add safe demo approval receipts"
```

---

### Task 4: Semantic Studio Console shell and local Trust Concierge assets

**Files:**
- Create: **LineOS/line-flex-studio.html**
- Create: **LineOS/line-flex-studio.css**
- Create: **LineOS/assets/line-flex-studio/design-approval-hero.svg**
- Create: **LineOS/assets/line-flex-studio/quote-order-hero.svg**
- Create: **LineOS/assets/line-flex-studio/sla-escalation-hero.svg**
- Create: **LineOS/assets/line-flex-studio/site-update-hero.svg**
- Create: **LineOS/assets/line-flex-studio/issue-evidence-hero.svg**
- Test: **LineOS/tests/line-flex-structure.test.mjs**

**Interfaces:**
- HTML exposes stable IDs used by Task 5: **language-toggle**, **tenant-context**, **preset-list**, **block-tabs**, **field-panel**, **phone-preview**, **json-output**, **validation-list**, **payload-count**, **copy-json**, **download-json**, **reset-draft**, **run-journey**, **liff-dialog**, **receipt-dialog**, **toast-live**.
- All SVGs are local, text-free visual assets with no external references.
- HTML loads only **line-flex-studio.css** and **line-flex-studio.mjs** from local relative paths.

- [ ] **Step 1: Write the failing structural contract test**

Create **LineOS/tests/line-flex-structure.test.mjs**:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("Studio shell exposes semantic controls and dialogs", async () => {
  const html = await read("line-flex-studio.html");
  for (const id of [
    "language-toggle", "tenant-context", "preset-list", "block-tabs", "field-panel",
    "phone-preview", "json-output", "validation-list", "payload-count",
    "copy-json", "download-json", "reset-draft", "run-journey",
    "liff-dialog", "receipt-dialog", "toast-live"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /<main/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<dialog[^>]+id="liff-dialog"/);
  assert.match(html, /<script type="module" src="\.\/line-flex-studio\.mjs"/);
});

test("runtime shell has no remote scripts styles fonts or tracking", async () => {
  const html = await read("line-flex-studio.html");
  const css = await read("line-flex-studio.css");
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /analytics|segment|pixel|gtag/i);
  assert.doesNotMatch(css, /@import|url\(["']?https?:\/\//i);
});

test("all five local SVG assets are self-contained", async () => {
  for (const name of [
    "design-approval-hero.svg", "quote-order-hero.svg", "sla-escalation-hero.svg",
    "site-update-hero.svg", "issue-evidence-hero.svg"
  ]) {
    const svg = await read("assets/line-flex-studio/" + name);
    assert.match(svg, /^<svg/);
    assert.doesNotMatch(svg, /https?:\/\/|<script|foreignObject/i);
    assert.match(svg, /aria-hidden="true"/);
  }
});
```

- [ ] **Step 2: Run the structural test and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
```

Expected: FAIL because the HTML, CSS and assets do not exist.

- [ ] **Step 3: Create the semantic application shell**

Create **LineOS/line-flex-studio.html** with this hierarchy:

```html
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>MONOLITH · LINE Flex Studio</title>
  <link rel="stylesheet" href="./line-flex-studio.css">
</head>
<body>
  <a class="skip-link" href="#studio-main">ข้ามไปพื้นที่ทำงาน</a>
  <header class="app-header">
    <div class="platform-brand"><span class="platform-mark">M</span>
      <span><b>MONOLITH</b><small>LINE Flex Studio</small></span></div>
    <div id="tenant-context" class="tenant-context" aria-label="Current tenant"></div>
    <button id="language-toggle" type="button" aria-pressed="false">TH / EN</button>
  </header>
  <main id="studio-main" class="studio-grid">
    <section class="editor-pane" aria-labelledby="editor-title">
      <h1 id="editor-title">Flex Message Studio</h1>
      <div id="preset-list" role="list" aria-label="Message presets"></div>
      <div id="block-tabs" role="tablist" aria-label="Flex blocks"></div>
      <form id="field-panel" novalidate></form>
    </section>
    <section class="preview-pane" aria-labelledby="preview-title">
      <div class="pane-title"><h2 id="preview-title">LINE Preview</h2>
        <div id="viewport-switcher" role="group" aria-label="Preview width"></div></div>
      <div class="phone-frame"><div id="phone-preview"></div></div>
      <button id="run-journey" type="button">Run Journey</button>
    </section>
    <section class="code-pane" aria-labelledby="json-title">
      <div class="pane-title"><h2 id="json-title">JSON Preview</h2>
        <output id="payload-count"></output></div>
      <pre><code id="json-output"></code></pre>
      <div class="button-row">
        <button id="copy-json" type="button">Copy JSON</button>
        <button id="download-json" type="button">Download JSON</button>
        <button id="reset-draft" type="button">Reset</button>
      </div>
      <h2>Validation</h2>
      <ol id="validation-list"></ol>
    </section>
  </main>
  <dialog id="liff-dialog" aria-labelledby="liff-title">
    <h2 id="liff-title">Private review · Demo</h2>
    <div data-liff-review></div>
    <div class="button-row"><button value="cancel">Cancel</button>
      <button data-confirm-demo value="confirm">Confirm demo intent</button></div>
  </dialog>
  <dialog id="receipt-dialog" aria-labelledby="receipt-title">
    <h2 id="receipt-title">Verification Receipt — Demo</h2>
    <div data-receipt></div><button data-close-receipt>Close</button>
  </dialog>
  <p id="toast-live" class="sr-only" aria-live="polite"></p>
  <script type="module" src="./line-flex-studio.mjs"></script>
</body>
</html>
```

- [ ] **Step 4: Implement Trust Concierge layout and responsive behavior**

Create **LineOS/line-flex-studio.css** with exact token intent:

```css
:root{
  --ink:#173b35;--muted:#667871;--platform:#123f37;--action:#0e6b5b;
  --action-hover:#0a594d;--warm:#f4efe7;--attention:#c6942d;
  --surface:#ffffff;--canvas:#eef4f1;--border:#d6e3de;--danger:#a33f34;
  --radius:14px;--shadow:0 18px 48px rgba(22,61,52,.14);
  font-family:Inter,"Noto Sans Thai","Segoe UI",Tahoma,sans-serif;
  color:var(--ink);background:var(--canvas)
}
*{box-sizing:border-box}
body{margin:0;min-width:320px;background:var(--canvas)}
button,input,textarea,select{font:inherit}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,
[role=tab]:focus-visible{outline:3px solid #f0b94d;outline-offset:2px}
.skip-link{position:fixed;left:1rem;top:-5rem;z-index:100;background:#fff;padding:.7rem}
.skip-link:focus{top:1rem}
.app-header{min-height:68px;padding:12px 18px;background:var(--platform);color:#fff;
  display:flex;align-items:center;gap:18px;justify-content:space-between}
.platform-brand{display:flex;gap:10px;align-items:center}.platform-brand small{display:block;opacity:.7}
.platform-mark{width:38px;height:38px;border-radius:12px;background:#fff;color:var(--platform);
  display:grid;place-items:center;font-weight:900}
.studio-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,.85fr)
  minmax(300px,1.1fr);gap:10px;padding:10px;min-height:calc(100vh - 68px)}
.studio-grid>section{background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:16px;min-width:0}
.preview-pane{background:#dfe9e5!important;display:flex;flex-direction:column;align-items:center}
.phone-frame{width:min(360px,100%);background:#1d2723;border-radius:34px;padding:10px;
  box-shadow:var(--shadow)}#phone-preview{min-height:610px;background:#fff;border-radius:25px;overflow:hidden}
.code-pane pre{max-height:52vh;overflow:auto;background:#16221d;color:#cbe7df;
  border-radius:10px;padding:14px;white-space:pre-wrap;word-break:break-word}
.button-row{display:flex;gap:8px;flex-wrap:wrap}
button{min-height:44px;border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:#fff}
#run-journey,[data-confirm-demo]{background:var(--action);color:#fff;border-color:var(--action)}
dialog{width:min(620px,calc(100% - 28px));border:0;border-radius:18px;box-shadow:var(--shadow)}
dialog::backdrop{background:rgba(10,25,21,.62)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:1000px){.studio-grid{grid-template-columns:1fr 1fr}.code-pane{grid-column:1/-1}}
@media(max-width:720px){.studio-grid{display:block}.studio-grid>section{margin-bottom:10px}
  .app-header{align-items:flex-start;flex-wrap:wrap}.phone-frame{width:360px;max-width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;
  animation-duration:.01ms!important;transition-duration:.01ms!important}}
```

Continue the same file with these component and state styles:

```css
#preset-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
.preset-card{text-align:left;border:1px solid var(--border);background:#fbfdfc;padding:12px}
.preset-card[aria-pressed=true]{border-color:var(--action);box-shadow:0 0 0 2px rgba(14,107,91,.16)}
.preset-card small{display:block;color:var(--muted);margin-top:4px}
#block-tabs,[data-mobile-tabs]{display:flex;gap:6px;overflow-x:auto;padding:3px 0 10px}
[role=tab]{white-space:nowrap}[role=tab][aria-selected=true]{background:var(--platform);color:#fff}
.field-grid{display:grid;gap:12px}.field-control{display:grid;gap:5px}
.field-control label{font-weight:700}.field-control small{color:var(--muted)}
.field-control input,.field-control textarea,.field-control select{width:100%;border:1px solid var(--border);
  border-radius:9px;padding:10px;background:#fff;color:var(--ink)}
.field-control textarea{min-height:88px;resize:vertical}.field-control [aria-invalid=true]{border-color:var(--danger)}
.pane-title{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px}
.phone-message{padding:18px 12px;background:#e6f0ec;min-height:610px}
.flex-card{overflow:hidden;background:#fff;border-radius:17px;box-shadow:0 8px 24px rgba(20,58,50,.13)}
.flex-header,.flex-body,.flex-footer{padding:14px}.flex-header{border-bottom:1px solid #edf2f0}
.flex-eyebrow,.flex-status,.flex-fact-label,.trust-note{font-size:.78rem;color:var(--muted)}
.flex-title,.flex-project{font-size:1.13rem;font-weight:800}.flex-status{color:var(--action);font-weight:700}
.flex-hero{aspect-ratio:20/13;background:var(--warm);overflow:hidden}.flex-hero img{width:100%;height:100%;object-fit:cover}
.flex-body{display:grid;gap:10px}.flex-fact{display:grid;grid-template-columns:2fr 3fr;gap:10px}
.flex-fact-value{text-align:right;font-weight:700}.trust-note{color:#756743}
.flex-primary{width:100%;background:var(--action);border-color:var(--action);color:#fff;font-weight:800}
#validation-list{padding:0;list-style:none;display:grid;gap:8px}
.finding{border-left:4px solid var(--border);border-radius:9px;background:#f7faf9;padding:10px}
.finding[data-severity=error]{border-color:var(--danger)}.finding[data-severity=warning]{border-color:var(--attention)}
.finding[data-severity=guidance]{border-color:var(--action)}.finding-meta{font-size:.76rem;color:var(--muted)}
.demo-ribbon{background:var(--warm);border:1px solid #decfae;border-radius:9px;padding:8px;font-weight:800}
.receipt-digest{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere;background:#eef4f1;padding:10px}
button:not(:disabled):hover{border-color:var(--action)}button:disabled{opacity:.48;cursor:not-allowed}
[hidden]{display:none!important}[data-mobile-tabs]{display:none}
@media(max-width:720px){#preset-list{grid-template-columns:1fr}[data-mobile-tabs]{display:flex;position:sticky;
  top:0;z-index:10;background:var(--canvas);padding:8px 0}.studio-grid>section[hidden]{display:none!important}}
@media print{.app-header,.editor-pane,.preview-pane,.button-row,[data-mobile-tabs]{display:none!important}
  .studio-grid{display:block;padding:0}.code-pane{border:0!important}.code-pane pre{max-height:none;color:#000;background:#fff}}
```

- [ ] **Step 5: Create five self-contained SVG hero assets**

Each SVG must use a **viewBox="0 0 1200 780"**, **aria-hidden="true"**, no text, no embedded bitmap and no external reference. Use the Trust Concierge palette. The exact visual subjects are:

| Asset | Visual construction |
|---|---|
| design-approval | Warm isometric kitchen cabinetry, island, one green material plane |
| quote-order | Layered material/finish cards, document plane and restrained gold total marker |
| sla-escalation | Calm clock arc, workflow lane and one attention marker; no alarm red flood |
| site-update | Room outline, three curated photo frames and progress check marks |
| issue-evidence | Evidence frame, provenance nodes and amber quarantine boundary |

Create the five files with these exact self-contained vectors; color may be tuned only through the approved palette tokens:

**design-approval-hero.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" aria-hidden="true">
<rect width="1200" height="780" fill="#f4efe7"/><path d="M90 590 450 390l360 205-360 128z" fill="#d8e5df"/>
<path d="M160 208h410v320H160z" fill="#fff"/><path d="M185 235h170v258H185zm194 0h166v258H379z" fill="#e7ded0"/>
<path d="m610 428 280-154 235 134-282 159z" fill="#fff"/><path d="m638 430 202 115v112L638 542z" fill="#0e6b5b"/>
<circle cx="978" cy="185" r="62" fill="#c6942d" opacity=".55"/><path d="M70 640h1060" stroke="#173b35" stroke-width="12"/>
</svg>
```

**quote-order-hero.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" aria-hidden="true">
<rect width="1200" height="780" fill="#eef4f1"/><rect x="160" y="115" width="510" height="535" rx="28" fill="#fff"/>
<path d="M225 205h375M225 270h300M225 335h345M225 510h375" stroke="#9bb2aa" stroke-width="20" stroke-linecap="round"/>
<rect x="710" y="180" width="270" height="180" rx="24" fill="#173b35" transform="rotate(8 845 270)"/>
<rect x="760" y="350" width="270" height="180" rx="24" fill="#c9b89c" transform="rotate(-7 895 440)"/>
<circle cx="905" cy="584" r="72" fill="#c6942d"/><path d="M864 584h82" stroke="#fff" stroke-width="18"/>
</svg>
```

**sla-escalation-hero.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" aria-hidden="true">
<rect width="1200" height="780" fill="#eef4f1"/><circle cx="380" cy="390" r="220" fill="#fff" stroke="#d6e3de" stroke-width="28"/>
<path d="M380 390V245m0 145 112 66" stroke="#0e6b5b" stroke-width="28" stroke-linecap="round"/>
<path d="M160 390a220 220 0 0 1 376-156" fill="none" stroke="#c6942d" stroke-width="32" stroke-linecap="round"/>
<path d="M660 250h360M660 390h260M660 530h360" stroke="#9bb2aa" stroke-width="30" stroke-linecap="round"/>
<circle cx="960" cy="390" r="38" fill="#c6942d"/><circle cx="1040" cy="530" r="38" fill="#0e6b5b"/>
</svg>
```

**site-update-hero.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" aria-hidden="true">
<rect width="1200" height="780" fill="#f4efe7"/><path d="M110 630V195h980v435" fill="none" stroke="#173b35" stroke-width="22"/>
<rect x="170" y="260" width="250" height="220" rx="18" fill="#fff"/><path d="m195 438 82-92 58 53 61-78" fill="none" stroke="#0e6b5b" stroke-width="20"/>
<rect x="475" y="260" width="250" height="220" rx="18" fill="#fff"/><path d="m500 438 78-120 70 84 52-48" fill="none" stroke="#8aa69c" stroke-width="20"/>
<rect x="780" y="260" width="250" height="220" rx="18" fill="#fff"/><path d="m805 438 86-105 61 71 54-88" fill="none" stroke="#c6942d" stroke-width="20"/>
<path d="m250 560 28 28 58-68m220 40 28 28 58-68m220 40 28 28 58-68" fill="none" stroke="#0e6b5b" stroke-width="20"/>
</svg>
```

**issue-evidence-hero.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 780" aria-hidden="true">
<rect width="1200" height="780" fill="#eef4f1"/><rect x="145" y="120" width="540" height="510" rx="28" fill="#fff"/>
<path d="m205 530 120-155 94 86 126-184 80 91" fill="none" stroke="#0e6b5b" stroke-width="26"/>
<circle cx="270" cy="240" r="48" fill="#c6942d"/><path d="M760 230h250M760 390h250M760 550h250" stroke="#173b35" stroke-width="18"/>
<circle cx="760" cy="230" r="34" fill="#0e6b5b"/><circle cx="760" cy="390" r="34" fill="#0e6b5b"/><circle cx="760" cy="550" r="34" fill="#c6942d"/>
<rect x="105" y="80" width="990" height="620" rx="42" fill="none" stroke="#c6942d" stroke-width="18" stroke-dasharray="28 22"/>
</svg>
```

- [ ] **Step 6: Run the structural and full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-structure.test.mjs
npm.cmd --prefix LineOS run test
```

Expected: structure suite PASS 3/3; full suite PASS with 0 failures.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- LineOS/line-flex-studio.html LineOS/line-flex-studio.css LineOS/assets/line-flex-studio LineOS/tests/line-flex-structure.test.mjs
git commit -m "feat(lineos): add Trust Concierge Studio shell"
```

---

### Task 5: Real-time Studio controller, safe Mock LIFF and responsive interactions

**Files:**
- Create: **LineOS/line-flex-studio.mjs**
- Modify: **LineOS/line-flex-json.mjs**
- Modify: **LineOS/line-flex-studio.html**
- Modify: **LineOS/line-flex-studio.css**
- Test: **LineOS/tests/line-flex-studio-state.test.mjs**
- Test: **LineOS/tests/line-flex-actions-receipt.test.mjs**

**Interfaces:**
- Consumes all pure modules from Tasks 1–3.
- Produces: **createInitialStudioState()**, **reduceStudioState(state, event)**, **deriveStudioView(state)** and **bindStudio(document)**.
- DOM rendering uses element creation and **textContent** for user-controlled data; it does not inject draft strings through **innerHTML**.
- Export, Run Journey and confirmation are gated by current validation and bound transaction checks.

- [ ] **Step 1: Write the failing state tests**

Create **LineOS/tests/line-flex-studio-state.test.mjs**:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialStudioState, reduceStudioState, deriveStudioView
} from "../line-flex-studio.mjs";

test("starts with the Thai design approval preset", () => {
  const state = createInitialStudioState();
  assert.equal(state.language, "th");
  assert.equal(state.presetId, "design-approval");
  assert.equal(state.activeBlock, "header");
});

test("language and preset changes create fresh valid views", () => {
  let state = createInitialStudioState();
  state = reduceStudioState(state, { type: "language.changed", language: "en" });
  state = reduceStudioState(state, { type: "preset.changed", presetId: "quote-order" });
  const view = deriveStudioView(state);
  assert.equal(view.draft.language, "en");
  assert.equal(view.draft.presetId, "quote-order");
  assert.equal(view.hasBlockingErrors, false);
});

test("field changes update preview JSON and validation from one draft", () => {
  const state = reduceStudioState(createInitialStudioState(), {
    type: "field.changed", path: ["body", "revision"], value: "D-08"
  });
  const view = deriveStudioView(state);
  assert.equal(view.draft.body.revision, "D-08");
  assert.match(view.jsonText, /D-08/);
  assert.match(view.preview.body.revision, /D-08/);
});

test("blocking errors disable copy download and journey", () => {
  const state = reduceStudioState(createInitialStudioState(), {
    type: "field.changed", path: ["altText"], value: ""
  });
  const view = deriveStudioView(state);
  assert.equal(view.hasBlockingErrors, true);
  assert.equal(view.canExport, false);
  assert.equal(view.canRunJourney, false);
});
```

- [ ] **Step 2: Run the state test and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs
```

Expected: FAIL because **line-flex-studio.mjs** does not exist.

- [ ] **Step 3: Implement the pure state reducer and derived view**

Create the pure section of **LineOS/line-flex-studio.mjs**:

```js
import { createDraft, updateDraftAtPath } from "./line-flex-model.mjs";
import { PRESET_IDS, getPreset } from "./line-flex-presets.mjs";
import { buildFlexMessage, measureUtf8Bytes } from "./line-flex-json.mjs";
import { validateDraft } from "./line-flex-validator.mjs";
import {
  createDemoTransaction, confirmDemoTransaction, selectActionMode
} from "./line-flex-actions.mjs";
import { createDemoReceipt } from "./line-flex-receipt.mjs";

export function createInitialStudioState() {
  const language = "th";
  const presetId = "design-approval";
  return { language, presetId, activeBlock: "header",
    draft: createDraft(getPreset(presetId), language), transaction: null, receipt: null };
}

export function reduceStudioState(state, event) {
  if (event.type === "language.changed") {
    return { ...state, language: event.language,
      draft: createDraft(getPreset(state.presetId), event.language),
      transaction: null, receipt: null };
  }
  if (event.type === "preset.changed") {
    return { ...state, presetId: event.presetId,
      draft: createDraft(getPreset(event.presetId), state.language),
      transaction: null, receipt: null };
  }
  if (event.type === "block.changed") return { ...state, activeBlock: event.block };
  if (event.type === "field.changed") {
    return { ...state, draft: updateDraftAtPath(state.draft, event.path, event.value),
      transaction: null, receipt: null };
  }
  if (event.type === "draft.reset") {
    return { ...state, draft: createDraft(getPreset(state.presetId), state.language),
      transaction: null, receipt: null };
  }
  return state;
}

export function deriveStudioView(state) {
  const message = buildFlexMessage(state.draft);
  const findings = validateDraft(state.draft, message);
  const hasBlockingErrors = findings.some((finding) => finding.severity === "error");
  return {
    ...state,
    message,
    jsonText: JSON.stringify(message, null, 2),
    payloadBytes: measureUtf8Bytes(message.contents),
    findings,
    hasBlockingErrors,
    canExport: !hasBlockingErrors,
    canRunJourney: !hasBlockingErrors,
    preview: state.draft
  };
}
```

- [ ] **Step 4: Integrate risk-aware action selection into JSON generation**

Modify **LineOS/line-flex-json.mjs** so **actionFor(draft)** calls **selectActionMode(draft.intent)**. A selected **liff_uri** produces a URI action to the non-secret demo route. High-risk presets can therefore never export a postback button even if requested incorrectly; the validator still reports the attempted unsafe configuration.

```js
import { selectActionMode } from "./line-flex-actions.mjs";

const actionFor = (draft) => {
  const mode = selectActionMode(draft.intent);
  if (mode === "postback") return {
    type: "postback", label: draft.footer.primaryLabel,
    data: "intent=" + encodeURIComponent(draft.presetId)
  };
  if (mode === "message") return {
    type: "message", label: draft.footer.primaryLabel,
    text: draft.footer.primaryLabel
  };
  return {
    type: "uri", label: draft.footer.primaryLabel,
    uri: "https://example.com/monolith/demo/" + encodeURIComponent(draft.presetId)
  };
};
```

Add a regression test asserting that a high-risk draft requesting postback exports a URI action while still producing **MON-ACT-001**.

- [ ] **Step 5: Bind the DOM safely**

Implement **bindStudio(document)** and invoke it only when **document** exists. The binding must:

1. render five preset buttons and four block tabs;
2. render labelled controls for all fields in the active block;
3. dispatch reducer events on input without debounce;
4. render the phone preview with **createElement**, **replaceChildren** and **textContent**;
5. render JSON through **jsonOutput.textContent**;
6. render validation findings with severity, classification and source link;
7. show byte count and 24 KB/30 KB state;
8. disable Copy, Download and Run Journey when errors exist;
9. copy through **navigator.clipboard.writeText** with a clear failure message;
10. download through a local Blob and revoke the object URL;
11. request confirmation before resetting a changed draft;
12. use **aria-pressed**, **aria-selected**, **aria-controls** and visible focus correctly;
13. switch document language and all control copy between Thai and English;
14. announce copy/download/reset/error/receipt results through **toast-live**.

Append this browser controller after the pure exports in **line-flex-studio.mjs**. It is the normative DOM pattern: user-controlled values enter the page only through **textContent**, **value** or attribute APIs, never through **innerHTML**.

```js
const BLOCKS = ["header", "hero", "body", "footer"];
const FIELDS = {
  header: [
    ["header.eyebrow", "Eyebrow", "คิ้วหัวเรื่อง"], ["header.title", "Title", "หัวเรื่อง"],
    ["header.status", "Status", "สถานะ"], ["altText", "Alt text", "ข้อความสำรอง"]
  ],
  hero: [
    ["hero.exportUrl", "Export HTTPS URL", "URL HTTPS สำหรับส่งจริง"],
    ["hero.aspectRatio", "Aspect ratio", "อัตราส่วนภาพ"],
    ["hero.aspectMode", "Aspect mode", "รูปแบบการครอบภาพ"]
  ],
  body: [
    ["body.project", "Project", "โครงการ"], ["body.revision", "Revision", "Revision"],
    ["body.requester", "Requested by", "ผู้ส่งคำขอ"], ["body.amount", "Amount / scope", "มูลค่า / ขอบเขต"],
    ["body.deadline", "Due", "กำหนดเวลา"], ["body.summary", "Summary", "สรุป"],
    ["body.trustNote", "Trust note", "ข้อความยืนยันความน่าเชื่อถือ"]
  ],
  footer: [
    ["footer.primaryLabel", "Primary CTA", "ปุ่มหลัก"],
    ["footer.secondaryLabel", "Secondary CTA", "ปุ่มรอง"],
    ["intent.requestedActionType", "Requested action", "Action ที่ร้องขอ"]
  ]
};

const COPY = {
  en: { blocks: ["Header", "Hero", "Body", "Footer"], bytes: "bubble bytes",
    run: "Run Journey", copyJson: "Copy JSON", downloadJson: "Download JSON", resetDraft: "Reset",
    copied: "JSON copied", downloaded: "JSON downloaded", reset: "Draft reset",
    copyFailed: "Copy failed. Select the JSON and copy manually.", fix: "Fix" },
  th: { blocks: ["ส่วนหัว", "ภาพหลัก", "เนื้อหา", "ส่วนท้าย"], bytes: "ไบต์ของ bubble",
    run: "ทดลอง Journey", copyJson: "คัดลอก JSON", downloadJson: "ดาวน์โหลด JSON", resetDraft: "คืนค่า",
    copied: "คัดลอก JSON แล้ว", downloaded: "ดาวน์โหลด JSON แล้ว", reset: "คืนค่าแบบร่างแล้ว",
    copyFailed: "คัดลอกไม่สำเร็จ โปรดเลือก JSON แล้วคัดลอกด้วยตนเอง", fix: "แก้ไข" }
};

const pathParts = (path) => path.split(".");
const valueAt = (value, path) => pathParts(path).reduce((cursor, part) => cursor[part], value);
const make = (doc, tag, options = {}) => {
  const element = doc.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, String(value));
  }
  return element;
};

const addText = (doc, parent, className, text) =>
  parent.append(make(doc, "div", { className, text }));

function renderPreview(doc, container, draft) {
  const message = make(doc, "div", { className: "phone-message" });
  const card = make(doc, "article", { className: "flex-card" });
  const header = make(doc, "header", { className: "flex-header" });
  addText(doc, header, "flex-eyebrow", draft.header.eyebrow);
  addText(doc, header, "flex-title", draft.header.title);
  addText(doc, header, "flex-status", draft.header.status);
  const hero = make(doc, "div", { className: "flex-hero" });
  const image = make(doc, "img", { attributes: { src: draft.hero.localAsset, alt: "" } });
  image.addEventListener("error", () => image.remove());
  hero.append(image);
  const body = make(doc, "div", { className: "flex-body" });
  addText(doc, body, "flex-project", draft.body.project);
  for (const [label, value] of [
    ["Revision", draft.body.revision],
    [draft.language === "th" ? "ผู้ส่ง" : "Requested by", draft.body.requester],
    [draft.language === "th" ? "มูลค่า / ขอบเขต" : "Amount / scope", draft.body.amount],
    [draft.language === "th" ? "ภายใน" : "Due", draft.body.deadline]
  ]) {
    const row = make(doc, "div", { className: "flex-fact" });
    addText(doc, row, "flex-fact-label", label);
    addText(doc, row, "flex-fact-value", value);
    body.append(row);
  }
  addText(doc, body, "flex-summary", draft.body.summary);
  addText(doc, body, "trust-note", draft.body.trustNote);
  const footer = make(doc, "footer", { className: "flex-footer" });
  footer.append(make(doc, "button", { className: "flex-primary", text: draft.footer.primaryLabel,
    attributes: { type: "button", tabindex: "-1" } }));
  card.append(header, hero, body, footer);
  message.append(card);
  container.replaceChildren(message);
}

export function bindStudio(doc) {
  let state = createInitialStudioState();
  let dirty = false;
  const byId = (id) => doc.getElementById(id);
  const nodes = {
    language: byId("language-toggle"), tenant: byId("tenant-context"),
    presets: byId("preset-list"), blocks: byId("block-tabs"), fields: byId("field-panel"),
    preview: byId("phone-preview"), json: byId("json-output"), findings: byId("validation-list"),
    count: byId("payload-count"), copy: byId("copy-json"), download: byId("download-json"),
    reset: byId("reset-draft"), run: byId("run-journey"), toast: byId("toast-live")
  };
  const announce = (message) => { nodes.toast.textContent = ""; doc.defaultView.setTimeout(() => {
    nodes.toast.textContent = message;
  }, 0); };
  const dispatch = (event, marksDirty = true) => {
    state = reduceStudioState(state, event);
    if (marksDirty) dirty = true;
    render(event.type !== "field.changed");
  };

  function renderPresets() {
    const buttons = PRESET_IDS.map((id) => {
      const item = createDraft(getPreset(id), state.language);
      const button = make(doc, "button", { className: "preset-card", text: item.header.title,
        attributes: { type: "button", "aria-pressed": id === state.presetId } });
      button.append(make(doc, "small", { text: item.context.audience }));
      button.addEventListener("click", () => {
        dirty = false;
        dispatch({ type: "preset.changed", presetId: id }, false);
      });
      return button;
    });
    nodes.presets.replaceChildren(...buttons);
  }

  function renderBlocks() {
    nodes.blocks.replaceChildren(...BLOCKS.map((block, index) => {
      const selected = block === state.activeBlock;
      const button = make(doc, "button", { className: "block-tab", text: COPY[state.language].blocks[index],
        attributes: { type: "button", role: "tab", id: "block-tab-" + block,
          "aria-selected": selected, "aria-controls": "field-panel", tabindex: selected ? "0" : "-1" } });
      button.addEventListener("click", () => dispatch({ type: "block.changed", block }, false));
      return button;
    }));
  }

  function renderFields() {
    const controls = FIELDS[state.activeBlock].map(([path, en, th]) => {
      const wrapper = make(doc, "div", { className: "field-control" });
      const id = "field-" + path.replaceAll(".", "-");
      const label = make(doc, "label", { text: state.language === "th" ? th : en,
        attributes: { for: id } });
      const multiline = ["summary", "trustNote", "altText"].some((name) => path.endsWith(name));
      const control = make(doc, multiline ? "textarea" : "input", {
        attributes: { id, name: path, "data-path": path }
      });
      control.value = valueAt(state.draft, path);
      control.addEventListener("input", () => dispatch({ type: "field.changed",
        path: pathParts(path), value: control.value }));
      wrapper.append(label, control);
      return wrapper;
    });
    const grid = make(doc, "div", { className: "field-grid" });
    grid.append(...controls);
    nodes.fields.replaceChildren(grid);
  }

  function renderFindings(view) {
    nodes.findings.replaceChildren(...view.findings.map((finding) => {
      const item = make(doc, "li", { className: "finding",
        attributes: { "data-severity": finding.severity } });
      addText(doc, item, "finding-title", finding.title);
      addText(doc, item, "finding-meta", finding.ruleId + " · " + finding.classification);
      addText(doc, item, "finding-copy", finding.explanation + " " + finding.remediation);
      const source = make(doc, "a", { text: "Source", attributes: {
        href: finding.sourceUrl, target: "_blank", rel: "noreferrer" } });
      item.append(source);
      if (finding.severity === "error") {
        const fix = make(doc, "button", { text: COPY[state.language].fix,
          attributes: { type: "button" } });
        fix.addEventListener("click", () => {
          dispatch({ type: "block.changed", block: finding.block }, false);
          doc.querySelector('[data-path="' + finding.field + '"]')?.focus();
        });
        item.append(fix);
      }
      return item;
    }));
  }

  function render(rebuildControls = true) {
    const view = deriveStudioView(state);
    doc.documentElement.lang = state.language;
    nodes.language.textContent = state.language === "th" ? "TH / EN" : "EN / TH";
    nodes.language.setAttribute("aria-pressed", String(state.language === "en"));
    nodes.tenant.textContent = state.draft.context.tenantName + " · " + state.draft.context.platformMark;
    if (rebuildControls) { renderPresets(); renderBlocks(); renderFields(); }
    renderPreview(doc, nodes.preview, state.draft);
    nodes.json.textContent = view.jsonText;
    nodes.count.textContent = view.payloadBytes.toLocaleString() + " " + COPY[state.language].bytes;
    renderFindings(view);
    for (const control of nodes.fields.querySelectorAll("[data-path]")) {
      control.setAttribute("aria-invalid", String(view.findings.some((finding) =>
        finding.severity === "error" && finding.field === control.dataset.path)));
    }
    nodes.run.textContent = COPY[state.language].run;
    nodes.copy.textContent = COPY[state.language].copyJson;
    nodes.download.textContent = COPY[state.language].downloadJson;
    nodes.reset.textContent = COPY[state.language].resetDraft;
    for (const tab of doc.querySelectorAll("[data-mobile-tabs] [role=tab]")) {
      tab.textContent = state.language === "th" ? tab.dataset.labelTh : tab.dataset.labelEn;
    }
    for (const button of [nodes.copy, nodes.download, nodes.run]) button.disabled = view.hasBlockingErrors;
    return view;
  }

  nodes.language.addEventListener("click", () => {
    dirty = false;
    dispatch({ type: "language.changed", language: state.language === "th" ? "en" : "th" }, false);
  });
  nodes.copy.addEventListener("click", async () => {
    try { await doc.defaultView.navigator.clipboard.writeText(deriveStudioView(state).jsonText);
      announce(COPY[state.language].copied); }
    catch { announce(COPY[state.language].copyFailed); }
  });
  nodes.download.addEventListener("click", () => {
    const blob = new Blob([deriveStudioView(state).jsonText], { type: "application/json" });
    const url = doc.defaultView.URL.createObjectURL(blob);
    const anchor = make(doc, "a", { attributes: { href: url,
      download: "monolith-" + state.presetId + ".json" } });
    anchor.click(); doc.defaultView.URL.revokeObjectURL(url);
    announce(COPY[state.language].downloaded);
  });
  nodes.reset.addEventListener("click", () => {
    if (dirty && !doc.defaultView.confirm(state.language === "th" ?
      "คืนค่าการแก้ไขทั้งหมดหรือไม่" : "Reset all edits?")) return;
    dirty = false; dispatch({ type: "draft.reset" }, false); announce(COPY[state.language].reset);
  });

  const controller = { getState: () => state, dispatch, render, announce, nodes };
  installJourney(doc, controller);
  installResponsiveTabs(doc);
  render();
  return controller;
}
```

The browser-only call is:

```js
if (typeof document !== "undefined") bindStudio(document);
```

- [ ] **Step 6: Implement Mock LIFF and receipt dialogs**

Run Journey must:

1. create a transaction using current draft;
2. display tenant, recipient, project, revision, action, consequence and expiry in **liff-dialog**;
3. show **PRIVATE REVIEW — DEMO** and the current action mode;
4. confirm only through the explicit confirmation button;
5. call **confirmDemoTransaction** against the current draft;
6. fail closed if the draft changed or expired;
7. call **createDemoReceipt**;
8. display the receipt and wrapped digest in **receipt-dialog**;
9. show **DEMO — NOT A PRODUCTION SIGNATURE** above the outcome;
10. return focus to Run Journey when the dialog closes.

Do not persist the transaction or receipt to local storage. Refresh begins a fresh demo state.

Add the exact dialog controller below. The transaction deliberately remains open while the current draft can change so **confirmDemoTransaction** proves fail-closed revision binding.

```js
function appendPair(doc, target, label, value) {
  const row = make(doc, "div", { className: "review-pair" });
  row.append(make(doc, "strong", { text: label }), make(doc, "span", { text: String(value) }));
  target.append(row);
}

function installJourney(doc, controller) {
  const liff = doc.getElementById("liff-dialog");
  const receiptDialog = doc.getElementById("receipt-dialog");
  const review = liff.querySelector("[data-liff-review]");
  const receiptTarget = receiptDialog.querySelector("[data-receipt]");
  const confirm = liff.querySelector("[data-confirm-demo]");
  const cancel = liff.querySelector('button[value="cancel"]');
  const closeReceipt = receiptDialog.querySelector("[data-close-receipt]");
  let transaction = null;

  controller.nodes.run.addEventListener("click", () => {
    const draft = controller.getState().draft;
    transaction = createDemoTransaction(draft);
    review.replaceChildren(make(doc, "p", { className: "demo-ribbon",
      text: "PRIVATE REVIEW — DEMO" }));
    for (const [label, value] of [
      ["Tenant", draft.context.tenantName], ["Recipient", transaction.recipientRef],
      ["Project", draft.body.project], ["Revision", transaction.revision],
      ["Action", transaction.canonicalAction], ["Consequence", draft.body.trustNote],
      ["Action mode", transaction.actionMode], ["Expires", transaction.expiresAt]
    ]) appendPair(doc, review, label, value);
    liff.showModal();
  });

  cancel.addEventListener("click", () => liff.close("cancel"));
  liff.addEventListener("close", () => controller.nodes.run.focus());
  confirm.addEventListener("click", async () => {
    try {
      const confirmation = confirmDemoTransaction(transaction, controller.getState().draft);
      const receipt = await createDemoReceipt(transaction, confirmation);
      receiptTarget.replaceChildren(make(doc, "p", { className: "demo-ribbon", text: receipt.label }));
      for (const [label, value] of [
        ["Transaction", receipt.transactionId], ["Tenant", receipt.tenantId],
        ["Recipient", receipt.recipientRef], ["Revision", receipt.revision],
        ["Action", receipt.canonicalAction], ["Outcome", receipt.outcome],
        ["Confirmed", receipt.confirmedAt]
      ]) appendPair(doc, receiptTarget, label, value);
      receiptTarget.append(make(doc, "p", { className: "receipt-digest", text: receipt.digest }));
      receiptTarget.append(make(doc, "p", { text: receipt.productionNotice }));
      liff.close("confirmed"); receiptDialog.showModal();
      controller.announce("Verification Receipt — Demo");
    } catch (error) {
      controller.announce(error.message === "transaction_expired" ?
        "Review expired. Start again." : "Bound values changed. Start review again.");
      liff.close("rejected");
    }
  });
  closeReceipt.addEventListener("click", () => receiptDialog.close());
  receiptDialog.addEventListener("close", () => controller.nodes.run.focus());
}
```

- [ ] **Step 7: Add responsive pane tabs and accessible error summary**

At widths at or below 720 pixels, expose Editor, Preview and JSON & Validation as a tablist while keeping all panes in the DOM. The active tab controls visibility with **hidden** and updates **aria-selected**. At wider widths, remove **hidden** and show the three-column or two-row layout.

The first blocking validation item must have a **Fix** button that activates the correct block and focuses its field.

Create the mobile pane tablist once and drive visibility from **matchMedia**; never remove a pane from the DOM:

```js
function installResponsiveTabs(doc) {
  const panes = [
    ["editor", doc.querySelector(".editor-pane"), "Editor", "แก้ไข"],
    ["preview", doc.querySelector(".preview-pane"), "Preview", "ตัวอย่าง"],
    ["code", doc.querySelector(".code-pane"), "JSON & Validation", "JSON และตรวจสอบ"]
  ];
  let active = "editor";
  const tabs = make(doc, "nav", { attributes: { "data-mobile-tabs": "", role: "tablist",
    "aria-label": "Studio panes" } });
  const media = doc.defaultView.matchMedia("(max-width: 720px)");
  const apply = () => {
    const mobile = media.matches;
    for (const [id, pane] of panes) pane.hidden = mobile && id !== active;
    for (const button of tabs.querySelectorAll("[role=tab]")) {
      const selected = button.dataset.pane === active;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };
  for (const [id, pane, en, th] of panes) {
    pane.id ||= "pane-" + id;
    pane.tabIndex = -1;
    const button = make(doc, "button", { text: doc.documentElement.lang === "th" ? th : en,
      attributes: { type: "button", role: "tab", "data-pane": id,
        "data-label-en": en, "data-label-th": th,
        "aria-controls": pane.id, "aria-selected": id === active } });
    button.addEventListener("click", () => { active = id; apply(); pane.focus({ preventScroll: true }); });
    tabs.append(button);
  }
  doc.getElementById("studio-main").before(tabs);
  media.addEventListener("change", apply);
  apply();
}
```

- [ ] **Step 8: Run focused and full tests**

```powershell
npm.cmd --prefix LineOS run test -- tests/line-flex-studio-state.test.mjs tests/line-flex-actions-receipt.test.mjs
npm.cmd --prefix LineOS run test
```

Expected: focused suites PASS; all current tests PASS with 0 failures.

- [ ] **Step 9: Serve locally and perform the first browser smoke check**

Run from the parent root:

```powershell
python -m http.server 4177 --directory LineOS
```

Open **http://localhost:4177/line-flex-studio.html** and verify:

- approval preset appears in Thai;
- editing revision changes preview and JSON;
- empty alt text disables export and journey;
- language/preset changes do not leak old values;
- Run Journey shows exact review and demo receipt;
- browser network panel shows only localhost requests.

Stop the local server after the check.

- [ ] **Step 10: Commit Task 5**

```powershell
git add -- LineOS/line-flex-studio.mjs LineOS/line-flex-json.mjs LineOS/line-flex-studio.html LineOS/line-flex-studio.css LineOS/tests/line-flex-studio-state.test.mjs LineOS/tests/line-flex-actions-receipt.test.mjs
git commit -m "feat(lineos): make Flex Studio interactive"
```

---

### Task 6: Board-grade bilingual Deep Research Report

**Files:**
- Create: **LineOS/tests/docs-contract.test.mjs**
- Create: **LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.en.md**
- Create: **LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.th.md**
- Generate: matching **.en.html** and **.th.html**

**Interfaces:**
- Consumes: approved written design, local two-root evidence and the three completed Perplexity Deep Research tracks.
- Produces: the executive source of record for external research conclusions.
- Every technical claim uses a primary source; every local implementation claim names its Git root and file.

- [ ] **Step 1: Write the failing research-document contract**

Create **LineOS/tests/docs-contract.test.mjs**:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const research = "docs/research/2026-08-01-monolith-line-human-surface-deep-research";
const read = (path) => readFile(resolve(root, path), "utf8");

test("deep research exists in bilingual Markdown and standalone HTML", async () => {
  for (const suffix of [".en.md", ".th.md", ".en.html", ".th.html"]) {
    await access(resolve(root, research + suffix));
  }
  const enHtml = await read(research + ".en.html");
  const thHtml = await read(research + ".th.html");
  assert.match(enHtml, /^<!doctype html>/);
  assert.match(enHtml, /<html lang="en">/);
  assert.match(thHtml, /^<!doctype html>/);
  assert.match(thHtml, /<html lang="th">/);
});

test("research preserves the board stop rule and tenant boundary", async () => {
  const en = await read(research + ".en.md");
  const th = await read(research + ".th.md");
  assert.match(en, /NO-GO for broader customer messaging/);
  assert.match(en, /Daph is one pilot tenant/);
  assert.match(th, /NO-GO/);
  assert.match(th, /Daph.*tenant/);
});

test("research labels evidence and cites primary technical sources", async () => {
  const en = await read(research + ".en.md");
  for (const text of [
    "Official constraint", "Verified local fact", "Inference", "Proposal", "Unknown",
    "https://developers.line.biz/en/docs/messaging-api/",
    "https://www.rfc-editor.org/rfc/rfc9700.html",
    "https://csrc.nist.gov/pubs/sp/800/207/final",
    "https://www.w3.org/TR/WCAG22/"
  ]) assert.match(en, new RegExp(text.replace(/[.*+?^()|[\]{}]/g, "\\$&")));
});
```

- [ ] **Step 2: Run the docs contract and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected: FAIL because the research files do not exist.

- [ ] **Step 3: Write the English executive deep-research report**

Create the English Markdown with these exact sections and conclusions:

1. **Board decision:** NO-GO for broader customer messaging; conditional local prototype approval only.
2. **Research method:** three Perplexity tracks, local source inspection, official-source verification and evidence labels.
3. **Two-root current state:** parent governance versus nested runtime; dirty-tree and non-production caveats.
4. **LINE Human Surface operating model:** OA 1:1, personal push and groups; what returns to MONOLITH.
5. **Flex and LIFF technical findings:** message envelope, one-bubble 30 KB and carousel 50 KB limits, 12-bubble carousel maximum, alt text, media/action constraints, LIFF through URI.
6. **Developer Console and delivery lifecycle:** correct channel/provider/LIFF relationship, webhook verification, redelivery, retry and observability.
7. **Trust Kernel analysis:** tenant, principal, resource, revision, grants, delegation, risk and assurance; PERMIT/DENY/STEP_UP/QUARANTINE.
8. **P0–P3 gap ledger:** P0 trust foundation; P1 governed experience; P2 lifecycle intelligence; P3 controlled scale.
9. **Threat model:** cross-tenant routing, forged/replayed webhook, link forwarding, stale revision, unknown group actor, wrong audience, duplicate send, unknown-after-send, audit tampering and notification abuse.
10. **Human factors and ethical retention:** quiet hours, notification fatigue, accessibility, service recovery, portability and dark-pattern prohibitions.
11. **Interior-design lifecycle:** lead through warranty/referral with the correct surface and system-of-record fields at each stage.
12. **Product and configuration matrix:** base, wall, tall/larder, vanity, wardrobe, media, office and custom; dimensions remain sourced parameters rather than a universal standard.
13. **Materials, hardware and toolchain:** supplier provenance, appliance constraints, CAD/BIM/CAM/CNC, survey, QA and installation evidence.
14. **Role scorecard:** executive, sales, designer, estimator, procurement, factory, QA, logistics, installer, finance, partner, customer and customer-of-customer.
15. **Capability matrix:** current local evidence, gap, owner, dependency, risk and measurable outcome.
16. **KPI hypotheses:** conversion, approval latency, rework, notification opt-out, quarantine age, SLA breach, delivery reliability, service recovery and adoption; label each as a hypothesis until baselined.
17. **Phased roadmap:** P0 Trust closure → bounded Daph pilot → five governed journeys → Tenant-2 shadow → controlled scale.
18. **Board go/no-go scorecard:** mandatory gates, owner, evidence, failure response and rollback.
19. **Evidence ledger:** URL, publisher, date, classification, supported claim and caveat.
20. **Limitations:** no deployment proof, no real-machine qualification, no legal opinion, no universal cabinet standard and no production receipt signature.

The executive conclusion must state:

> MONOLITH should be a multi-tenant, revision-controlled project and product operating system. LINE is a replaceable Human Surface. Daph is one pilot tenant. Broader customer messaging remains NO-GO until every Trust P0 gate passes with fresh evidence.

- [ ] **Step 4: Write the aligned Thai report**

Create the Thai Markdown with the same 20 sections, tables, evidence labels, source URLs, decision, numbers and caveats. Translate the explanation, not identifiers, API names, rule IDs or evidence classifications used for cross-file traceability.

- [ ] **Step 5: Render standalone HTML**

From the parent root:

```powershell
python tools\render_docs.py "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.en.md" "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.th.md"
```

Expected: two HTML files created beside the Markdown sources.

- [ ] **Step 6: Run the docs contract and claim lint**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools\lint_claims.py "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.en.md" "LineOS\docs\research\2026-08-01-monolith-line-human-surface-deep-research.th.md"
```

Expected: docs contract PASS 3/3; claim lint exit 0.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.en.md LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.th.md LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.en.html LineOS/docs/research/2026-08-01-monolith-line-human-surface-deep-research.th.html
git commit -m "docs(lineos): add LINE Human Surface deep research"
```

---

### Task 7: Bilingual user, installation, action and performance guides

**Files:**
- Create eight Markdown guide files under **LineOS/docs/guides/**
- Generate eight matching HTML files
- Modify: **LineOS/tests/docs-contract.test.mjs**

**Interfaces:**
- Consumes runtime behavior from Tasks 1–5 and evidence from Task 6.
- Produces operator-ready instructions without exposing production secrets.
- Installation guide corrects the misconception that Flex JSON is installed in Developer Console.

- [ ] **Step 1: Extend the docs contract before creating guides**

Add a test that declares these four guide stems:

```js
const guideStems = [
  "docs/guides/line-flex-studio-user-guide",
  "docs/guides/line-developer-console-installation",
  "docs/guides/line-flex-action-vs-liff-decision-guide",
  "docs/guides/line-flex-performance-rendering-checklist"
];

test("every guide has English and Thai Markdown and HTML", async () => {
  for (const stem of guideStems) {
    for (const suffix of [".en.md", ".th.md", ".en.html", ".th.html"]) {
      await access(resolve(root, stem + suffix));
    }
  }
});
```

Add a second test requiring the installation guide to contain **Flex Message Simulator**, **Messaging API**, **Use webhook**, **Webhook redelivery**, **LIFF**, **state**, **nonce**, **no production token**, and the statement **Flex JSON is not installed in Developer Console**.

- [ ] **Step 2: Run the contract and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected: FAIL because the guide families do not exist.

- [ ] **Step 3: Write the Flex Studio User Guide in English and Thai**

Both language editions must contain:

1. purpose and standalone safety boundary;
2. quick start using a local static server;
3. Studio Console map;
4. how to choose each of the five presets;
5. how to edit Header, Hero, Body and Footer;
6. preview widths and bilingual wrapping;
7. JSON copy/download and why errors block export;
8. validation severity and source labels;
9. Mock LIFF exact-action review;
10. Verification Receipt — Demo interpretation;
11. keyboard operation;
12. clearing demo state;
13. troubleshooting empty preview, broken hero, invalid URL, over-budget payload and clipboard denial;
14. explicit statement that no message was sent and no business state changed.

- [ ] **Step 4: Write the Developer Console Installation Guide in English and Thai**

Use exact, current setup order:

1. Register LINE Business ID and create/select the LINE Official Account.
2. In Official Account Manager, enable Messaging API; do not claim a Messaging API channel is created directly in Developer Console.
3. Choose the provider deliberately; keep Messaging API and LINE Login/LIFF channels under the same provider when provider-scoped user identity must align.
4. Confirm the Messaging API channel and record the channel ID.
5. Treat channel secret and access token as production secrets; never put them in Flex JSON, LIFF client code, screenshots or the standalone Studio.
6. Configure a public HTTPS webhook, click Verify, accept an empty-event verification request with HTTP 200, enable Use webhook, Webhook redelivery and webhook error statistics.
7. Create a LINE Login channel under the intended provider.
8. Add a LIFF app from the LINE Login channel LIFF tab.
9. Configure name, Compact/Tall/Full size, HTTPS endpoint without fragment and only required scopes.
10. Use **openid** for ID token, **profile** only when needed, and **chat_message.write** only when sendMessages is truly required.
11. Record LIFF ID/URL per development, review and production environment.
12. Implement server-side state and nonce transaction verification, exact redirect URI, expiry and one-time consumption before binding identity.
13. Configure the Flex button as a URI action to the approved LIFF URL; LIFF is not a distinct Flex action type.
14. Paste exported JSON into the official Flex Message Simulator for official-client prototyping; explain that JSON is not installed into Developer Console.
15. Test on real LINE clients and verify fallbacks before any controlled send.
16. Keep live customer delivery disabled until MONOLITH Trust P0 gates pass.
17. Provide rollback: disable Use webhook/new LIFF entry point, stop workers, retain audit/evidence and never delete unexplained delivery state.

Include screenshots only when captured from the current official UI during execution; every screenshot must state its capture date and hide identifiers and secrets. Do not insert a simulated console image.

- [ ] **Step 5: Write the Action vs LIFF Decision Guide in English and Thai**

Include the exact matrix:

| Need | Action |
|---|---|
| Visible conversational text | Message |
| Low-risk reversible choice, reauthorized server-side | Postback with opaque intent ID |
| Read-only web/tel/LINE scheme | URI |
| Form, identity, sensitive detail, comparison or explicit confirmation | URI opening LIFF |
| Money, access, release, policy, scope or hard-to-reverse change | LIFF plus MONOLITH step-up |

Include examples for all five presets, duplicate/replay behavior, why a webhook signature proves transport rather than authorization, and anti-patterns: tenant/amount/role in postback data, free-text order truth, one-tap approval, bearer tokens in URLs and group membership as permission.

- [ ] **Step 6: Write the Performance and Rendering Checklist in English and Thai**

Include:

- 30 KB one-bubble and 50 KB carousel definition ceilings;
- maximum 12 carousel bubbles, while v1 Studio authors one bubble only;
- alt text 1,500-character ceiling;
- HTTPS JPEG/PNG image requirements, 1024×1024 and 10 MB acceptance ceilings;
- 24 KB MONOLITH soft budget;
- no base64, remote fonts or third-party runtime;
- local preview versus exported HTTPS URL behavior;
- 320/360/390 widths, Thai/English/emoji/long-name/large-font checks;
- cover cropping, safe visual area and text-outside-image rules;
- shallow layout, wrap tolerance and fixed-height prohibition;
- primary CTA clarity;
- keyboard, focus, contrast, semantic labels and reduced motion;
- real-device matrix across current iOS/Android/desktop LINE versions;
- media/CDN guidance clearly labelled for future production;
- failure checks for unavailable image, LINE API 4xx/429/5xx, duplicate delivery and unknown-after-send.

- [ ] **Step 7: Render all eight guide HTML files**

```powershell
$guideFiles = Get-ChildItem -LiteralPath "LineOS\docs\guides" -Filter "*.md" -File | Select-Object -ExpandProperty FullName
python tools\render_docs.py $guideFiles
```

Expected: one HTML file beside every Markdown guide.

- [ ] **Step 8: Run docs contracts and claim lint**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
python tools\lint_claims.py LineOS\docs\guides
```

Expected: docs contract PASS; claim lint exit 0.

- [ ] **Step 9: Commit Task 7**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs/guides
git commit -m "docs(lineos): add Flex and LIFF operating guides"
```

---

### Task 8: Cross-document integrity, standalone HTML and claim verification

**Files:**
- Modify: **LineOS/tests/docs-contract.test.mjs**
- Regenerate: all Markdown companions under **LineOS/docs/**

**Interfaces:**
- Consumes all spec, plan, research and guide Markdown.
- Produces a single executable document contract that prevents missing editions, broken standalone HTML, unfilled template markers and unsafe readiness claims.

- [ ] **Step 1: Add failing integrity checks**

Extend **LineOS/tests/docs-contract.test.mjs**:

```js
test("project documents contain no unfilled template markers or replacement characters", async () => {
  const files = [
    research + ".en.md", research + ".th.md",
    ...guideStems.flatMap((stem) => [stem + ".en.md", stem + ".th.md"])
  ];
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b(TBD|TODO|FIXME|implement later|fill in details)\b/i);
    assert.doesNotMatch(text, /\uFFFD/);
  }
});

test("HTML editions are standalone and language-correct", async () => {
  const stems = [research, ...guideStems];
  for (const stem of stems) {
    const en = await read(stem + ".en.html");
    const th = await read(stem + ".th.html");
    assert.match(en, /^<!doctype html>/);
    assert.match(en, /<meta name="viewport"/);
    assert.match(en, /<html lang="en">/);
    assert.match(th, /^<!doctype html>/);
    assert.match(th, /<meta name="viewport"/);
    assert.match(th, /<html lang="th">/);
  }
});

test("no document promotes source presence to production readiness", async () => {
  const en = await read(research + ".en.md");
  assert.match(en, /Source presence does not prove deployment or production readiness/);
  assert.doesNotMatch(en, /production[- ]ready because|tests exist, therefore production/i);
});
```

Temporarily rename one HTML companion with the exact fail-safe sequence below, prove the pairing test fails, and always restore the file before continuing:

```powershell
$source = "LineOS\docs\guides\line-developer-console-installation.en.html"
$held = "LineOS\docs\guides\line-developer-console-installation.en.html.hold"
Move-Item -LiteralPath $source -Destination $held
try {
  npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
  if ($LASTEXITCODE -eq 0) { throw "Expected the missing-companion contract to fail" }
}
finally {
  Move-Item -LiteralPath $held -Destination $source
}
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw "Document contract did not recover after restoration" }
```

- [ ] **Step 2: Run the contract and observe the intended RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected during the temporary rename: FAIL naming the missing companion. Restore the file and rerun.

- [ ] **Step 3: Regenerate all HTML from current Markdown**

```powershell
$docFiles = Get-ChildItem -LiteralPath "LineOS\docs" -Recurse -Filter "*.md" -File | Select-Object -ExpandProperty FullName
python tools\render_docs.py $docFiles
```

Expected: every Markdown source has an updated HTML companion.

- [ ] **Step 4: Run complete documentation verification**

```powershell
npm.cmd --prefix LineOS run test:contracts
python tools\lint_claims.py LineOS\docs
git diff --check -- LineOS
```

Expected: contract tests PASS, claim lint exit 0, diff check produces no output.

- [ ] **Step 5: Commit Task 8**

```powershell
git add -- LineOS/tests/docs-contract.test.mjs LineOS/docs
git commit -m "test(lineos): enforce bilingual document contracts"
```

---

### Task 9: Browser evidence, final verification and bilingual implementation report

**Files:**
- Create: **LineOS/artifacts/line-flex-studio/desktop-1440.png**
- Create: **LineOS/artifacts/line-flex-studio/mobile-390.png**
- Create: **LineOS/artifacts/line-flex-studio/verification-summary.json**
- Create: **LineOS/docs/reports/2026-08-01-line-flex-studio-implementation-report.en.md**
- Create: **LineOS/docs/reports/2026-08-01-line-flex-studio-implementation-report.th.md**
- Generate: matching **.en.html** and **.th.html**
- Modify: **LineOS/tests/docs-contract.test.mjs**

**Interfaces:**
- Consumes the completed app, tests and documents.
- Produces fresh evidence for the exact commit and environment.
- Does not send a LINE message or log in to a production console.

- [ ] **Step 1: Extend the document contract for the implementation report**

Add the report stem and require TH/EN Markdown/HTML. Require these headings in both languages: scope, commits, automated tests, browser checks, network evidence, acceptance-gate matrix, residual risk, NO-GO statement and next decision.

- [ ] **Step 2: Run the report contract and observe RED**

```powershell
npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs
```

Expected: FAIL because the implementation report files do not exist.

- [ ] **Step 3: Run the complete automated suite with fresh output**

```powershell
npm.cmd --prefix LineOS run test
```

Expected: every named suite passes with 0 failures. Capture the full start-to-summary output; truncated output is not PASS evidence.

- [ ] **Step 4: Start the local static server**

```powershell
python -m http.server 4177 --directory LineOS
```

Use browser testing against **http://localhost:4177/line-flex-studio.html**. Do not use a file URL because ES module behavior differs.

- [ ] **Step 5: Verify all five journeys in Thai and English**

For each preset:

1. choose preset;
2. inspect correct local hero, tenant/audience and action;
3. edit at least one Header, Hero, Body and Footer field;
4. verify preview, JSON and validation update;
5. induce and fix one blocking validation error;
6. copy and download valid JSON;
7. run journey;
8. verify exact-action review;
9. confirm and inspect demo receipt;
10. switch language and confirm no prior-language field leaks.

For design approval, change revision after opening Mock LIFF and verify confirmation fails closed.

- [ ] **Step 6: Verify responsive, accessibility and network behavior**

Check:

- 1440 desktop three-column layout;
- 1024 two-row layout;
- 768 transition;
- 390, 360 and 320 mobile tabs;
- keyboard-only completion;
- visible focus;
- dialog focus return;
- reduced motion;
- Thai long text, English long text, emoji and missing hero fallback;
- no horizontal page overflow;
- network log contains localhost resources only and zero LINE/Supabase/analytics requests.

Capture **desktop-1440.png** and **mobile-390.png** after the approval preset is valid and before confirmation.

- [ ] **Step 7: Write machine-readable verification evidence**

Create **verification-summary.json** only after collecting the observed values below:

```powershell
Get-Date -AsUTC -Format "o"
git rev-parse HEAD
git branch --show-current
node --version
```

Record the browser name and version from the browser-test session and the pass count from the complete, untruncated test summary. Use **apply_patch** to create the JSON; do not generate evidence before the checks run.

| JSON pointer | Type or fixed value | Evidence source |
|---|---|---|
| /schemaVersion | integer **1** | contract |
| /generatedAt | ISO-8601 UTC string | first command above |
| /repository/root | string **parent** | repository routing |
| /repository/commit | 40-character lowercase Git hash | second command above |
| /repository/branch | non-empty string | third command above |
| /runtime/node | semantic version string beginning **v** | fourth command above |
| /runtime/browser | non-empty browser name and full version | browser session |
| /runtime/url | **http://localhost:4177/line-flex-studio.html** | served target |
| /automated/command | **npm.cmd --prefix LineOS run test** | executed command |
| /automated/exitCode | integer **0** | completed process |
| /automated/tests | positive integer | complete test summary |
| /automated/failures | integer **0** | complete test summary |
| /browser/presetsChecked | integer **5** | journey matrix |
| /browser/languagesChecked | array **["th","en"]** | journey matrix |
| /browser/widthsChecked | array **[1440,1024,768,390,360,320]** | responsive matrix |
| /browser/externalRequests | integer **0** | captured request log |
| /acceptanceGates | array of exactly ten objects with integer **id**, **PASS** status and a real artifact/test reference | acceptance matrix |
| /liveLineMessageSent | boolean **false** | scope boundary |
| /productionSignatureCreated | boolean **false** | receipt truth boundary |
| /broaderCustomerMessagingDecision | **NO-GO_PENDING_TRUST_P0** | release decision |

Extend **docs-contract.test.mjs** to parse this file and reject a non-40-character commit, an empty browser string, a non-positive test count, any acceptance-gate count other than ten, any gate status other than **PASS**, or any evidence value that does not point to a named test, screenshot or network record.

- [ ] **Step 8: Write the aligned implementation reports**

Both reports must name:

- exact parent and nested commits observed at final verification;
- pre-existing dirty-tree caveat and files placed in scope;
- every created/modified file family;
- complete test command and pass/fail count;
- browser widths, presets, languages and screenshots;
- external request count;
- acceptance-gate matrix with evidence;
- what was not tested: live LINE send, production credentials, real identity, production signature, deployment and Tenant-2 proof;
- residual risks;
- explicit **NO-GO for broader customer messaging until Trust P0 passes**;
- recommended next decision: either retain standalone prototype or authorize a separate sandbox-integration design cycle.

- [ ] **Step 9: Render reports and rerun complete verification**

```powershell
python tools\render_docs.py "LineOS\docs\reports\2026-08-01-line-flex-studio-implementation-report.en.md" "LineOS\docs\reports\2026-08-01-line-flex-studio-implementation-report.th.md"
npm.cmd --prefix LineOS run test
python tools\lint_claims.py LineOS\docs
git diff --check -- LineOS
```

Expected: HTML rendered; all tests PASS with 0 failures; claim lint exit 0; diff check no output.

- [ ] **Step 10: Stop the static server and commit Task 9**

Stop only the verified local server process. Then:

```powershell
git add -- LineOS/artifacts/line-flex-studio LineOS/docs/reports LineOS/tests/docs-contract.test.mjs
git commit -m "docs(lineos): record Flex Studio verification evidence"
```

- [ ] **Step 11: Run the final post-commit gate**

```powershell
npm.cmd --prefix LineOS run test
git status --short --branch
git log -10 --oneline --decorate
```

Expected: tests PASS with complete summary; status preserves unrelated pre-existing changes; the last task commits are visible. Do not call the repository clean unless the full status is actually clean.

---

## Plan self-review checklist

- [ ] Every requirement in the approved design maps to at least one task.
- [ ] All files remain under **LineOS/**.
- [ ] No task modifies the nested product repository.
- [ ] Every production module has a failing test before implementation.
- [ ] Thai/English Markdown and HTML pairing is enforced.
- [ ] Flex action versus LIFF behavior is tested, not merely documented.
- [ ] Receipt wording cannot be mistaken for production signing.
- [ ] No external network or live-send path is introduced.
- [ ] Browser evidence covers five presets, two languages and six widths.
- [ ] The final report preserves the Trust P0 NO-GO decision.

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven** — dispatch a fresh task-scoped agent with review gates between tasks. Use only if the user explicitly authorizes subagents.
2. **Inline Execution** — execute this plan in the current session with superpowers:executing-plans and explicit checkpoints.

The implementation must not start until the user chooses an execution option.

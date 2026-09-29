import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, copyFile, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "..");
const spec = "docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design";
const plan = "docs/superpowers/plans/2026-08-01-monolith-line-flex-studio-implementation";
const designApprovalSpec = "docs/superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design";
const designApprovalPlan = "docs/superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation";
const designApprovalGuide = "docs/guides/line-design-approval-sandbox-a1-guide";
const designApprovalImplementationReport = "docs/reports/2026-08-02-line-design-approval-port-a1-implementation-report";
const designApprovalVerificationSummary = "artifacts/line-design-approval-a1/verification-summary.json";
const designApprovalBrowserObservation = "artifacts/line-design-approval-a1/browser-observed.json";
const designApprovalFullSuiteJunit = "artifacts/line-design-approval-a1/full-suite.junit.xml";
const designApprovalBrowserProducer = "tests/line-design-approval-browser-evidence.py";
const designApprovalScreenshots = {
  desktop1440: "artifacts/line-design-approval-a1/desktop-1440.png",
  mobile390: "artifacts/line-design-approval-a1/mobile-390.png"
};
const research = "docs/research/2026-08-01-monolith-line-human-surface-deep-research";
const implementationReport = "docs/reports/2026-08-01-line-flex-studio-implementation-report";
const verificationSummary = "artifacts/line-flex-studio/verification-summary.json";
const guideStems = [
  "docs/guides/line-flex-studio-user-guide",
  "docs/guides/line-developer-console-installation",
  "docs/guides/line-flex-action-vs-liff-decision-guide",
  "docs/guides/line-flex-performance-rendering-checklist",
  designApprovalGuide
];
const documentStems = [
  spec,
  plan,
  research,
  ...guideStems,
  implementationReport,
  designApprovalImplementationReport
];
const manifestStems = [...documentStems, designApprovalSpec, designApprovalPlan];
const read = (path) => readFile(resolve(root, path), "utf8").then((contents) => contents.replace(/\r\n?/g, "\n"));
const editions = ["en", "th"];
const exactConclusion = "MONOLITH should be a multi-tenant, revision-controlled project and product operating system. LINE is a replaceable Human Surface. Daph is one pilot tenant. Broader customer messaging remains NO-GO until every Trust P0 gate passes with fresh evidence.";
const readinessBoundaries = {
  en: "Source presence does not prove deployment or production readiness.",
  th: "การมี source ไม่ได้พิสูจน์ deployment หรือความพร้อมใช้งานจริงระดับ production"
};
const designApprovalGuideSectionClaims = {
  en: {
    preamble: [
      "Human Surface contract-ready with sandbox adapter — not connected to MONOLITH runtime."
    ],
    2: [
      "Only the `design-approval` preset routes through the A1 `DesignApprovalPort`; the other four presets keep the legacy local demo journey.",
      "The A1 review token is opaque and non-secret; it carries no customer, tenant, role, recipient, project, or authorization claim."
    ],
    4: [
      "`providerContext` is display provenance only; it is not tenant authority and must not be read as a tenant assertion."
    ],
    6: [
      "Sandbox Verification Record — Demo · No Business Effect",
      "A1 performs no workflow mutation, sends no LINE message, writes no database record, creates no cryptographic signature, and makes no production audit claim."
    ],
    7: [
      "The A1 ledger is session-only: reload or browser restart may reset it, so replay guarantees do not survive that reset."
    ],
    8: [
      "The defensible result is contract evidence for A1 only. It is not runtime integration, production readiness, customer delivery, or approval authority."
    ],
    9: [
      "A2 promotion requires separate owner approval and all seven gates below; passing A1 alone does not authorize runtime integration."
    ]
  },
  th: {
    preamble: [
      "Human Surface contract-ready with sandbox adapter — ยังไม่เชื่อมต่อ MONOLITH runtime"
    ],
    2: [
      "เฉพาะ preset `design-approval` เท่านั้นที่ route ผ่าน A1 `DesignApprovalPort`; presets อีกสี่รายการยังใช้ legacy local demo journey",
      "A1 review token เป็น opaque และ non-secret; token นี้ไม่มี customer, tenant, role, recipient, project หรือ authorization claim"
    ],
    4: [
      "`providerContext` เป็นเพียง display provenance ไม่ใช่ tenant authority และห้ามตีความเป็น tenant assertion"
    ],
    6: [
      "Sandbox Verification Record — Demo · No Business Effect",
      "A1 ไม่ทำ workflow mutation, ไม่ส่งข้อความ LINE, ไม่เขียน database record, ไม่สร้าง cryptographic signature และไม่อ้างว่า production audit เสร็จสมบูรณ์"
    ],
    7: [
      "A1 ledger เป็น session-only: การ reload หรือ restart browser อาจ reset ledger จึงไม่มี replay guarantee หลังการ reset นั้น"
    ],
    8: [
      "ผลที่รองรับได้คือ contract evidence ของ A1 เท่านั้น ไม่ใช่ runtime integration, production readiness, customer delivery หรือ approval authority"
    ],
    9: [
      "การ promote ไป A2 ต้องได้รับ owner approval แยกและผ่าน gate ทั้งเจ็ดข้อด้านล่าง; การผ่าน A1 เพียงอย่างเดียวไม่อนุญาต runtime integration"
    ]
  }
};
const versionConflictGuidance = {
  en: "Start a new sandbox review to load the adapter-owned current snapshot; no MONOLITH workflow is queried.",
  th: "เริ่ม sandbox review ใหม่เพื่อโหลด adapter-owned current snapshot; โดยไม่มีการ query MONOLITH workflow"
};
const a2PromotionGateTerms = [
  "A1 contract and browser evidence",
  "canonical server-owned revision source",
  "tenant–organization–site mapping",
  "customer-design-view database contract tests",
  "narrow LIFF confirmation transport design",
  "rollback, idempotency, audit, and error semantics",
  "local environment and secret-handling authority"
];
const a2PromotionGateModel = a2PromotionGateTerms.map((name, index) => ({
  order: index + 1,
  name,
  status: index === 0 ? "CLOSED" : "OPEN",
  satisfaction: index === 0 ? "SATISFIED" : "UNSATISFIED"
}));
const a2GateVisibleClaims = a2PromotionGateModel.map(({ order, name, status, satisfaction }) => (
  `Gate ${order} — ${name} — ${status}${order === 1 ? ` / ${satisfaction}` : ""}.`
));
const prohibitedDesignApprovalClaims = {
  en: [
    ["runtime integration", /\b(?:A1|the A1 (?:sandbox|journey|result)|the defensible result|this (?:sandbox|journey|result))\s+(?:(?:is|is now|has become|runs as)\s+(?:fully\s+)?(?:runtime[- ]integrated|integrated (?:with|into) (?:the )?MONOLITH runtime)|(?:connects|integrates|has connected|is connected)\s+(?:directly\s+)?(?:to|with|into)\s+(?:the\s+)?MONOLITH runtime)\b/i],
    ["production readiness", /\b(?:A1|the A1 (?:sandbox|journey|result)|the defensible result|this (?:sandbox|journey|result))\s+(?:is|is now|has become)\s+(?:fully\s+)?(?:production[- ]ready|ready for production)\b/i],
    ["workflow effect", /(?:(?<!no )\b(?:the )?MONOLITH workflow\s+(?:is|was|has been)\s+(?:queried|updated|mutated|changed|approved)|\b(?:A1|the A1 (?:sandbox|journey|result)|the defensible result|this (?:sandbox|journey|result))\s+(?:(?:changes|updates|mutates|queries|approves)|has (?:changed|updated|mutated|queried|approved))\s+(?:the\s+)?MONOLITH workflow)\b/i],
    ["approval effect", /(?:(?<!no )\b(?:workflow|design|customer) approval\s+(?:is|was|has been)\s+(?:approved|granted|recorded|completed)|\b(?:A1|the A1 (?:sandbox|journey|result)|the defensible result|this (?:sandbox|journey|result))\s+(?:(?:records|grants|approves|completes)|has (?:recorded|granted|approved|completed))\s+(?:the\s+)?(?:workflow|design|customer) approval)\b/i]
  ],
  th: [
    ["runtime integration", /(?:A1|ผลที่รองรับได้|ผลลัพธ์ A1|sandbox A1)\s*(?:เชื่อมต่อ(?:กับ)?|เชื่อมกับ|เชื่อมเข้ากับ|ทำงานร่วมกับ)\s*MONOLITH runtime(?:\s*(?:แล้ว|เรียบร้อยแล้ว|อย่างสมบูรณ์))?/iu],
    ["production readiness", /(?:A1|ผลที่รองรับได้|ผลลัพธ์ A1|sandbox A1)\s*(?:พร้อมใช้งานจริง(?:ระดับ production)?|เป็น production[- ]ready)(?:\s*(?:แล้ว|เรียบร้อยแล้ว))?/iu],
    ["workflow effect", /(?:(?<!ไม่)มีการ\s+(?:query|เรียกใช้|อัปเดต|เปลี่ยน)\s+MONOLITH workflow|MONOLITH workflow\s+(?:ถูก query|ถูกเรียกใช้|เปลี่ยน|อัปเดต|ได้รับอนุมัติ)(?:แล้ว|เรียบร้อยแล้ว)?|(?:A1|ผลที่รองรับได้|ผลลัพธ์ A1|sandbox A1)\s*(?:ได้)?(?:query|เรียกใช้|อัปเดต|เปลี่ยน)\s+MONOLITH workflow(?:แล้ว|เรียบร้อยแล้ว)?)/iu],
    ["approval effect", /(?:(?:workflow|design|customer)\s*approval\s+(?:ได้รับอนุมัติ|สำเร็จ|เสร็จสมบูรณ์|ถูกบันทึก)(?:แล้ว|เรียบร้อยแล้ว)?|(?:A1|ผลที่รองรับได้|ผลลัพธ์ A1|sandbox A1)\s*(?:ได้)?(?:บันทึก|อนุมัติ|ให้)\s*(?:workflow|design|customer)\s*approval(?:แล้ว|เรียบร้อยแล้ว)?)/iu]
  ]
};
const templateMarker = /\b(TBD|TODO|FIXME|implement later|fill in details)\b/i;
const unsafeReadinessClaim = /production[- ]ready because|tests exist, therefore production/i;

const proseOnly = (markdown) => markdown
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^(`{3,}|~{3,})[^\r\n]*(?:\r?\n)[\s\S]*?^\1[ \t]*$/gm, "")
  .replace(/(`+)([^`\r\n]*?)\1/g, "");

const visibleGuideMarkdown = (markdown) => {
  const withoutComments = markdown.replace(
    /<!--[\s\S]*?(?:-->|$)/g,
    (comment) => comment.replace(/[^\r\n]/g, " ")
  );
  const visibleLines = [];
  let fence = null;
  for (const line of withoutComments.split(/\n/)) {
    const hasCr = line.endsWith("\r");
    const content = hasCr ? line.slice(0, -1) : line;
    const maskedLine = `${" ".repeat(content.length)}${hasCr ? "\r" : ""}`;
    if (fence) {
      const closer = content.match(/^[ \t]{0,3}(`+|~+)[ \t]*$/);
      if (closer && closer[1][0] === fence.character && closer[1].length >= fence.length) {
        fence = null;
      }
      visibleLines.push(maskedLine);
      continue;
    }

    const opener = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (opener) {
      fence = { character: opener[1][0], length: opener[1].length };
      visibleLines.push(maskedLine);
      continue;
    }
    visibleLines.push(line);
  }
  return visibleLines.join("\n");
};

const visibleGuideProse = (markdown) => visibleGuideMarkdown(markdown)
  .replace(/(`+)([^\r\n]*?)\1/g, "$2");

const visibleClaimCount = (markdown, claim) => {
  const visibleMarkdown = visibleGuideMarkdown(markdown);
  const inlineRanges = [...visibleMarkdown.matchAll(/(`+)([^\r\n]*?)\1/g)]
    .map((match) => [match.index, match.index + match[0].length]);
  let count = 0;
  let index = visibleMarkdown.indexOf(claim);
  while (index !== -1) {
    const end = index + claim.length;
    if (!inlineRanges.some(([start, finish]) => index >= start && end <= finish)) {
      count += 1;
    }
    index = visibleMarkdown.indexOf(claim, index + claim.length);
  }
  return count;
};

const requireReadinessBoundary = (markdown, language) => {
  assert.ok(
    markdown.includes(readinessBoundaries[language]),
    `${language}: missing exact source-presence readiness boundary`
  );
};

const section = (markdown, number) => {
  const start = markdown.search(new RegExp(`^## ${number}\\. `, "m"));
  assert.notEqual(start, -1, `missing section ${number}`);
  const bodyStart = markdown.indexOf("\n", start) + 1;
  const tail = markdown.slice(bodyStart);
  const relativeEnd = number === 20 ? -1 : tail.search(new RegExp(`^## ${number + 1}\\. `, "m"));
  return relativeEnd === -1 ? tail : tail.slice(0, relativeEnd);
};

const guideSection = (markdown, number) => {
  const visibleMarkdown = visibleGuideMarkdown(markdown);
  const start = visibleMarkdown.search(new RegExp(`^ {0,3}## ${number}\\. `, "m"));
  assert.notEqual(start, -1, `missing guide section ${number}`);
  const bodyStart = visibleMarkdown.indexOf("\n", start) + 1;
  const visibleTail = visibleMarkdown.slice(bodyStart);
  const relativeEnd = visibleTail.search(/^ {0,3}##\s+/m);
  const end = relativeEnd === -1 ? markdown.length : bodyStart + relativeEnd;
  return markdown.slice(bodyStart, end);
};

const h2s = (markdown) => [...visibleGuideMarkdown(markdown).matchAll(/^ {0,3}## (\d+)\. (.+)$/gm)]
  .map((match) => ({ number: Number(match[1]), title: match[2] }));

const guidePreamble = (markdown) => {
  const end = visibleGuideMarkdown(markdown).search(/^ {0,3}## 1\. /m);
  assert.notEqual(end, -1, "missing guide section 1");
  return markdown.slice(0, end);
};

const assertUniqueSectionClaim = (markdown, body, claim, language, sectionName) => {
  assert.ok(
    visibleClaimCount(body, claim) > 0,
    `${language}: section ${sectionName} missing exact claim: ${claim}`
  );
  assert.equal(
    visibleClaimCount(markdown, claim),
    1,
    `${language}: exact claim must appear once in section ${sectionName}: ${claim}`
  );
};

const assertNoProhibitedDesignApprovalClaims = (markdown, language) => {
  const prose = visibleGuideProse(markdown);
  for (const [label, pattern] of prohibitedDesignApprovalClaims[language]) {
    assert.doesNotMatch(prose, pattern, `${language}: prohibited affirmative ${label} claim`);
  }
};

const setExpectedVersionConflictGuidance = (markdown, language) => markdown.replace(
  /^\| `version_conflict` \|.*$/m,
  `| \`version_conflict\` | ${versionConflictGuidance[language]} |`
);

const validateDesignApprovalGuide = (markdown, language) => {
  assertNoProhibitedDesignApprovalClaims(markdown, language);
  assert.deepEqual(
    h2s(markdown).map(({ number }) => number),
    Array.from({ length: 9 }, (_, index) => index + 1),
    `${language}: A1 guide must have exactly numbered sections 1–9`
  );

  for (const [sectionName, claims] of Object.entries(designApprovalGuideSectionClaims[language])) {
    const body = sectionName === "preamble" ? guidePreamble(markdown) : guideSection(markdown, Number(sectionName));
    for (const claim of claims) {
      assertUniqueSectionClaim(markdown, body, claim, language, sectionName);
    }
  }

  const versionBody = guideSection(markdown, 5);
  assert.ok(
    versionBody.includes(`| \`version_conflict\` | ${versionConflictGuidance[language]} |`),
    `${language}: section 5 missing exact version-conflict guidance`
  );

  const a2Start = visibleGuideMarkdown(markdown).search(/^ {0,3}## 9\. /m);
  assert.notEqual(a2Start, -1, `${language}: missing A2 section 9`);
  const beforeA2 = visibleGuideProse(markdown.slice(0, a2Start));
  const a2Body = visibleGuideProse(guideSection(markdown, 9));
  const gates = [...a2Body.matchAll(/^(\d+)\. (.+)$/gm)]
    .map((match) => ({ number: Number(match[1]), text: match[2] }));
  assert.deepEqual(
    gates.map(({ number }) => number),
    Array.from({ length: 7 }, (_, index) => index + 1),
    `${language}: section 9 must contain exactly ordered A2 gates 1–7`
  );
  a2PromotionGateTerms.forEach((term, index) => {
    assert.ok(gates[index].text.includes(term), `${language}: A2 gate ${index + 1} missing: ${term}`);
    assert.ok(!beforeA2.includes(term), `${language}: A2 gate ${index + 1} appears before section 9: ${term}`);
    assert.equal(
      markdown.split(term).length - 1,
      1,
      `${language}: A2 gate ${index + 1} term must appear exactly once: ${term}`
    );
  });
};

const tableRow = (body, state) => {
  const line = body.split("\n").find((candidate) => candidate.startsWith(`| ${state} |`));
  assert.ok(line, `missing lifecycle row: ${state}`);
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
};

const stripHtml = (value) => value
  .replace(/<[^>]+>/g, "")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'");

const visibleHtmlText = (html) => stripHtml(html
  .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " "));

const expectedJourneys = [
  "design-approval:th", "quote-order:th", "sla-escalation:th", "site-update:th", "issue-evidence:th",
  "design-approval:en", "quote-order:en", "sla-escalation:en", "site-update:en", "issue-evidence:en"
];
const expectedJourneyAssertions = [
  "local hero, tenant, audience, and exported action inspected",
  "Header, Hero, Body, and Footer edited",
  "preview, JSON, and validation updated",
  "blocking error induced and fixed",
  "valid JSON copied and downloaded",
  "Mock LIFF exact-action review completed",
  "demo intent confirmed and demo receipt inspected",
  "opposite-language preset restored without field leak"
];
const expectedResponsiveLayouts = {
  1440: "three-column PASS",
  1024: "two-row PASS",
  768: "two-row transition PASS",
  390: "mobile tabs PASS",
  360: "mobile tabs PASS",
  320: "mobile tabs PASS"
};
const expectedZeroOverflow = { 1440: 0, 1024: 0, 768: 0, 390: 0, 360: 0, 320: 0 };

const slugTestName = (name) => name
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const namedTestAnchors = (source) => new Set(
  [...source.matchAll(/\btest\(\s*"((?:[^"\\]|\\.)*)"\s*,/g)]
    .map((match) => slugTestName(JSON.parse(`"${match[1]}"`)))
);

const validateNetworkRecord = (summary) => {
  const record = summary.browser?.networkRecord;
  assert.ok(record && typeof record === "object" && !Array.isArray(record) && Object.keys(record).length > 0,
    "networkRecord is required");
  assert.ok(Number.isInteger(record.requestCount) && record.requestCount > 0,
    "networkRecord request count must be positive");
  assert.deepEqual(record.allowedHosts, ["localhost"], "networkRecord hosts must be localhost only");
  assert.equal(record.externalRequestCount, 0, "networkRecord external requests must be zero");
  assert.equal(record.externalRequestCount, summary.browser.externalRequests,
    "networkRecord external count must match browser summary");
  assert.equal(record.lineSupabaseAnalyticsRequestCount, 0,
    "networkRecord LINE/Supabase/analytics requests must be zero");
  assert.equal(record.unexpectedConsoleErrorCount, 0,
    "networkRecord unexpected console errors must be zero");
  assert.equal(record.pageErrorCount, 0, "networkRecord page errors must be zero");
  assert.equal(record.expectedInducedLocalHeroAbortErrors, 1,
    "networkRecord induced hero abort count must be one");
  assert.deepEqual(record.journeys, expectedJourneys, "networkRecord journeys must be the exact 5x2 matrix");
  assert.deepEqual(record.journeyAssertions, expectedJourneyAssertions,
    "networkRecord journey assertions are incomplete");
  assert.deepEqual(record.responsiveLayouts, expectedResponsiveLayouts,
    "networkRecord responsive results must be the exact six PASS layouts");
  assert.deepEqual(record.horizontalOverflowPixels, expectedZeroOverflow,
    "networkRecord overflow must be zero at all six widths");
  assert.equal(record.staleRevisionFailClosed, true, "networkRecord stale revision must fail closed");
  assert.equal(record.keyboardOnlyCompletion, true, "networkRecord keyboard completion must pass");
  assert.equal(record.visibleFocus, "3px solid rgb(240, 185, 77)",
    "networkRecord visible focus evidence is invalid");
  assert.equal(record.dialogFocusReturned, true, "networkRecord dialog focus return must pass");
  assert.equal(record.reducedMotion, "0.01ms equivalent animation and transition duration",
    "networkRecord reduced-motion evidence is invalid");
  assert.equal(record.thaiLongText, "PASS", "networkRecord Thai long-text check must pass");
  assert.equal(record.englishLongText, "PASS", "networkRecord English long-text check must pass");
  assert.equal(record.emoji, "PASS", "networkRecord emoji check must pass");
  assert.equal(record.missingHeroFallback,
    "PASS after one intentionally aborted localhost image request",
    "networkRecord missing-hero fallback must pass");
};

const resolveEvidenceReference = async (summary, evidence) => {
  const [artifact, anchor = ""] = evidence.split("#", 2);
  const artifactPath = resolve(root, artifact);
  await access(artifactPath);

  if (artifact.startsWith("tests/")) {
    const anchors = namedTestAnchors(await readFile(artifactPath, "utf8"));
    assert.ok(anchors.has(anchor), `test anchor does not resolve: ${evidence}`);
    return;
  }

  if (artifact.endsWith(".png")) {
    const screenshot = Object.values(summary.browser?.screenshots ?? {})
      .find((candidate) => candidate?.path === artifact);
    assert.ok(screenshot, `screenshot record does not resolve: ${evidence}`);
    assert.match(screenshot.sha256 ?? "", /^[0-9A-F]{64}$/, "screenshot SHA-256 is invalid");
    const actual = createHash("sha256").update(await readFile(artifactPath)).digest("hex").toUpperCase();
    assert.equal(actual, screenshot.sha256, `screenshot SHA-256 mismatch: ${evidence}`);
    assert.equal(screenshot.visualInspection, "PASS", `screenshot visual inspection must PASS: ${evidence}`);
    return;
  }

  assert.equal(artifact, verificationSummary, `unsupported evidence artifact: ${evidence}`);
  assert.equal(anchor, "/browser/networkRecord", `unsupported JSON pointer: ${evidence}`);
  validateNetworkRecord(summary);
};

const validateVerificationSummary = async (summary) => {
  assert.equal(summary.schemaVersion, 1);
  const timestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(summary.generatedAt);
  assert.ok(timestamp, "invalid generatedAt format");
  const generatedAtInstant = Date.parse(summary.generatedAt);
  assert.ok(Number.isFinite(generatedAtInstant), "invalid generatedAt instant");
  const generatedAtDate = new Date(generatedAtInstant);
  assert.deepEqual(
    [
      generatedAtDate.getUTCFullYear(),
      generatedAtDate.getUTCMonth() + 1,
      generatedAtDate.getUTCDate(),
      generatedAtDate.getUTCHours(),
      generatedAtDate.getUTCMinutes(),
      generatedAtDate.getUTCSeconds(),
    ],
    timestamp.slice(1, 7).map(Number),
    "invalid generatedAt calendar date",
  );
  assert.equal(summary.repository?.root, "parent");
  assert.match(summary.repository?.commit ?? "", /^[0-9a-f]{40}$/, "invalid repository commit");
  assert.match(summary.repository?.branch ?? "", /\S/, "empty repository branch");
  assert.match(summary.runtime?.node ?? "", /^v\d+\.\d+\.\d+/, "invalid Node version");
  assert.match(summary.runtime?.browser ?? "", /\S/, "empty browser string");
  assert.equal(summary.runtime?.url, "http://localhost:4177/line-flex-studio.html");
  assert.equal(summary.automated?.command, "npm.cmd --prefix LineOS run test");
  assert.equal(summary.automated?.exitCode, 0);
  assert.ok(Number.isInteger(summary.automated?.tests) && summary.automated.tests > 0,
    "non-positive automated test count");
  assert.equal(summary.automated?.failures, 0);
  assert.equal(summary.browser?.presetsChecked, 5);
  assert.deepEqual(summary.browser?.languagesChecked, ["th", "en"]);
  assert.deepEqual(summary.browser?.widthsChecked, [1440, 1024, 768, 390, 360, 320]);
  assert.equal(summary.browser?.externalRequests, 0);
  assert.ok(Array.isArray(summary.acceptanceGates) && summary.acceptanceGates.length === 10,
    "acceptance gate count must be ten");
  const allowedEvidence = /^(?:tests\/[a-z0-9-]+\.test\.mjs#[a-z0-9-]+|artifacts\/line-flex-studio\/(?:desktop-1440|mobile-390)\.png|artifacts\/line-flex-studio\/verification-summary\.json#\/browser\/networkRecord)$/;
  const ids = [];
  for (const gate of summary.acceptanceGates) {
    assert.ok(Number.isInteger(gate.id), "acceptance gate id must be an integer");
    ids.push(gate.id);
    assert.equal(gate.status, "PASS", `gate ${gate.id} status must be PASS`);
    assert.match(gate.evidence ?? "", allowedEvidence, `gate ${gate.id} has invalid evidence`);
  }
  assert.deepEqual(ids, Array.from({ length: 10 }, (_, index) => index + 1));
  assert.equal(summary.liveLineMessageSent, false);
  assert.equal(summary.productionSignatureCreated, false);
  assert.equal(summary.broaderCustomerMessagingDecision, "NO-GO_PENDING_TRUST_P0");
  validateNetworkRecord(summary);
  for (const gate of summary.acceptanceGates) {
    await resolveEvidenceReference(summary, gate.evidence);
  }
};

const designApprovalForbiddenFields = [
  "tenant", "tenantid", "tenantassertion", "customer", "customerid", "customeridentity",
  "role", "recipient", "project", "projectid", "projectowner", "approvalstatus", "approved",
  "signature", "signaturestatus", "keyid", "privatekey", "publickey", "signingkey", "secret",
  "lineidtoken", "accesstoken"
];
const designApprovalUiScenarios = ["success", "cancel", "legacy_preset"];
const designApprovalPortContractProbes = ["replay", "stale_revision", "expired"];
const designApprovalTask8Paths = [
  "LineOS/tests/docs-contract.test.mjs",
  `LineOS/${designApprovalScreenshots.desktop1440}`,
  `LineOS/${designApprovalScreenshots.mobile390}`,
  `LineOS/${designApprovalVerificationSummary}`,
  `LineOS/${designApprovalBrowserObservation}`,
  `LineOS/${designApprovalFullSuiteJunit}`,
  `LineOS/${designApprovalBrowserProducer}`,
  `LineOS/${designApprovalImplementationReport}.en.md`,
  `LineOS/${designApprovalImplementationReport}.th.md`,
  `LineOS/${designApprovalImplementationReport}.en.html`,
  `LineOS/${designApprovalImplementationReport}.th.html`
].sort();
const designApprovalReportHeadings = {
  en: [
    "Executive decision", "Scope", "Two-root provenance and dirty scope", "Changed files",
    "TDD RED → GREEN evidence", "Automated verification", "Browser evidence matrix",
    "Network and error evidence", "Record forbidden-field scan", "Screenshot and source binding",
    "Review gates", "Residual risks", "A2 promotion gates"
  ],
  th: [
    "คำตัดสินสำหรับผู้บริหาร", "ขอบเขต", "Provenance สอง Git root และ dirty scope", "ไฟล์ที่เปลี่ยน",
    "หลักฐาน TDD RED → GREEN", "การตรวจอัตโนมัติ", "เมทริกซ์หลักฐานเบราว์เซอร์",
    "หลักฐานเครือข่ายและข้อผิดพลาด", "การสแกน forbidden fields ของ record", "การผูก screenshot กับ source",
    "Review gates", "ความเสี่ยงคงเหลือ", "Promotion gates ไป A2"
  ]
};

const sha256Upper = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();
const canonicalLfBuffer = (value) => Buffer.from(
  Buffer.from(value).toString("utf8").replace(/\r\n?/g, "\n"),
  "utf8"
);
const canonicalLfIdentity = (value) => {
  const bytes = canonicalLfBuffer(value);
  return {
    normalization: "canonical-lf",
    canonicalLfBytes: bytes.length,
    canonicalLfSha256: sha256Upper(bytes)
  };
};
const statusPath = (entry) => entry.slice(3).split(" -> ").at(-1);

const capturedTargetedEntries = (entries) => entries.filter(
  (entry) => /line-design-approval|LineOS/i.test(statusPath(entry))
);

const validateCapturedProvenance = (provenance) => {
  const parent = provenance?.parent;
  const nested = provenance?.nested;
  assert.equal(parent?.rootKind, "governance-bootstrap-isolated-worktree");
  assert.match(parent?.path ?? "", /monolith-lineos-design-approval-a1$/);
  assert.match(parent?.capturedBranch ?? "", /^codex\//);
  assert.match(parent?.baseCommitAtCapture ?? "", /^[0-9a-f]{40}$/);
  assert.equal(parent?.statusCommand, "git status --porcelain=v1 --untracked-files=all");
  assert.equal(parent?.capturedStatusEntries?.length, 11);
  assert.equal(
    parent?.capturedStatusSha256,
    sha256Upper(parent.capturedStatusEntries.join("\n")),
    "parent captured status hash mismatch"
  );
  assert.deepEqual(
    [...new Set(parent.capturedStatusEntries.map(statusPath))].sort(),
    designApprovalTask8Paths,
    "captured parent scope must contain the exact approved 11 Task 8 paths"
  );

  assert.equal(nested?.rootKind, "active-product-nested-repository");
  assert.match(nested?.path ?? "", /determined-williams$/);
  assert.equal(nested?.capturedBranch, "fix/dxf-truth-chain");
  assert.match(nested?.commitAtCapture ?? "", /^[0-9a-f]{40}$/);
  assert.equal(nested?.statusCommand, "git status --porcelain=v1 --untracked-files=all");
  assert.equal(nested?.capturedStatusEntryCount, nested?.capturedStatusEntries?.length);
  assert.equal(
    nested?.capturedStatusSha256,
    sha256Upper(nested.capturedStatusEntries.join("\n")),
    "nested captured status hash mismatch"
  );
  const capturedNestedTargeted = capturedTargetedEntries(nested.capturedStatusEntries);
  assert.deepEqual(nested?.a1TargetedStatusEntries, capturedNestedTargeted);
  assert.deepEqual(capturedNestedTargeted, [], "captured nested scope contains an A1/LineOS path");
};

const validateA2PromotionGates = (summary) => {
  assert.deepEqual(
    summary.a2PromotionGates,
    a2PromotionGateModel,
    "A2 promotion gate statuses or order are fabricated"
  );
  assert.deepEqual(
    summary.a2Blockers,
    a2PromotionGateTerms.slice(1),
    "only A2 gates 2–7 may remain blockers"
  );
};

const junitFooterCount = (xml, label) => {
  const match = xml.match(new RegExp(`<!--\\s*${label}\\s+(\\d+)\\s*-->`));
  assert.ok(match, `JUnit footer missing ${label}`);
  return Number(match[1]);
};

const normalizeVisibleText = (value) => value
  .replace(/[*>#]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const reportClaims = {
  en: {
    heading: "Scope",
    decision: "Evidence-time decision: NO-GO_RUNTIME_INTEGRATION; runtime integration = false.",
    network: "Derived from 56 raw request events: external 0; failed 0; HTTP errors 0; console errors 0; page errors 0.",
    boundary: "This is evidence-time sandbox proof only; it is not runtime integration, production readiness, customer delivery, or approval authority.",
    provenance: "Evidence-time snapshot: base commit a816bf8d3ddc2f98c9c8e9ef42238df0593f2a8e and an immutable captured 11-path Task 8 status manifest.",
    substitution: "Uncoordinated substitution is detected; coordinated edits are not signature/tamper proof."
  },
  th: {
    heading: "ขอบเขต",
    decision: "คำตัดสิน ณ เวลาเก็บหลักฐาน: NO-GO_RUNTIME_INTEGRATION; runtime integration = false.",
    network: "ค่าที่ derive จาก raw request events 56 รายการ: external 0; failed 0; HTTP errors 0; console errors 0; page errors 0.",
    boundary: "นี่เป็นเพียงหลักฐาน sandbox ณ เวลาเก็บหลักฐาน ไม่ใช่ runtime integration, production readiness, customer delivery หรือ approval authority.",
    provenance: "Evidence-time snapshot: base commit a816bf8d3ddc2f98c9c8e9ef42238df0593f2a8e และ immutable captured status manifest ของ Task 8 จำนวน 11 paths.",
    substitution: "ตรวจพบการแทนที่ที่ไม่ประสานกัน แต่ coordinated edits ไม่ใช่ signature/tamper proof."
  }
};

const validateDesignApprovalReport = (markdown, html, language, summary) => {
  const visibleMarkdown = visibleGuideMarkdown(markdown);
  const visibleMarkdownText = normalizeVisibleText(visibleGuideProse(markdown));
  const visibleHtml = normalizeVisibleText(visibleHtmlText(html));
  const headings = (visibleMarkdown.match(/^## .+$/gm) ?? [])
    .map((line) => line.replace(/^## (?:\d+\. )?/, ""));
  for (const heading of designApprovalReportHeadings[language]) {
    assert.ok(headings.includes(heading), `${language} A1 report missing visible heading: ${heading}`);
  }
  const requiredClaims = [
    ...Object.values(reportClaims[language]).filter((claim) => claim !== reportClaims[language].heading),
    summary.sourceSnapshot.canonicalLfSha256,
    summary.provenance.nested.commitAtCapture,
    summary.browser.screenshots.desktop1440.sha256,
    summary.browser.screenshots.mobile390.sha256,
    ...a2GateVisibleClaims,
    ...a2PromotionGateTerms
  ];
  for (const claim of requiredClaims) {
    assert.ok(visibleMarkdownText.includes(claim), `${language} A1 report missing visible claim: ${claim}`);
    assert.ok(visibleHtml.includes(claim), `${language} A1 report HTML missing visible claim: ${claim}`);
    const inlineOnly = visibleMarkdown.split("\n").some((line) => {
      const match = line.trim().match(/^`+(.+?)`+$/);
      return match && normalizeVisibleText(match[1]) === claim;
    });
    assert.equal(inlineOnly, false, `${language} A1 report claim is hidden as whole-claim inline code: ${claim}`);
  }
};

const validateDesignApprovalEvidence = async (summary) => {
  assert.equal(summary.schemaVersion, 2);
  assert.equal(summary.decision, "NO-GO_RUNTIME_INTEGRATION");
  assert.deepEqual(summary.scope, {
    sandboxOnly: true,
    runtimeIntegration: false,
    productionCredentialsUsed: false,
    liveLineMessageSent: false,
    databaseWritePerformed: false,
    nestedProductModifiedByA1: false
  });

  const browserCaptureCommit = summary.sourceSnapshot?.baseCommitAtCapture;
  validateCapturedProvenance(summary.provenance);
  assert.match(browserCaptureCommit ?? "", /^[0-9a-f]{40}$/);

  const full = summary.automated?.fullSuite;
  assert.equal(full?.command, "npm.cmd --prefix LineOS run test");
  assert.equal(full?.exitCode, 0);
  for (const field of ["tests", "passed", "failures", "skipped", "cancelled", "todo"]) {
    assert.ok(Number.isInteger(full?.[field]) && full[field] >= 0, `invalid full-suite ${field} count`);
  }
  assert.ok(full.tests > 0, "full-suite test count must be positive");
  assert.equal(full.tests, full.passed + full.failures + full.skipped + full.cancelled + full.todo);
  assert.equal(full.failures, 0);
  assert.equal(full.skipped, 0);
  assert.equal(full.cancelled, 0);
  assert.equal(full.todo, 0);
  const junit = full?.junit;
  assert.equal(junit?.path, designApprovalFullSuiteJunit);
  const junitBytes = await readFile(resolve(root, junit.path));
  const junitIdentity = canonicalLfIdentity(junitBytes);
  const junitXml = canonicalLfBuffer(junitBytes).toString("utf8");
  assert.equal(junit?.normalization, "canonical-lf");
  assert.equal(junit?.canonicalLfBytes, 38260);
  assert.equal(junit?.canonicalLfBytes, junitIdentity.canonicalLfBytes);
  assert.equal(junit?.canonicalLfSha256, junitIdentity.canonicalLfSha256);
  assert.equal(junit?.testcaseElements, 336);
  assert.equal((junitXml.match(/<testcase\b/g) ?? []).length, junit.testcaseElements);
  assert.deepEqual(junit?.nodeSummary, {
    tests: junitFooterCount(junitXml, "tests"),
    passed: junitFooterCount(junitXml, "pass"),
    failures: junitFooterCount(junitXml, "fail"),
    cancelled: junitFooterCount(junitXml, "cancelled"),
    skipped: junitFooterCount(junitXml, "skipped"),
    todo: junitFooterCount(junitXml, "todo")
  });
  assert.deepEqual(junit.nodeSummary, {
    tests: 351, passed: 351, failures: 0, cancelled: 0, skipped: 0, todo: 0
  });
  assert.deepEqual(summary.automated?.producerSafetyRedContract, {
    command: "npm.cmd --prefix LineOS run test -- tests/docs-contract.test.mjs",
    exitCode: 1,
    tests: 90,
    passed: 88,
    failures: 2,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    reason: "Canonical evidence was stale and --help executed a capture before argparse isolation"
  });
  assert.deepEqual(summary.automated?.canonicalLfPortabilityRedContract, {
    command: "node --test tests/docs-contract.test.mjs",
    exitCode: 1,
    tests: 91,
    passed: 89,
    failures: 2,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    reason: "Expected missing canonical-LF evidence schema and stale report bindings before implementation"
  });
  assert.deepEqual(summary.automated?.canonicalLfPortabilityGreen, {
    command: "node --test tests/docs-contract.test.mjs",
    exitCode: 0,
    tests: 91,
    passed: 91,
    failures: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0
  });
  assert.deepEqual(
    { tests: full.tests, passed: full.passed, failures: full.failures, cancelled: full.cancelled, skipped: full.skipped, todo: full.todo },
    junit.nodeSummary
  );
  assert.deepEqual(summary.automated?.postReviewGreen, {
    command: "npm.cmd --prefix LineOS run test",
    exitCode: 0,
    tests: 351,
    passed: 351,
    failures: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0
  });
  assert.deepEqual(summary.automated?.latestLogicalRevalidation, {
    command: "npm.cmd --prefix LineOS run test",
    exitCode: 0,
    tests: 351,
    passed: 351,
    failures: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    artifactPolicy: "temporary timing-only JUnit XML is not retained; durable observed JUnit remains authoritative"
  });
  assert.equal(summary.automated?.claimLint?.exitCode, 0);
  assert.equal(summary.automated?.claimLint?.newDebtCount, 0);
  assert.equal(summary.automated?.diffCheck?.exitCode, 0);
  assert.equal(summary.automated?.diffCheck?.output, "");

  const browser = summary.browser;
  assert.equal(browser?.serverUrl, "http://localhost:4179/line-flex-studio.html");
  assert.match(browser?.engine ?? "", /^Chromium /);
  assert.equal(browser?.headless, true);
  assert.deepEqual(browser?.widths, [1440, 390]);
  assert.deepEqual(browser?.languages, ["en", "th"]);
  assert.equal(browser?.matrix?.length, 4);
  assert.deepEqual(
    browser.matrix.map(({ language, width }) => `${language}:${width}`).sort(),
    ["en:1440", "en:390", "th:1440", "th:390"]
  );
  for (const cell of browser.matrix) {
    assert.deepEqual(Object.keys(cell.uiJourneys).sort(), [...designApprovalUiScenarios].sort());
    assert.deepEqual(Object.keys(cell.portContractProbes).sort(), [...designApprovalPortContractProbes].sort());
    for (const result of Object.values(cell.uiJourneys)) assert.equal(result.status, "PASS");
    for (const result of Object.values(cell.portContractProbes)) assert.equal(result.status, "PASS");
    assert.equal(cell.uiJourneys.success.outcome, "sandbox_recorded");
    assert.equal(cell.uiJourneys.cancel.outcome, "cancelled_locally");
    assert.equal(cell.uiJourneys.legacy_preset.outcome, "legacy_demo_receipt");
    assert.equal(cell.portContractProbes.replay.outcome, "sandbox_replayed");
    assert.equal(cell.portContractProbes.stale_revision.errorCode, "stale_revision");
    assert.equal(cell.portContractProbes.expired.errorCode, "expired");
    assert.equal(cell.horizontalOverflowPixels, 0);
    assert.equal(cell.copyReadability, "PASS");
  }
  assert.equal(browser.keyboard?.completion, "PASS");
  assert.equal(browser.keyboard?.focusReturnedToRunJourney, true);
  assert.equal(browser.reducedMotion?.status, "PASS");
  assert.equal(browser.reducedMotion?.animationDurationMs <= 0.01, true);
  assert.equal(browser.reducedMotion?.transitionDurationMs <= 0.01, true);
  const observation = browser?.observation;
  assert.equal(observation?.path, designApprovalBrowserObservation);
  assert.equal(observation?.normalization, "canonical-lf");
  const rawBytes = await readFile(resolve(root, observation.path));
  const raw = JSON.parse(rawBytes.toString("utf8"));
  assert.deepEqual(
    {
      normalization: observation.normalization,
      canonicalLfBytes: observation.canonicalLfBytes,
      canonicalLfSha256: observation.canonicalLfSha256
    },
    canonicalLfIdentity(rawBytes)
  );
  assert.equal(observation?.producer?.path, designApprovalBrowserProducer);
  const producerBytes = await readFile(resolve(root, observation.producer.path));
  assert.deepEqual(observation.producer, {
    path: designApprovalBrowserProducer,
    ...canonicalLfIdentity(producerBytes)
  });
  assert.equal(raw.producer?.path, designApprovalBrowserProducer);
  assert.deepEqual(raw.producer, observation.producer);
  assert.deepEqual(raw.output, {
    mode: "canonical",
    directory: "artifacts/line-design-approval-a1"
  });
  assert.equal(raw.server?.host, "127.0.0.1");
  assert.equal(raw.server?.shutdownCompleted, true);
  assert.equal(raw.waitCondition, "networkidle");
  assert.deepEqual(browser.matrix, raw.matrix);
  const requestUrls = raw.network.events.requests.map(({ url }) => url);
  const requestHosts = [...new Set(requestUrls.map((url) => new URL(url).hostname))].sort();
  const externalRequests = requestUrls.filter((url) => new URL(url).hostname !== "localhost");
  const localResourcePaths = [...new Set(requestUrls
    .filter((url) => new URL(url).hostname === "localhost")
    .map((url) => decodeURIComponent(new URL(url).pathname)))].sort();
  const derivedNetwork = {
    requestCount: requestUrls.length,
    allowedHosts: requestHosts,
    externalRequestCount: externalRequests.length,
    failedRequestCount: raw.network.events.failedRequests.length,
    httpErrorCount: raw.network.events.httpErrors.length,
    consoleErrorCount: raw.network.events.consoleErrors.length,
    pageErrorCount: raw.network.events.pageErrors.length,
    localResourcePaths
  };
  assert.deepEqual(browser.network, derivedNetwork, "browser summary must be derived from raw event arrays");
  assert.equal(browser.network?.requestCount, 56);
  assert.equal(browser.network?.externalRequestCount, 0);
  assert.equal(browser.network?.httpErrorCount, 0);
  assert.equal(browser.network?.consoleErrorCount, 0);
  assert.equal(browser.network?.pageErrorCount, 0);
  assert.equal(browser.network?.failedRequestCount, 0);
  assert.deepEqual(browser.network?.allowedHosts, ["localhost"]);
  assert.ok(browser.network.localResourcePaths.every((path) => path.startsWith("/")));

  const snapshot = summary.sourceSnapshot;
  assert.equal(snapshot?.algorithm, "SHA-256");
  assert.equal(snapshot?.normalization, "canonical-lf");
  assert.match(snapshot?.canonicalLfSha256 ?? "", /^[0-9A-F]{64}$/);
  assert.deepEqual(snapshot?.files, [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path)), "source snapshot files must be sorted by path");
  assert.deepEqual(raw.sourceSnapshot, {
    normalization: "canonical-lf",
    canonicalLfSha256: snapshot.canonicalLfSha256,
    files: snapshot.files
  });
  assert.deepEqual(
    snapshot.files.map(({ path }) => `/${path}`),
    browser.network.localResourcePaths,
    "source snapshot must cover every requested local resource"
  );
  for (const file of snapshot.files) {
    assert.equal(file.normalization, "canonical-lf");
    assert.match(file.canonicalLfSha256 ?? "", /^[0-9A-F]{64}$/);
    assert.deepEqual(file, {
      path: file.path,
      ...canonicalLfIdentity(await readFile(resolve(root, file.path)))
    });
  }
  const snapshotManifest = snapshot.files.map(({ path, canonicalLfSha256, canonicalLfBytes }) => (
    `${path}\0${canonicalLfSha256}\0${canonicalLfBytes}`
  )).join("\n");
  assert.equal(snapshot.canonicalLfSha256, sha256Upper(snapshotManifest));

  for (const [name, path] of Object.entries(designApprovalScreenshots)) {
    const record = browser.screenshots?.[name];
    assert.equal(record?.path, path);
    assert.equal(record?.sourceSnapshotCanonicalLfSha256, snapshot.canonicalLfSha256);
    assert.equal(record?.baseCommitAtCapture, snapshot.baseCommitAtCapture);
    assert.deepEqual(raw.screenshots?.[name], {
      path,
      sha256: record.sha256,
      width: record.width,
      height: record.height,
      sourceSnapshotCanonicalLfSha256: snapshot.canonicalLfSha256,
      baseCommitAtCapture: snapshot.baseCommitAtCapture
    });
    const bytes = await readFile(resolve(root, path));
    assert.equal(record?.sha256, sha256Upper(bytes));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(record?.width, name === "desktop1440" ? 1440 : 390);
    assert.equal(record?.height, name === "desktop1440" ? 1000 : 844);
    assert.equal(bytes.readUInt32BE(16), record.width);
    assert.equal(bytes.readUInt32BE(20), record.height);
    assert.equal(record?.visualInspection, "PASS");
  }

  assert.deepEqual(summary.recordForbiddenFieldScan, {
    ...raw.recordForbiddenFieldScan,
    status: "PASS"
  });
  assert.deepEqual(summary.recordForbiddenFieldScan?.fields, designApprovalForbiddenFields);
  assert.equal(summary.recordForbiddenFieldScan?.occurrences, 0);
  assert.deepEqual(summary.recordForbiddenFieldScan?.matches, []);
  assert.equal(summary.recordForbiddenFieldScan?.status, "PASS");
  validateA2PromotionGates(summary);
};

test("canonical-LF evidence identities survive Windows checkout conversion and reject content mutation", () => {
  const representatives = {
    junit: "<?xml version=\"1.0\"?>\n<testsuites>\n\t<testcase name=\"portable\"/>\n</testsuites>\n",
    json: "{\n  \"schemaVersion\": 1,\n  \"portable\": true\n}\n",
    producer: "def canonical_lf_bytes(value):\n    return value.replace(b'\\r\\n', b'\\n')\n",
    source: "export const approval = {\n  mode: \"sandbox\"\n};\n"
  };

  for (const [label, lf] of Object.entries(representatives)) {
    const crlf = lf.replaceAll("\n", "\r\n");
    const loneCr = lf.replaceAll("\n", "\r");
    const expected = canonicalLfIdentity(lf);
    assert.deepEqual(canonicalLfIdentity(crlf), expected, `${label}: CRLF identity drifted`);
    assert.deepEqual(canonicalLfIdentity(loneCr), expected, `${label}: lone-CR identity drifted`);
    assert.notEqual(
      canonicalLfIdentity(`${lf}mutation`).canonicalLfSha256,
      expected.canonicalLfSha256,
      `${label}: content mutation was not detected`
    );
  }
});

test("approved document manifest is bilingual, standalone, and deterministically rendered", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lineos-document-manifest-"));
  try {
    for (const stem of manifestStems) {
      for (const language of editions) {
        const sourceMd = resolve(root, `${stem}.${language}.md`);
        const sourceHtml = resolve(root, `${stem}.${language}.html`);
        await access(sourceMd);
        await access(sourceHtml);

        const html = await readFile(sourceHtml, "utf8");
        assert.match(html, /^<!doctype html>/);
        assert.match(html, /<meta name="viewport"/);
        assert.match(html, new RegExp(`<html lang="${language}">`));

        const tempMd = join(scratch, basename(sourceMd));
        const tempHtml = tempMd.replace(/\.md$/, ".html");
        await copyFile(sourceMd, tempMd);
        const rendered = spawnSync("python", [resolve(repo, "tools", "render_docs.py"), tempMd], { encoding: "utf8" });
        assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
        assert.equal(await readFile(tempHtml, "utf8"), html, `${stem}.${language}.html is not deterministic`);
      }
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("A1 browser evidence and bilingual implementation reports preserve the final decision record", async () => {
  const summary = JSON.parse(await read(designApprovalVerificationSummary));
  await validateDesignApprovalEvidence(summary);

  for (const language of editions) {
    const [markdown, html] = await Promise.all([
      read(`${designApprovalImplementationReport}.${language}.md`),
      read(`${designApprovalImplementationReport}.${language}.html`)
    ]);
    validateDesignApprovalReport(markdown, html, language, summary);
    assert.match(visibleGuideProse(markdown), /UI-driven.*success.*cancel.*legacy_preset|UI-driven.*success.*cancel.*legacy_preset/is);
    assert.match(visibleGuideProse(markdown), /in-page port-contract probes.*replay.*stale_revision.*expired|in-page port-contract probes.*replay.*stale_revision.*expired/is);
    assert.match(visibleGuideProse(markdown), /1440.*390/is);
    assert.match(visibleGuideProse(markdown), /English|ภาษาอังกฤษ/);
    assert.match(visibleGuideProse(markdown), /Thai|ภาษาไทย/);
    assert.doesNotMatch(html, /&lt;br\s*\/?&gt;/i);
  }
});

test("A1 captured provenance survives replayed history but rejects falsified capture data", async () => {
  const summary = JSON.parse(await read(designApprovalVerificationSummary));
  assert.doesNotThrow(() => validateCapturedProvenance(summary.provenance));

  const malformedParentCommit = structuredClone(summary.provenance);
  malformedParentCommit.parent.baseCommitAtCapture = "not-a-commit";
  assert.throws(() => validateCapturedProvenance(malformedParentCommit), /regular expression/);

  const forgedNestedCommit = structuredClone(summary.provenance);
  forgedNestedCommit.nested.commitAtCapture = "not-a-commit";
  assert.throws(() => validateCapturedProvenance(forgedNestedCommit), /regular expression/);
  const forgedNestedBranch = structuredClone(summary.provenance);
  forgedNestedBranch.nested.capturedBranch = "forged/branch";
  assert.throws(() => validateCapturedProvenance(forgedNestedBranch), /fix\/dxf-truth-chain/);

  const tamperedParent = structuredClone(summary.provenance);
  tamperedParent.parent.capturedStatusEntries[0] = " M LineOS/UNAPPROVED.txt";
  assert.throws(() => validateCapturedProvenance(tamperedParent), /hash mismatch/);
  tamperedParent.parent.capturedStatusSha256 = sha256Upper(tamperedParent.parent.capturedStatusEntries.join("\n"));
  assert.throws(() => validateCapturedProvenance(tamperedParent), /exact approved 11/);

  const tamperedNested = structuredClone(summary.provenance);
  tamperedNested.nested.capturedStatusEntries.push("?? LineOS/forbidden-a1.txt");
  tamperedNested.nested.capturedStatusEntryCount += 1;
  tamperedNested.nested.capturedStatusSha256 = sha256Upper(tamperedNested.nested.capturedStatusEntries.join("\n"));
  tamperedNested.nested.a1TargetedStatusEntries = ["?? LineOS/forbidden-a1.txt"];
  assert.throws(() => validateCapturedProvenance(tamperedNested), /captured nested scope/);
  for (const targetedPath of ["docs/line-design-approval-report.md", "LineOS.md"]) {
    const capturedCandidate = structuredClone(summary.provenance);
    const entry = `?? ${targetedPath}`;
    capturedCandidate.nested.capturedStatusEntries.push(entry);
    capturedCandidate.nested.capturedStatusEntryCount += 1;
    capturedCandidate.nested.capturedStatusSha256 = sha256Upper(
      capturedCandidate.nested.capturedStatusEntries.join("\n")
    );
    capturedCandidate.nested.a1TargetedStatusEntries = [entry];
    assert.throws(
      () => validateCapturedProvenance(capturedCandidate),
      /captured nested scope/,
      `captured policy must reject ${targetedPath}`
    );
  }

  assert.doesNotThrow(() => validateA2PromotionGates(summary));
  const fabricatedGateOne = structuredClone(summary);
  fabricatedGateOne.a2PromotionGates[0].status = "OPEN";
  fabricatedGateOne.a2PromotionGates[0].satisfaction = "UNSATISFIED";
  assert.throws(() => validateA2PromotionGates(fabricatedGateOne), /fabricated/);
  const fabricatedGateTwo = structuredClone(summary);
  fabricatedGateTwo.a2PromotionGates[1].status = "CLOSED";
  fabricatedGateTwo.a2PromotionGates[1].satisfaction = "SATISFIED";
  assert.throws(() => validateA2PromotionGates(fabricatedGateTwo), /fabricated/);
  const reorderedGates = structuredClone(summary);
  [reorderedGates.a2PromotionGates[1], reorderedGates.a2PromotionGates[2]] = [
    reorderedGates.a2PromotionGates[2], reorderedGates.a2PromotionGates[1]
  ];
  assert.throws(() => validateA2PromotionGates(reorderedGates), /fabricated/);
  const fabricatedBlockers = structuredClone(summary);
  fabricatedBlockers.a2Blockers.unshift(a2PromotionGateTerms[0]);
  assert.throws(() => validateA2PromotionGates(fabricatedBlockers), /only A2 gates 2–7/);
});

test("A1 report contract rejects decision evidence hidden from readers", async () => {
  const summary = JSON.parse(await read(designApprovalVerificationSummary));
  for (const language of editions) {
    const markdown = await read(`${designApprovalImplementationReport}.${language}.md`);
    const html = await read(`${designApprovalImplementationReport}.${language}.html`);
    const claims = reportClaims[language];
    const mutations = [
      ["heading", markdown.replace(`## ${claims.heading}`, `<!-- ## ${claims.heading} -->`)],
      ["heading in fenced code", markdown.replace(`## ${claims.heading}`, `\`\`\`text\n## ${claims.heading}\n\`\`\``)],
      ["decision", markdown.replace(claims.decision, `<!-- ${claims.decision} -->`)],
      ["network/error", markdown.replace(claims.network, `<!-- ${claims.network} -->`)],
      ["runtime boundary", markdown.replace(claims.boundary, `<!-- ${claims.boundary} -->`)],
      ["runtime boundary in fenced code", markdown.replace(claims.boundary, `\`\`\`text\n${claims.boundary}\n\`\`\``)],
      ["nested commit", markdown.replaceAll(summary.provenance.nested.commitAtCapture, `<!-- ${summary.provenance.nested.commitAtCapture} -->`)],
      ["A2 gate status", markdown.replace(a2GateVisibleClaims[0], `<!-- ${a2GateVisibleClaims[0]} -->`)],
      ["A2 gate status in fenced code", markdown.replace(a2GateVisibleClaims[0], `\`\`\`text\n${a2GateVisibleClaims[0]}\n\`\`\``)],
      ["whole-claim inline code", markdown.replace(claims.boundary, `\`${claims.boundary}\``)]
    ];
    for (const [label, candidate] of mutations) {
      assert.notEqual(candidate, markdown, `${language} ${label} mutation fixture did not apply`);
      assert.throws(
        () => validateDesignApprovalReport(candidate, html, language, summary),
        /missing visible|whole-claim inline code/,
        `${language} ${label} mutation must be rejected`
      );
    }
    const htmlHidden = html.replace(claims.network, `<script>${claims.network}</script>`);
    assert.notEqual(htmlHidden, html, `${language} hidden HTML mutation fixture did not apply`);
    assert.throws(
      () => validateDesignApprovalReport(markdown, htmlHidden, language, summary),
      /HTML missing visible claim/
    );
    for (const [label, wrapper] of [
      ["HTML comment", (claim) => `<!-- ${claim} -->`],
      ["HTML style", (claim) => `<style>${claim}</style>`]
    ]) {
      const candidate = html.replace(claims.network, wrapper(claims.network));
      assert.notEqual(candidate, html, `${language} ${label} mutation fixture did not apply`);
      assert.throws(
        () => validateDesignApprovalReport(markdown, candidate, language, summary),
        /HTML missing visible claim/
      );
    }
    for (const [label, wrapper] of [
      ["gate HTML comment", (claim) => `<!-- ${claim} -->`],
      ["gate HTML style", (claim) => `<style>${claim}</style>`]
    ]) {
      const candidate = html.replace(a2GateVisibleClaims[0], wrapper(a2GateVisibleClaims[0]));
      assert.notEqual(candidate, html, `${language} ${label} mutation fixture did not apply`);
      assert.throws(
        () => validateDesignApprovalReport(markdown, candidate, language, summary),
        /HTML missing visible claim/
      );
    }
  }
});

test("A1 browser evidence producer help is inert and temp output cannot overwrite canonical evidence", async () => {
  const producer = resolve(root, designApprovalBrowserProducer);
  const canonicalPaths = [
    designApprovalBrowserObservation,
    designApprovalScreenshots.desktop1440,
    designApprovalScreenshots.mobile390,
    designApprovalVerificationSummary,
    designApprovalFullSuiteJunit
  ].map((path) => resolve(root, path));
  const identities = async () => Promise.all(canonicalPaths.map(async (path) => {
    const [bytes, metadata] = await Promise.all([readFile(path), stat(path, { bigint: true })]);
    return { path, sha256: sha256Upper(bytes), mtimeNs: metadata.mtimeNs.toString() };
  }));

  const beforeHelp = await identities();
  const help = spawnSync("python", [producer, "--help"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /--output-dir/);
  assert.match(help.stdout, /--publish-canonical/);
  assert.deepEqual(await identities(), beforeHelp, "--help changed canonical evidence bytes or mtimes");

  const implicitCanonical = spawnSync("python", [
    producer,
    "--output-dir",
    resolve(root, "artifacts/line-design-approval-a1")
  ], { encoding: "utf8", timeout: 30_000 });
  assert.notEqual(implicitCanonical.status, 0, "canonical output must require --publish-canonical");
  assert.match(implicitCanonical.stderr, /canonical evidence requires --publish-canonical/);
  assert.deepEqual(await identities(), beforeHelp, "rejected implicit canonical output changed evidence");

  const artifactParent = resolve(root, "artifacts");
  const transactionResidue = async () => (await readdir(artifactParent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^line-design-approval-a1\.(?:staging|backup)-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const residueBeforeFailure = await transactionResidue();
  const forcedFailure = spawnSync("python", [producer, "--publish-canonical"], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, MONOLITH_LINEOS_A1_TEST_FAIL_AFTER_DESKTOP: "1" }
  });
  assert.notEqual(forcedFailure.status, 0, "forced staged-desktop failure unexpectedly succeeded");
  assert.match(`${forcedFailure.stdout}\n${forcedFailure.stderr}`, /forced failure after staged desktop capture/i);
  assert.deepEqual(await identities(), beforeHelp, "failed canonical capture changed evidence bytes or mtimes");
  assert.deepEqual(await transactionResidue(), residueBeforeFailure, "failed canonical capture left staging or backup residue");
  const portProbe = spawnSync("python", ["-c", [
    "import socket",
    "from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer",
    "try:",
    "    with socket.create_connection(('127.0.0.1', 4179), timeout=0.25):",
    "        raise RuntimeError('evidence server is still accepting connections')",
    "except OSError:",
    "    pass",
    "probe = None",
    "try:",
    "    probe = ThreadingHTTPServer(('127.0.0.1', 4179), SimpleHTTPRequestHandler)",
    "finally:",
    "    if probe is not None:",
    "        probe.server_close()"
  ].join("\n")], { encoding: "utf8", timeout: 10_000 });
  assert.equal(
    portProbe.status,
    0,
    `failed canonical capture left port 4179 unavailable to the next evidence server: ${portProbe.stderr}`
  );

  const scratch = await mkdtemp(join(tmpdir(), "lineos-a1-browser-evidence-"));
  try {
    const tempRun = spawnSync("python", [producer, "--output-dir", scratch], {
      encoding: "utf8",
      timeout: 60_000
    });
    assert.equal(tempRun.status, 0, tempRun.stderr || tempRun.stdout);
    const tempObservationPath = resolve(scratch, "browser-observed.json");
    const tempDesktopPath = resolve(scratch, "desktop-1440.png");
    const tempMobilePath = resolve(scratch, "mobile-390.png");
    await Promise.all([access(tempObservationPath), access(tempDesktopPath), access(tempMobilePath)]);
    const tempObservation = JSON.parse(await readFile(tempObservationPath, "utf8"));
    assert.equal(tempObservation.output?.mode, "isolated");
    assert.equal(tempObservation.output?.directory, resolve(scratch));
    assert.deepEqual(
      Object.values(tempObservation.screenshots).map(({ path }) => path).sort(),
      ["desktop-1440.png", "mobile-390.png"]
    );
    assert.deepEqual(await identities(), beforeHelp, "isolated output run changed canonical evidence");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("implementation reports expose the complete decision record", async () => {
  const requiredHeadings = {
    en: [
      "Scope", "Commits", "Automated tests", "Browser checks", "Network evidence",
      "Acceptance-gate matrix", "Residual risk", "NO-GO statement", "Next decision"
    ],
    th: [
      "ขอบเขต", "คอมมิต", "การทดสอบอัตโนมัติ", "การตรวจด้วยเบราว์เซอร์", "หลักฐานเครือข่าย",
      "เมทริกซ์เกณฑ์การยอมรับ", "ความเสี่ยงคงเหลือ", "คำตัดสิน NO-GO", "การตัดสินใจถัดไป"
    ]
  };

  for (const language of editions) {
    const [markdown, html] = await Promise.all([
      read(`${implementationReport}.${language}.md`),
      read(`${implementationReport}.${language}.html`),
    ]);
    const headings = (markdown.match(/^## .+$/gm) ?? [])
      .map((line) => line.replace(/^## (?:\d+\. )?/, ""));
    for (const heading of requiredHeadings[language]) {
      assert.ok(headings.includes(heading), `${language} implementation report missing heading: ${heading}`);
    }
    assert.doesNotMatch(
      html,
      /&lt;br\s*\/?&gt;/i,
      `${language} implementation report HTML exposes escaped raw break markup`,
    );
  }
});

test("verification evidence is complete and rejects unsafe substitutions", async () => {
  const summary = JSON.parse(await read(verificationSummary));
  await assert.doesNotReject(() => validateVerificationSummary(summary));

  const invalidCases = [
    ["invalid repository commit", (value) => { value.repository.commit = "short"; }],
    ["empty browser string", (value) => { value.runtime.browser = ""; }],
    ["non-positive automated test count", (value) => { value.automated.tests = 0; }],
    ["acceptance gate count must be ten", (value) => { value.acceptanceGates.pop(); }],
    ["status must be PASS", (value) => { value.acceptanceGates[0].status = "FAIL"; }],
    ["invalid evidence", (value) => { value.acceptanceGates[0].evidence = "notes/no-real-evidence.txt"; }],
    ["invalid generatedAt instant", (value) => { value.generatedAt = "2026-99-99T99:99:99Z"; }],
    ["invalid generatedAt calendar date", (value) => { value.generatedAt = "2026-02-30T00:00:00Z"; }],
    ["test anchor does not resolve", (value) => {
      value.acceptanceGates[1].evidence = "tests/line-flex-studio-state.test.mjs#invented-test-anchor";
    }],
    ["networkRecord is required", (value) => { delete value.browser.networkRecord; }],
    ["networkRecord is required", (value) => { value.browser.networkRecord = {}; }],
    ["networkRecord hosts must be localhost only", (value) => {
      value.browser.networkRecord.allowedHosts = ["localhost", "example.com"];
    }],
    ["networkRecord external requests must be zero", (value) => {
      value.browser.networkRecord.externalRequestCount = 1;
    }],
    ["networkRecord LINE/Supabase/analytics requests must be zero", (value) => {
      value.browser.networkRecord.lineSupabaseAnalyticsRequestCount = 1;
    }],
    ["networkRecord unexpected console errors must be zero", (value) => {
      value.browser.networkRecord.unexpectedConsoleErrorCount = 1;
    }],
    ["networkRecord page errors must be zero", (value) => {
      value.browser.networkRecord.pageErrorCount = 1;
    }],
    ["networkRecord journeys must be the exact 5x2 matrix", (value) => {
      value.browser.networkRecord.journeys.pop();
    }],
    ["networkRecord responsive results must be the exact six PASS layouts", (value) => {
      value.browser.networkRecord.responsiveLayouts["1024"] = "three-column FAIL";
    }],
    ["networkRecord overflow must be zero at all six widths", (value) => {
      value.browser.networkRecord.horizontalOverflowPixels["320"] = 1;
    }],
    ["networkRecord keyboard completion must pass", (value) => {
      value.browser.networkRecord.keyboardOnlyCompletion = false;
    }],
    ["screenshot SHA-256 mismatch", (value) => {
      value.browser.screenshots.desktop1440.sha256 = "0".repeat(64);
    }]
  ];
  for (const [message, mutate] of invalidCases) {
    const candidate = structuredClone(summary);
    mutate(candidate);
    await assert.rejects(() => validateVerificationSummary(candidate), new RegExp(message));
  }
});

test("prose normalization ignores code fixtures but preserves policy violations", () => {
  const fixtures = [
    "Safe prose.",
    "```js",
    "const marker = 'TODO';",
    "const unsafe = 'tests exist, therefore production';",
    "```",
    "The inline examples `FIXME` and `production-ready because` are intentional fixtures."
  ].join("\n");
  assert.doesNotMatch(proseOnly(fixtures), templateMarker);
  assert.doesNotMatch(proseOnly(fixtures), unsafeReadinessClaim);
  assert.match(proseOnly(`${fixtures}\nTODO: assign a release owner.`), templateMarker);
  assert.match(proseOnly(`${fixtures}\nTests exist, therefore production is approved.`), unsafeReadinessClaim);
});

test("project Markdown has no prose markers or replacement characters", async () => {
  for (const stem of documentStems) {
    for (const language of editions) {
      const markdown = await read(`${stem}.${language}.md`);
      assert.doesNotMatch(markdown, /\uFFFD/);
      assert.doesNotMatch(proseOnly(markdown), templateMarker);
    }
  }
});

test("every project Markdown edition is free of trailing spaces and tabs", async () => {
  for (const stem of documentStems) {
    for (const language of editions) {
      const path = `${stem}.${language}.md`;
      const markdown = await read(path);
      assert.doesNotMatch(markdown, /[\t ]+$/m, `${path} contains trailing whitespace`);
    }
  }
});

test("both research editions require the exact source-presence readiness boundary", async () => {
  for (const language of editions) {
    requireReadinessBoundary(await read(`${research}.${language}.md`), language);
  }

  const thaiFixture = `ก่อน\n${readinessBoundaries.th}\nหลัง`;
  assert.doesNotThrow(() => requireReadinessBoundary(thaiFixture, "th"));
  assert.throws(
    () => requireReadinessBoundary(thaiFixture.replace(readinessBoundaries.th, ""), "th"),
    /th: missing exact source-presence readiness boundary/
  );
});

test("no document prose promotes source or test presence to production readiness", async () => {
  for (const stem of documentStems) {
    for (const language of editions) {
      assert.doesNotMatch(proseOnly(await read(`${stem}.${language}.md`)), unsafeReadinessClaim);
    }
  }
});

test("installation guides preserve the console, LIFF, and secret-safety contract", async () => {
  const required = [
    "Flex Message Simulator", "Messaging API", "Use webhook", "Webhook redelivery",
    "LIFF", "state", "nonce", "no production token",
    "Flex JSON is not installed in Developer Console"
  ];
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-developer-console-installation.${language}.md`);
    for (const phrase of required) {
      assert.ok(markdown.includes(phrase), `${language} installation guide missing: ${phrase}`);
    }
  }
});

test("LIFF guides separate transaction, liff.state, OAuth state, and OIDC nonce semantics", async () => {
  const stems = [
    "docs/guides/line-developer-console-installation",
    "docs/guides/line-flex-action-vs-liff-decision-guide",
    "docs/guides/line-flex-studio-user-guide"
  ];
  for (const stem of stems) {
    for (const language of editions) {
      const markdown = await read(`${stem}.${language}.md`);
      const transaction = tableRow(markdown, "MONOLITH transaction reference").join(" ");
      assert.match(transaction, /server-created/i);
      assert.match(transaction, /server-stored/i);
      assert.match(transaction, /high-entropy/i);
      assert.match(transaction, /CSRF\/session binding/i);
      for (const binding of ["tenant", "principal/audience", "resource", "revision", "action", "expiry", "exact return target", "one-time consumed"]) {
        assert.match(transaction, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      }

      const liffState = tableRow(markdown, "LINE-managed liff.state").join(" ");
      assert.match(liffState, /untrusted routing input/i);
      assert.match(liffState, /not OAuth state/i);
      assert.match(liffState, /not permission/i);
      assert.match(liffState, /not the MONOLITH transaction reference/i);

      const oauthState = tableRow(markdown, "OAuth state").join(" ");
      assert.match(oauthState, /separate supported authorization flow/i);
      assert.match(oauthState, /CSRF/i);
      assert.match(oauthState, /not liff\.state/i);

      const oidcNonce = tableRow(markdown, "OIDC nonce").join(" ");
      assert.match(oidcNonce, /only when/i);
      assert.match(oidcNonce, /lets MONOLITH supply/i);
      assert.match(oidcNonce, /ID-token/i);

      assert.match(markdown, /`liff\.init\(\)`/);
      assert.match(markdown, /`liff\.login\(\)`/);
      assert.match(markdown, /raw `liff\.getIDToken\(\)` ID token or access token/);
      assert.match(markdown, /verify using LINE's documented server flow/);
      assert.match(markdown, /Direct LINE Login authorization requests inside the LIFF browser are not guaranteed/);
    }
  }
});

test("closed-delivery environments disable Official Account default messages", async () => {
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-developer-console-installation.${language}.md`);
    const confirmIndex = markdown.indexOf("### 4.");
    const defaultsIndex = markdown.indexOf("### 4A.");
    const secretIndex = markdown.indexOf("### 5.");
    assert.ok(confirmIndex >= 0 && confirmIndex < defaultsIndex && defaultsIndex < secretIndex,
      `${language}: Official Account defaults step must immediately follow channel confirmation`);

    for (const setting of ["Greeting messages", "Auto-reply messages"]) {
      const row = tableRow(markdown, setting);
      assert.equal(row[1], "Disabled");
      assert.match(row[2], /dated, redacted Official Account Manager evidence/i);
      assert.ok((markdown.match(new RegExp(setting, "g")) ?? []).length >= 3,
        `${language}: ${setting} must appear in setup, sign-off, and rollback`);
    }
    assert.match(markdown, /Every environment claiming delivery closed must keep both settings Disabled/);
    assert.match(markdown, /ownership, content, audience, approval, and rollback/);
    assert.match(markdown, /remove the absolute closed-delivery claim/);
  }
});

test("Studio user guides cover the complete safe operator journey", async () => {
  const required = [
    "local static server", "Header", "Hero", "Body", "Footer",
    "design-approval", "quote-order", "sla-escalation", "site-update", "issue-evidence",
    "320", "360", "390", "Mock LIFF", "Verification Receipt — Demo",
    "error", "warning", "guidance", "official_constraint", "monolith_best_practice",
    "clipboard", "no message was sent", "no business state changed"
  ];
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-flex-studio-user-guide.${language}.md`);
    for (const phrase of required) {
      assert.ok(markdown.includes(phrase), `${language} Studio guide missing: ${phrase}`);
    }
  }
});

test("A1 operating guides preserve exact claims in their intended sections and ordered A2 gates", async () => {
  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    validateDesignApprovalGuide(markdown, language);
  }
});

test("A1 guide contract rejects removed negation and affirmative authority mutations in both languages", async () => {
  const affirmativeCopy = {
    en: {
      runtime: "The defensible result is runtime-integrated.",
      production: "A1 is production-ready.",
      workflow: "The MONOLITH workflow has been approved. Workflow approval has been granted.",
      version: "Start a new sandbox review to load the adapter-owned current snapshot; the MONOLITH workflow is queried and workflow approval has been granted."
    },
    th: {
      runtime: "ผลที่รองรับได้เชื่อมต่อ MONOLITH runtime แล้ว",
      production: "A1 พร้อมใช้งานจริงระดับ production แล้ว",
      workflow: "MONOLITH workflow ได้รับอนุมัติแล้ว และ workflow approval ได้รับอนุมัติแล้ว",
      version: "เริ่ม sandbox review ใหม่เพื่อโหลด adapter-owned current snapshot; มีการ query MONOLITH workflow และ workflow approval ได้รับอนุมัติแล้ว"
    }
  };

  for (const language of editions) {
    const markdown = setExpectedVersionConflictGuidance(
      await read(`${designApprovalGuide}.${language}.md`),
      language
    );
    const completionClaim = designApprovalGuideSectionClaims[language][8][0];
    const noEffectClaim = designApprovalGuideSectionClaims[language][6][1];
    const fixtures = [
      ["runtime integration reversal", markdown.replace(completionClaim, affirmativeCopy[language].runtime), /prohibited affirmative runtime integration claim/],
      ["production-ready injection", markdown.replace(completionClaim, `${completionClaim}\n\n${affirmativeCopy[language].production}`), /prohibited affirmative production readiness claim/],
      ["workflow-approved injection", markdown.replace(completionClaim, `${completionClaim}\n\n${affirmativeCopy[language].workflow}`), /prohibited affirmative workflow effect claim/],
      ["version-conflict negation reversal", markdown.replace(/^\| `version_conflict` \|.*$/m, `| \`version_conflict\` | ${affirmativeCopy[language].version} |`), /prohibited affirmative workflow effect claim/],
      ["no-effect negation removal", markdown.replace(noEffectClaim, ""), /section 6 missing exact claim/]
    ];

    for (const [label, candidate, expected] of fixtures) {
      assert.notEqual(candidate, markdown, `${language}: mutation fixture did not change guide: ${label}`);
      assert.throws(
        () => validateDesignApprovalGuide(candidate, language),
        expected,
        `${language}: contract accepted mutation fixture: ${label}`
      );
    }
  }
});

test("A1 guide contract rejects visible affirmative runtime, production, and workflow equivalents", async (t) => {
  const equivalents = {
    en: [
      ["runtime connection", "A1 connects to the MONOLITH runtime.", /prohibited affirmative runtime integration claim/],
      ["production readiness", "A1 is ready for production.", /prohibited affirmative production readiness claim/],
      ["workflow mutation", "A1 changes the MONOLITH workflow.", /prohibited affirmative workflow effect claim/]
    ],
    th: [
      ["runtime connection", "A1 เชื่อมต่อกับ MONOLITH runtime แล้ว", /prohibited affirmative runtime integration claim/],
      ["production readiness", "A1 พร้อมใช้งานจริงแล้ว", /prohibited affirmative production readiness claim/],
      ["workflow mutation", "A1 เปลี่ยน MONOLITH workflow แล้ว", /prohibited affirmative workflow effect claim/]
    ]
  };

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    const completionClaim = designApprovalGuideSectionClaims[language][8][0];
    for (const [label, affirmativeClaim, expected] of equivalents[language]) {
      await t.test(`${language}: ${label}`, () => {
        const candidate = markdown.replace(completionClaim, `${completionClaim}\n\n${affirmativeClaim}`);
        assert.notEqual(candidate, markdown, `${language}: affirmative-equivalent fixture did not change guide`);
        assert.throws(
          () => validateDesignApprovalGuide(candidate, language),
          expected,
          `${language}: contract accepted affirmative equivalent: ${affirmativeClaim}`
        );
      });
    }
  }
});

test("A1 guide contract scans inline-formatted authority claims and active approval voice", async (t) => {
  const visibleClaims = {
    en: [
      ["formatted runtime subject", "`A1` connects to the MONOLITH runtime.", /prohibited affirmative runtime integration claim/],
      ["formatted production predicate", "A1 is `ready for production`.", /prohibited affirmative production readiness claim/],
      ["formatted workflow object", "A1 changes `MONOLITH workflow`.", /prohibited affirmative workflow effect claim/],
      ["active approval voice", "A1 records design approval.", /prohibited affirmative approval effect claim/]
    ],
    th: [
      ["formatted runtime subject", "`A1` เชื่อมต่อกับ MONOLITH runtime แล้ว", /prohibited affirmative runtime integration claim/],
      ["formatted production predicate", "A1 `พร้อมใช้งานจริงแล้ว`", /prohibited affirmative production readiness claim/],
      ["formatted workflow object", "A1 เปลี่ยน `MONOLITH workflow` แล้ว", /prohibited affirmative workflow effect claim/],
      ["active approval voice", "A1 บันทึก design approval แล้ว", /prohibited affirmative approval effect claim/]
    ]
  };

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    const completionClaim = designApprovalGuideSectionClaims[language][8][0];
    for (const [label, affirmativeClaim, expected] of visibleClaims[language]) {
      await t.test(`${language}: ${label}`, () => {
        const candidate = markdown.replace(completionClaim, `${completionClaim}\n\n${affirmativeClaim}`);
        assert.notEqual(candidate, markdown, `${language}: visible-claim fixture did not change guide`);
        assert.throws(
          () => validateDesignApprovalGuide(candidate, language),
          expected,
          `${language}: contract accepted visible authority claim: ${affirmativeClaim}`
        );
      });
    }
  }
});

test("A1 guide contract rejects natural perfect-tense and integration authority claims", async (t) => {
  const naturalClaims = {
    en: [
      ["runtime integration", "A1 integrates with the MONOLITH runtime.", /prohibited affirmative runtime integration claim/],
      ["workflow update", "A1 has updated the MONOLITH workflow.", /prohibited affirmative workflow effect claim/],
      ["approval record", "A1 has recorded design approval.", /prohibited affirmative approval effect claim/]
    ],
    th: [
      ["runtime integration", "A1 เชื่อมกับ MONOLITH runtime แล้ว", /prohibited affirmative runtime integration claim/],
      ["workflow update", "A1 ได้อัปเดต MONOLITH workflow แล้ว", /prohibited affirmative workflow effect claim/],
      ["approval record", "A1 ได้บันทึก design approval แล้ว", /prohibited affirmative approval effect claim/]
    ]
  };

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    const completionClaim = designApprovalGuideSectionClaims[language][8][0];
    for (const [label, affirmativeClaim, expected] of naturalClaims[language]) {
      await t.test(`${language}: ${label}`, () => {
        const candidate = markdown.replace(completionClaim, `${completionClaim}\n\n${affirmativeClaim}`);
        assert.notEqual(candidate, markdown, `${language}: natural-claim fixture did not change guide`);
        assert.throws(
          () => validateDesignApprovalGuide(candidate, language),
          expected,
          `${language}: contract accepted natural authority claim: ${affirmativeClaim}`
        );
      });
    }
  }
});

test("A1 guide contract does not classify explicit bilingual negations as affirmative authority", () => {
  const safeNegations = {
    en: [
      "`A1` does not connect to the MONOLITH runtime.",
      "A1 is not `ready for production`.",
      "A1 does not change `MONOLITH workflow`.",
      "A1 does not record design approval.",
      "A1 does not integrate with the MONOLITH runtime.",
      "A1 has not updated the MONOLITH workflow.",
      "A1 has not recorded design approval.",
      versionConflictGuidance.en
    ],
    th: [
      "`A1` ไม่เชื่อมต่อกับ MONOLITH runtime",
      "A1 `ยังไม่พร้อมใช้งานจริง`",
      "A1 ไม่เปลี่ยน `MONOLITH workflow`",
      "A1 ไม่บันทึก design approval",
      "A1 ไม่เชื่อมกับ MONOLITH runtime",
      "A1 ไม่ได้อัปเดต MONOLITH workflow",
      "A1 ไม่ได้บันทึก design approval",
      versionConflictGuidance.th
    ]
  };

  for (const language of editions) {
    assert.doesNotThrow(
      () => assertNoProhibitedDesignApprovalClaims(safeNegations[language].join("\n"), language),
      `${language}: approved negation was classified as affirmative authority`
    );
  }
});

test("A1 required claims must remain visible rather than living in comments or code fixtures", async (t) => {
  const hidingForms = [
    ["HTML comment", (markdown, claim) => markdown.replace(claim, `<!-- ${claim} -->`)],
    ["fenced fixture", (markdown, claim) => {
      const sourceLine = markdown.split("\n").find((line) => line.includes(claim));
      assert.ok(sourceLine, "fenced fixture requires a source line");
      return markdown.replace(sourceLine, `\`\`\`text\n${claim}\n\`\`\``);
    }],
    ["fence closed by a longer delimiter", (markdown, claim) => {
      const sourceLine = markdown.split("\n").find((line) => line.includes(claim));
      assert.ok(sourceLine, "longer-closer fixture requires a source line");
      return markdown.replace(sourceLine, `\`\`\`text\n${claim}\n\`\`\`\``);
    }]
  ];

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    const claims = [
      ["runtime-disconnected", designApprovalGuideSectionClaims[language].preamble[0], /section preamble missing exact claim/],
      ["no-effect", designApprovalGuideSectionClaims[language][6][1], /section 6 missing exact claim/]
    ];
    for (const [claimName, claim, expected] of claims) {
      for (const [formName, hide] of hidingForms) {
        await t.test(`${language}: ${claimName} in ${formName}`, () => {
          const candidate = hide(markdown, claim);
          assert.notEqual(candidate, markdown, `${language}: hidden-claim fixture did not change guide`);
          assert.throws(
            () => validateDesignApprovalGuide(candidate, language),
            expected,
            `${language}: contract accepted ${claimName} only in ${formName}`
          );
        });
      }
    }
  }
});

test("A1 runtime-disconnected preamble cannot be satisfied by whole-claim inline code", async (t) => {
  for (const language of editions) {
    await t.test(language, async () => {
      const markdown = await read(`${designApprovalGuide}.${language}.md`);
      const claim = designApprovalGuideSectionClaims[language].preamble[0];
      const candidate = markdown.replace(claim, `\`${claim}\``);
      assert.notEqual(candidate, markdown, `${language}: whole-claim inline fixture did not change guide`);
      assert.throws(
        () => validateDesignApprovalGuide(candidate, language),
        /section preamble missing exact claim/,
        `${language}: contract accepted the mandatory preamble only as inline code`
      );
    });
  }
});

test("A1 unclosed HTML comments hide mandatory prose through end of file", async (t) => {
  for (const language of editions) {
    await t.test(language, async () => {
      const markdown = await read(`${designApprovalGuide}.${language}.md`);
      const claim = designApprovalGuideSectionClaims[language].preamble[0];
      const candidate = markdown.replace(claim, `<!-- ${claim}`);
      assert.notEqual(candidate, markdown, `${language}: unclosed-comment fixture did not change guide`);
      assert.throws(
        () => validateDesignApprovalGuide(candidate, language),
        /A1 guide must have exactly numbered sections 1–9/,
        `${language}: contract accepted mandatory prose after an unclosed HTML-comment opener`
      );
    });
  }
});

test("A1 guide contract rejects A2 gates moved out of section 9 or placed out of order", async () => {
  for (const language of editions) {
    const markdown = setExpectedVersionConflictGuidance(
      await read(`${designApprovalGuide}.${language}.md`),
      language
    );
    const a2Body = guideSection(markdown, 9);
    const gates = [...a2Body.matchAll(/^(\d+)\. (.+)$/gm)]
      .map((match) => ({ number: Number(match[1]), text: match[2] }));
    assert.equal(gates.length, 7, `${language}: fixture requires seven source gates`);

    const first = `1. ${gates[0].text}`;
    const second = `2. ${gates[1].text}`;
    const swapped = markdown.replace(`${first}\n${second}`, `1. ${gates[1].text}\n2. ${gates[0].text}`);
    assert.notEqual(swapped, markdown, `${language}: A2 order fixture did not change guide`);
    assert.throws(
      () => validateDesignApprovalGuide(swapped, language),
      /A2 gate 1 missing/,
      `${language}: contract accepted out-of-order A2 gates`
    );

    const seventh = `7. ${gates[6].text}`;
    const moved = markdown
      .replace(`${seventh}\n`, "")
      .replace(/^## 9\. /m, `${seventh}\n\n## 9. `);
    assert.notEqual(moved, markdown, `${language}: A2 section fixture did not change guide`);
    assert.throws(
      () => validateDesignApprovalGuide(moved, language),
      /section 9 must contain exactly ordered A2 gates 1–7/,
      `${language}: contract accepted an A2 gate outside section 9`
    );

    const sourceHeading = language === "en" ? "## Official sources" : "## แหล่งข้อมูลทางการ";
    const movedBelowSources = markdown
      .replace(`${seventh}\n`, "")
      .replace(`${sourceHeading}\n`, `${sourceHeading}\n\n${seventh}\n`);
    assert.notEqual(movedBelowSources, markdown, `${language}: below-sources fixture did not change guide`);
    assert.throws(
      () => validateDesignApprovalGuide(movedBelowSources, language),
      /section 9 must contain exactly ordered A2 gates 1–7/,
      `${language}: contract accepted A2 gate 7 below the sources H2 boundary`
    );
  }
});

test("A1 section 9 stops at CommonMark H2 headings indented up to three spaces", async (t) => {
  for (const language of editions) {
    await t.test(language, async () => {
      const markdown = await read(`${designApprovalGuide}.${language}.md`);
      const a2Body = guideSection(markdown, 9);
      const gates = [...a2Body.matchAll(/^(\d+)\. (.+)$/gm)]
        .map((match) => ({ number: Number(match[1]), text: match[2] }));
      assert.equal(gates.length, 7, `${language}: indented-H2 fixture requires seven source gates`);
      const seventh = `7. ${gates[6].text}`;
      const sourceHeading = language === "en" ? "## Official sources" : "## แหล่งข้อมูลทางการ";
      const candidate = markdown
        .replace(`${seventh}\n`, "")
        .replace(`${sourceHeading}\n`, `  ${sourceHeading}\n\n${seventh}\n`);
      assert.notEqual(candidate, markdown, `${language}: indented-H2 fixture did not change guide`);
      assert.throws(
        () => validateDesignApprovalGuide(candidate, language),
        /section 9 must contain exactly ordered A2 gates 1–7/,
        `${language}: contract accepted gate 7 below a two-space-indented H2`
      );
    });
  }
});

test("A1 numbered section headings must be visible rather than hidden in comments or fences", async (t) => {
  const hidingForms = [
    ["multiline HTML comment", (heading) => `<!--\n${heading}\n-->`],
    ["fenced block", (heading) => `\`\`\`text\n${heading}\n\`\`\``]
  ];

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    for (const sectionNumber of [2, 9]) {
      const heading = markdown.split("\n").find((line) => line.startsWith(`## ${sectionNumber}. `));
      assert.ok(heading, `${language}: hidden-heading fixture requires section ${sectionNumber}`);
      for (const [formName, hide] of hidingForms) {
        await t.test(`${language}: section ${sectionNumber} in ${formName}`, () => {
          const candidate = markdown.replace(heading, hide(heading));
          assert.notEqual(candidate, markdown, `${language}: hidden-heading fixture did not change guide`);
          assert.throws(
            () => validateDesignApprovalGuide(candidate, language),
            /A1 guide must have exactly numbered sections 1–9/,
            `${language}: hidden section ${sectionNumber} heading was accepted from ${formName}`
          );
        });
      }
    }
  }
});

test("A1 guide contract parses A2 gates only from visible section-9 prose", async (t) => {
  const hidingForms = [
    ["HTML comment", (gateBlock) => `<!--\n${gateBlock}\n-->`],
    ["fenced block", (gateBlock) => `\`\`\`text\n${gateBlock}\n\`\`\``]
  ];

  for (const language of editions) {
    const markdown = await read(`${designApprovalGuide}.${language}.md`);
    const a2Body = guideSection(markdown, 9);
    const gateLines = [...a2Body.matchAll(/^(\d+)\. (.+)$/gm)].map((match) => match[0]);
    assert.equal(gateLines.length, 7, `${language}: visible-gate fixture requires seven source gates`);
    const gateBlock = gateLines.join("\n");
    for (const [formName, hide] of hidingForms) {
      await t.test(`${language}: all gates in ${formName}`, () => {
        const candidate = markdown.replace(gateBlock, hide(gateBlock));
        assert.notEqual(candidate, markdown, `${language}: hidden-gate fixture did not change guide`);
        assert.throws(
          () => validateDesignApprovalGuide(candidate, language),
          /section 9 must contain exactly ordered A2 gates 1–7/,
          `${language}: contract accepted all seven A2 gates from ${formName}`
        );
      });
    }
  }
});

test("standalone rehearsal ends with Verification Receipt Demo and reserves Signed Receipt", async () => {
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-flex-studio-user-guide.${language}.md`);
    const start = markdown.search(/^## 9\. /m);
    const end = markdown.search(/^## 10\. /m);
    assert.ok(start >= 0 && end > start, `${language}: missing standalone rehearsal section`);
    const rehearsal = markdown.slice(start, end);
    const step = rehearsal.split("\n").find((line) => line.startsWith("2. ")) ?? "";
    assert.doesNotMatch(rehearsal, /Signed Receipt/);
    assert.match(step, /Verification Receipt — Demo\*{0,2}$/);
  }
});

test("action guides preserve the approved decision matrix and threat boundaries", async () => {
  const rows = [
    "| Visible conversational text | Message |",
    "| Low-risk reversible choice, reauthorized server-side | Postback with opaque intent ID |",
    "| Read-only web/tel/LINE scheme | URI |",
    "| Form, identity, sensitive detail, comparison or explicit confirmation | URI opening LIFF |",
    "| Money, access, release, policy, scope or hard-to-reverse change | LIFF plus MONOLITH step-up |"
  ];
  const required = [
    ...rows, "design-approval", "quote-order", "sla-escalation", "site-update", "issue-evidence",
    "duplicate", "replay", "transport", "authorization", "tenant", "amount", "role",
    "free-text order truth", "one-tap approval", "bearer tokens in URLs",
    "group membership as permission"
  ];
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-flex-action-vs-liff-decision-guide.${language}.md`);
    for (const phrase of required) {
      assert.ok(markdown.includes(phrase), `${language} action guide missing: ${phrase}`);
    }
  }
});

test("performance guides preserve LINE ceilings and MONOLITH rendering gates", async () => {
  const required = [
    "30 KB", "50 KB", "12", "one bubble only", "1,500", "1024×1024", "10 MB", "24 KB",
    "no base64", "remote fonts", "third-party runtime", "320", "360", "390", "iOS", "Android",
    "desktop", "Future production guidance", "4xx", "429", "5xx", "duplicate delivery",
    "unknown-after-send"
  ];
  for (const language of editions) {
    const markdown = await read(`docs/guides/line-flex-performance-rendering-checklist.${language}.md`);
    for (const phrase of required) {
      assert.ok(markdown.includes(phrase), `${language} performance guide missing: ${phrase}`);
    }
  }
});

test("all guides cite current official LINE primary sources", async () => {
  for (const stem of guideStems) {
    for (const language of editions) {
      const markdown = await read(`${stem}.${language}.md`);
      assert.match(markdown, /https:\/\/developers\.line\.biz\/en\//);
      assert.match(markdown, /Retrieved 2026-08-02/);
    }
  }
});

test("both reports have exactly 20 numbered sections and the exact board decision", async () => {
  for (const language of editions) {
    const markdown = await read(research + `.${language}.md`);
    assert.deepEqual(h2s(markdown).map(({ number }) => number), Array.from({ length: 20 }, (_, index) => index + 1));
    assert.match(markdown, /NO-GO for broader customer messaging/);
    assert.match(markdown, /Daph is one pilot tenant/);
    assert.equal((markdown.match(new RegExp(exactConclusion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
  }
});

test("research labels evidence, cites primary sources, and records working-tree provenance honestly", async () => {
  const requiredEvidence = [
    "Official constraint", "Verified local fact", "Inference", "Proposal", "Unknown",
    "https://developers.line.biz/en/docs/messaging-api/",
    "https://www.rfc-editor.org/rfc/rfc9700.html",
    "https://csrc.nist.gov/pubs/sp/800/207/final",
    "https://www.w3.org/TR/WCAG22/"
  ];
  const provenance = [
    ["CONTEXT.md", "715E4865B1A4498AC08C6E9AC7A0C7881A54645A645C088B130FE0572A92DE99"],
    ["docs/reports/2026-07-21-ima-schelling-monolith-repository-scope-correction.en.md", "6966AB9BB1C3B97E3856A66A35190E2D404627E5B88BFFE720462E96C296FD42"]
  ];

  for (const language of editions) {
    const markdown = await read(research + `.${language}.md`);
    for (const text of requiredEvidence) assert.match(markdown, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const topology = section(markdown, 3);
    assert.match(topology, /untracked working-tree evidence/);
    assert.match(topology, /inspected 2026-08-02/);
    assert.match(topology, /not commit or deployment evidence/);
    assert.doesNotMatch(topology, /CONTEXT\.md[^\n]*inspected at parent commit/);
    for (const [path, hash] of provenance) {
      assert.match(topology, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(topology, new RegExp(hash));
    }

    assert.ok(!markdown.includes("manufacturer primary source. |"), `${language}: Official constraint definition is too broad`);
    for (const capability of ["IKEA", "Blum", "Häfele", "HOMAG", "Biesse"]) {
      const paragraph = markdown.split("\n").find((line) => line.includes(capability) && line.includes("Primary-source capability fact"));
      assert.ok(paragraph, `${language}: missing primary-source capability classification for ${capability}`);
      assert.doesNotMatch(paragraph, /\*\*\[Official constraint\]\*\*/);
    }
  }
});

test("threat model separates duplicate-send and unknown-after-send controls", async () => {
  const threats = [
    "cross-tenant", "Forged webhook", "Replay", "Forwarded link", "Stale approval",
    "Unknown group actor", "Wrong audience", "duplicate-send", "unknown-after-send",
    "Audit tampering", "Notification abuse"
  ];
  for (const language of editions) {
    const body = section(await read(research + `.${language}.md`), 9);
    for (const threat of threats) assert.match(body, new RegExp(threat, "i"));
    const duplicate = tableRow(body, "duplicate-send");
    assert.match(duplicate.join(" "), /stable retry key/i);
    assert.match(duplicate.join(" "), /sender idempotency/i);
    assert.match(duplicate.join(" "), /zero duplicate business execution/i);
    const unknown = tableRow(body, "unknown-after-send");
    assert.match(unknown.join(" "), /request\/retry identifiers/i);
    assert.match(unknown.join(" "), /acceptance state/i);
    assert.match(unknown.join(" "), /reconcile outcome/i);
    assert.match(unknown.join(" "), /operator resolution/i);
    assert.match(unknown.join(" "), /never blind resend/i);
    assert.match(unknown.join(" "), /https:\/\/developers\.line\.biz\/en\/docs\/messaging-api\/retrying-api-request\//);
  }
});

test("every lifecycle stage names its Human Surface path and authoritative MONOLITH records", async () => {
  const stages = [
    "Lead / qualify", "Discover / survey", "Brief / concept", "Spatial coordination",
    "Technical design", "Price / contract / change", "Procurement / manufacture",
    "Logistics / install", "Handover / warranty / referral"
  ];
  const surfaceTerms = /(OA 1:1|personal push|groups|Flex→LIFF)/;
  const recordTerms = /(tenant|project|customer|consent|conversation|principal|resource|revision|survey|evidence|BOM|drawing|spec|price|change|grant|decision|audit|outbox|delivery|QA|logistics|install|as-built|warranty)/i;
  const exactHeader = "| State | Human Surface path | Authoritative MONOLITH record/fields | Required revision evidence | High-risk exit gate |";

  for (const language of editions) {
    const body = section(await read(research + `.${language}.md`), 11);
    assert.match(body, new RegExp(exactHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const stage of stages) {
      const cells = tableRow(body, stage);
      assert.equal(cells.length, 5, `${language}: ${stage} must have five lifecycle columns`);
      assert.match(cells[1], surfaceTerms, `${language}: ${stage} missing Human Surface route`);
      assert.match(cells[2], recordTerms, `${language}: ${stage} missing authoritative MONOLITH record/field`);
    }
    assert.match(body, /LINE is not the system of record/);
  }
});

test("reports preserve governed scope, roles, KPIs, roadmap, and gate schemas", async () => {
  const productFamilies = ["base", "wall", "tall/larder", "vanity", "wardrobe", "media", "office", "custom"];
  const roles = ["executive", "sales", "designer", "estimator", "procurement", "factory", "QA", "logistics", "installer", "finance", "partner", "customer", "customer-of-customer"];
  const kpis = ["conversion", "approval latency", "rework", "notification opt-out", "quarantine age", "SLA breach", "delivery reliability", "service recovery", "adoption"];
  const phases = ["P0 Trust closure", "Bounded Daph pilot", "Five governed journeys", "Tenant-2 shadow", "Controlled scale"];

  for (const language of editions) {
    const markdown = await read(research + `.${language}.md`);
    for (const priority of ["P0", "P1", "P2", "P3"]) assert.match(section(markdown, 8), new RegExp(priority));
    for (const family of productFamilies) assert.match(section(markdown, 12), new RegExp(family, "i"));
    for (const role of roles) assert.match(section(markdown, 14), new RegExp(role, "i"));
    for (const kpi of kpis) assert.match(section(markdown, 16), new RegExp(kpi, "i"));
    for (const phase of phases) assert.match(section(markdown, 17), new RegExp(phase));
    assert.match(section(markdown, 18), /\| Mandatory gate \| Owner \| Required evidence \| Failure response \| Rollback \|/);
    assert.match(section(markdown, 19), /\| URL\/evidence \| Publisher \| Date\/version \| Classification \| Supported claim \| Caveat \|/);
  }
});

test("English and Thai preserve the same decision numbers and key identifiers", async () => {
  const [en, th] = await Promise.all(editions.map((language) => read(research + `.${language}.md`)));
  const aligned = [
    "30 KB", "50 KB", "12 bubbles", "1,500", "300", "1,000", "P0", "P1", "P2", "P3",
    "PERMIT", "DENY", "STEP_UP", "QUARANTINE", "unknown-after-send",
    "NO-GO for broader customer messaging", "Daph is one pilot tenant", exactConclusion
  ];
  for (const text of aligned) {
    assert.ok(en.includes(text), `EN missing aligned identifier: ${text}`);
    assert.ok(th.includes(text), `TH missing aligned identifier: ${text}`);
  }
});

test("standalone HTML matches Markdown headings and key claims", async () => {
  const keyClaims = [
    "NO-GO for broader customer messaging", "Daph is one pilot tenant", "unknown-after-send",
    "715E4865B1A4498AC08C6E9AC7A0C7881A54645A645C088B130FE0572A92DE99",
    "6966AB9BB1C3B97E3856A66A35190E2D404627E5B88BFFE720462E96C296FD42"
  ];
  for (const language of editions) {
    const [markdown, html] = await Promise.all([
      read(research + `.${language}.md`),
      read(research + `.${language}.html`)
    ]);
    const mdHeadings = h2s(markdown).map(({ number, title }) => `${number}. ${title.replace(/[*`~]/g, "")}`);
    const htmlHeadings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((match) => stripHtml(match[1]));
    assert.deepEqual(htmlHeadings, mdHeadings);
    for (const claim of keyClaims) assert.ok(html.includes(claim), `${language} HTML missing key claim: ${claim}`);
  }
});

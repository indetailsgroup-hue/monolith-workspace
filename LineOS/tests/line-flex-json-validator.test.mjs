import test from "node:test";
import assert from "node:assert/strict";
import { createDraft, updateDraftAtPath } from "../line-flex-model.mjs";
import { getPreset } from "../line-flex-presets.mjs";
import { buildFlexMessage, measureUtf8Bytes } from "../line-flex-json.mjs";
import { VALIDATION_RULES, validateDraft } from "../line-flex-validator.mjs";

const draft = () => createDraft(getPreset("design-approval"), "th");

const LINE_REFERENCE = "https://developers.line.biz/en/reference/messaging-api/";
const FLEX_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/flex-message-elements/";
const ACTION_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/actions/";
const MONOLITH_REFERENCE =
  "./docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.html";

const EXPECTED_RULES = [
  ["LINE-ALT-001", "error", "official_constraint", "header", "altText", LINE_REFERENCE],
  ["LINE-ALT-002", "error", "official_constraint", "header", "altText", LINE_REFERENCE],
  ["LINE-SIZE-001", "error", "official_constraint", "body", "body.summary", FLEX_REFERENCE],
  ["LINE-IMG-001", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE],
  ["LINE-IMG-002", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE],
  ["LINE-BTN-001", "error", "official_constraint", "footer", "footer.primaryLabel", FLEX_REFERENCE],
  ["LINE-POSTBACK-001", "error", "official_constraint", "footer", "action.data", ACTION_REFERENCE],
  ["LINE-MESSAGE-001", "error", "official_constraint", "footer", "action.text", ACTION_REFERENCE],
  ["LINE-URI-001", "error", "official_constraint", "footer", "action.uri", ACTION_REFERENCE],
  ["MON-SIZE-001", "warning", "monolith_best_practice", "body", "body.summary", MONOLITH_REFERENCE],
  ["MON-ACT-001", "error", "monolith_best_practice", "footer",
    "intent.requestedActionType", MONOLITH_REFERENCE],
  ["MON-CTA-001", "warning", "monolith_best_practice", "footer",
    "footer.secondaryLabel", MONOLITH_REFERENCE],
  ["MON-TRUST-001", "warning", "monolith_best_practice", "body",
    "body.trustNote", MONOLITH_REFERENCE],
  ["MON-MEDIA-001", "guidance", "monolith_best_practice", "hero",
    "localAsset", MONOLITH_REFERENCE],
  ["MON-PROD-001", "guidance", "monolith_best_practice", "footer",
    "canonicalAction", MONOLITH_REFERENCE]
].map(([ruleId, severity, classification, block, field, sourceUrl]) => ({
  ruleId, severity, classification, block, field, sourceUrl
}));

const EXPECTED_TITLES = {
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
};

const EXPECTED_COPY = {
  en: {
    official_constraint: {
      explanation: "The generated payload violates a documented LINE Messaging API constraint.",
      remediation: "Edit the named field until it is inside the documented limit."
    },
    monolith_best_practice: {
      explanation: "The configuration violates an approved MONOLITH safety or usability rule.",
      remediation: "Use the recommended MONOLITH route or restore the required context."
    }
  },
  th: {
    official_constraint: {
      explanation: "Payload ที่สร้างขึ้นขัดกับข้อจำกัดในเอกสาร LINE Messaging API",
      remediation: "แก้ฟิลด์ที่ระบุให้อยู่ภายในขีดจำกัดตามเอกสาร"
    },
    monolith_best_practice: {
      explanation: "การตั้งค่านี้ขัดกับกติกาความปลอดภัยหรือการใช้งานของ MONOLITH ที่อนุมัติแล้ว",
      remediation: "ใช้เส้นทางที่ MONOLITH แนะนำหรือเติมบริบทที่จำเป็นให้ครบ"
    }
  }
};

const exactByteMessage = (targetBytes) => {
  const contents = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "" }]
    }
  };
  const paddingLength = targetBytes - measureUtf8Bytes(contents);
  assert.ok(paddingLength >= 0);
  contents.body.contents[0].text = "x".repeat(paddingLength);
  assert.equal(measureUtf8Bytes(contents), targetBytes);
  return { type: "flex", altText: "boundary", contents };
};

const makeDraft = (language, changes = []) => changes.reduce(
  (value, [path, replacement]) => updateDraftAtPath(value, path, replacement),
  createDraft(getPreset("design-approval"), language)
);

const scenarioFor = (ruleId, language) => {
  let value = makeDraft(language);
  let message = buildFlexMessage(value);
  const change = (path, replacement) => {
    value = updateDraftAtPath(value, path, replacement);
    message = buildFlexMessage(value);
  };
  const setAction = (action) => {
    message.contents.footer.contents[0].action = action;
  };

  switch (ruleId) {
    case "LINE-ALT-001": change(["altText"], ""); break;
    case "LINE-ALT-002": change(["altText"], "x".repeat(1501)); break;
    case "LINE-SIZE-001": message = exactByteMessage(30 * 1024 + 1); break;
    case "LINE-IMG-001": change(["hero", "exportUrl"], "http://unsafe.test/image.png"); break;
    case "LINE-IMG-002": change(["hero", "exportUrl"], "https://" + "x".repeat(1993)); break;
    case "LINE-BTN-001": change(["footer", "primaryLabel"], "x".repeat(41)); break;
    case "LINE-POSTBACK-001": setAction({ type: "postback", data: "x".repeat(301) }); break;
    case "LINE-MESSAGE-001": setAction({ type: "message", text: "x".repeat(301) }); break;
    case "LINE-URI-001": setAction({ type: "uri", uri: "x".repeat(1001) }); break;
    case "MON-SIZE-001": message = exactByteMessage(24 * 1024 + 1); break;
    case "MON-ACT-001": change(["intent", "requestedActionType"], "postback"); break;
    case "MON-CTA-001": change(["footer", "secondaryLabel"], "More"); break;
    case "MON-TRUST-001": change(["body", "revision"], ""); break;
    case "MON-MEDIA-001": break;
    case "MON-PROD-001": break;
    default: throw new Error("unknown_test_rule");
  }

  return { value, message };
};

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

test("routes Design Approval through the tokenized private review URI", () => {
  const action = buildFlexMessage(draft()).contents.footer.contents[0].action;
  assert.deepEqual(action, {
    type: "uri",
    label: "เปิดดูแบบและยืนยัน",
    uri: "https://example.com/monolith/demo/design-approval" +
      "?reviewToken=rvw_A1_7L3n9Q2pV8xK"
  });
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

test("reports malformed draft string values instead of throwing", () => {
  const cases = [
    { path: ["altText"], value: null, ruleId: "LINE-ALT-001" },
    { path: ["hero", "exportUrl"], value: 42, ruleId: "LINE-IMG-001" },
    { path: ["footer", "primaryLabel"], value: "", ruleId: "LINE-BTN-001" }
  ];

  for (const { path, value, ruleId } of cases) {
    const malformed = updateDraftAtPath(draft(), path, value);
    let findings;
    assert.doesNotThrow(() => {
      findings = validateDraft(malformed, buildFlexMessage(draft()));
    });
    assert.ok(findings.some((item) => item.ruleId === ruleId));
  }
});

test("reports malformed action values and tolerates missing actions", () => {
  const cases = [
    { action: { type: "postback", data: null }, ruleId: "LINE-POSTBACK-001" },
    { action: { type: "message", text: 42 }, ruleId: "LINE-MESSAGE-001" },
    { action: { type: "uri", uri: "" }, ruleId: "LINE-URI-001" }
  ];

  for (const { action, ruleId } of cases) {
    const message = buildFlexMessage(draft());
    message.contents.footer.contents[0].action = action;
    let findings;
    assert.doesNotThrow(() => {
      findings = validateDraft(draft(), message);
    });
    assert.ok(findings.some((item) => item.ruleId === ruleId));
  }

  const withoutAction = buildFlexMessage(draft());
  withoutAction.contents.footer.contents = [];
  assert.doesNotThrow(() => validateDraft(draft(), withoutAction));
  assert.doesNotThrow(() => validateDraft(draft(), null));
});

test("keeps the exact 15-rule registry deeply immutable", () => {
  const metadata = VALIDATION_RULES.map(({ when: _when, ...item }) => item);
  assert.deepEqual(metadata, EXPECTED_RULES);
  assert.equal(Object.isFrozen(VALIDATION_RULES), true);
  assert.equal(VALIDATION_RULES.every((item) => Object.isFrozen(item)), true);
  assert.throws(() => VALIDATION_RULES.push({}), TypeError);
  assert.throws(() => {
    VALIDATION_RULES[0].severity = "warning";
  }, TypeError);
});

test("applies exact 24 KiB and 30 KiB byte boundaries", () => {
  const cases = [
    { bytes: 24 * 1024, included: [], excluded: ["MON-SIZE-001", "LINE-SIZE-001"] },
    { bytes: 24 * 1024 + 1, included: ["MON-SIZE-001"], excluded: ["LINE-SIZE-001"] },
    { bytes: 30 * 1024, included: ["MON-SIZE-001"], excluded: ["LINE-SIZE-001"] },
    { bytes: 30 * 1024 + 1, included: ["LINE-SIZE-001"], excluded: ["MON-SIZE-001"] }
  ];

  for (const { bytes, included, excluded } of cases) {
    const message = exactByteMessage(bytes);
    assert.equal(measureUtf8Bytes(message.contents), bytes);
    const ids = validateDraft(draft(), message).map((item) => item.ruleId);
    for (const ruleId of included) assert.ok(ids.includes(ruleId), `${ruleId} at ${bytes}`);
    for (const ruleId of excluded) assert.ok(!ids.includes(ruleId), `${ruleId} at ${bytes}`);
  }
});

test("returns exact bilingual copy and finding keys for every rule", () => {
  const findingKeys = [
    "block", "classification", "explanation", "field", "remediation",
    "ruleId", "severity", "sourceUrl", "title"
  ];

  for (const language of ["en", "th"]) {
    for (const expected of EXPECTED_RULES) {
      const { value, message } = scenarioFor(expected.ruleId, language);
      const finding = validateDraft(value, message)
        .find((item) => item.ruleId === expected.ruleId);
      assert.ok(finding, `${language} ${expected.ruleId}`);
      assert.deepEqual(Object.keys(finding).sort(), findingKeys);
      assert.deepEqual(
        {
          title: finding.title,
          explanation: finding.explanation,
          remediation: finding.remediation
        },
        {
          title: EXPECTED_TITLES[language][expected.ruleId],
          explanation: EXPECTED_COPY[language][expected.classification].explanation,
          remediation: EXPECTED_COPY[language][expected.classification].remediation
        }
      );
    }
  }
});

test("orders findings by severity and rule ID", () => {
  const value = makeDraft("th", [
    [["altText"], "x".repeat(1501)],
    [["hero", "exportUrl"], "http://unsafe.test/image.png"],
    [["footer", "primaryLabel"], "x".repeat(41)],
    [["intent", "requestedActionType"], "postback"],
    [["footer", "secondaryLabel"], "More"],
    [["body", "revision"], ""]
  ]);
  const findings = validateDraft(value, exactByteMessage(24 * 1024 + 1));

  assert.deepEqual(findings.map((item) => item.ruleId), [
    "LINE-ALT-002", "LINE-BTN-001", "LINE-IMG-001", "MON-ACT-001",
    "MON-CTA-001", "MON-SIZE-001", "MON-TRUST-001",
    "MON-MEDIA-001", "MON-PROD-001"
  ]);
  assert.deepEqual(findings.map((item) => item.severity), [
    "error", "error", "error", "error",
    "warning", "warning", "warning",
    "guidance", "guidance"
  ]);
});

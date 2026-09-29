import { deepFreeze } from "./line-flex-model.mjs";
import { measureUtf8Bytes } from "./line-flex-json.mjs";

const LINE_REFERENCE = "https://developers.line.biz/en/reference/messaging-api/";
const FLEX_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/flex-message-elements/";
const ACTION_REFERENCE = "https://developers.line.biz/en/docs/messaging-api/actions/";
const MONOLITH_REFERENCE =
  "./docs/superpowers/specs/2026-08-01-monolith-line-flex-studio-design.en.html";

const isBlank = (value) => typeof value !== "string" || value.trim() === "";
const exceeds = (value, limit) => typeof value === "string" && value.length > limit;
const isInvalidString = (value, limit) => isBlank(value) || exceeds(value, limit);
const primaryAction = (message) => message?.contents?.footer?.contents?.[0]?.action;
const missingTrustField = (draft) => [
  draft?.body?.revision, draft?.body?.deadline, draft?.body?.requester,
  draft?.context?.audience, draft?.body?.trustNote
].some(isBlank);

const rule = (ruleId, severity, classification, block, field, sourceUrl, when) => ({
  ruleId, severity, classification, block, field, sourceUrl, when
});

export const VALIDATION_RULES = deepFreeze([
  rule("LINE-ALT-001", "error", "official_constraint", "header", "altText", LINE_REFERENCE,
    (draft) => isBlank(draft?.altText)),
  rule("LINE-ALT-002", "error", "official_constraint", "header", "altText", LINE_REFERENCE,
    (draft) => exceeds(draft?.altText, 1500)),
  rule("LINE-SIZE-001", "error", "official_constraint", "body", "body.summary", FLEX_REFERENCE,
    (_draft, message) => measureUtf8Bytes(message?.contents) > 30 * 1024),
  rule("LINE-IMG-001", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE,
    (draft) => !/^https:\/\//i.test(draft?.hero?.exportUrl)),
  rule("LINE-IMG-002", "error", "official_constraint", "hero", "hero.exportUrl", FLEX_REFERENCE,
    (draft) => exceeds(draft?.hero?.exportUrl, 2000)),
  rule("LINE-BTN-001", "error", "official_constraint", "footer", "footer.primaryLabel", FLEX_REFERENCE,
    (draft) => isInvalidString(draft?.footer?.primaryLabel, 40)),
  rule("LINE-POSTBACK-001", "error", "official_constraint", "footer", "action.data", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message)?.type === "postback" &&
      isInvalidString(primaryAction(message)?.data, 300)),
  rule("LINE-MESSAGE-001", "error", "official_constraint", "footer", "action.text", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message)?.type === "message" &&
      isInvalidString(primaryAction(message)?.text, 300)),
  rule("LINE-URI-001", "error", "official_constraint", "footer", "action.uri", ACTION_REFERENCE,
    (_draft, message) => primaryAction(message)?.type === "uri" &&
      isInvalidString(primaryAction(message)?.uri, 1000)),
  rule("MON-SIZE-001", "warning", "monolith_best_practice", "body", "body.summary",
    MONOLITH_REFERENCE, (_draft, message) => {
      const bytes = measureUtf8Bytes(message?.contents);
      return bytes > 24 * 1024 && bytes <= 30 * 1024;
    }),
  rule("MON-ACT-001", "error", "monolith_best_practice", "footer", "intent.requestedActionType",
    MONOLITH_REFERENCE, (draft) => draft?.intent?.risk === "high" &&
      ["postback", "message"].includes(draft?.intent?.requestedActionType)),
  rule("MON-CTA-001", "warning", "monolith_best_practice", "footer", "footer.secondaryLabel",
    MONOLITH_REFERENCE, (draft) => !isBlank(draft?.footer?.secondaryLabel)),
  rule("MON-TRUST-001", "warning", "monolith_best_practice", "body", "body.trustNote",
    MONOLITH_REFERENCE, missingTrustField),
  rule("MON-MEDIA-001", "guidance", "monolith_best_practice", "hero", "localAsset",
    MONOLITH_REFERENCE, (draft) => !isBlank(draft?.hero?.localAsset)),
  rule("MON-PROD-001", "guidance", "monolith_best_practice", "footer", "canonicalAction",
    MONOLITH_REFERENCE, (draft) => draft?.intent?.risk === "high")
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
  const language = draft?.language === "en" ? "en" : "th";
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

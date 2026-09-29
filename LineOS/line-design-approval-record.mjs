import { canonicalize, deepFreeze } from "./line-flex-model.mjs";

const TITLE = "Sandbox Verification Record — Demo · No Business Effect";
const CANONICALIZATION_VERSION = "line-design-approval-v1";
const INPUT_KEYS = deepFreeze([
  "recordId",
  "correlationId",
  "reviewSessionId",
  "providerContext",
  "scopeContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "revisionId",
  "artifactManifestSha256",
  "canonicalizationVersion",
  "requestedCanonicalAction",
  "outcome",
  "createdAt",
  "confirmedAt"
]);
const INPUT_KEY_SET = new Set(INPUT_KEYS);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REFERENCE_PATTERNS = {
  recordId: /^record_demo_\d{3}$/,
  correlationId: /^correlation_demo_\d{3}$/,
  reviewSessionId: /^review_session_demo_\d{3}$/,
  workItemRef: /^work_item_demo_\d{3}$/,
  approvalRequestRef: /^(?:request|approval_request)_demo_\d{3}$/
};
const PROVIDER_CONTEXTS = new Set([
  "Daph Studio · A1 sandbox fixture",
  "Other Studio · A1 sandbox fixture"
]);
const SCOPE_CONTEXTS = new Set([
  "Main kitchen review scope",
  "Guest bedroom review scope"
]);
const CANONICAL_ACTIONS = new Set([
  "design.approve_revision",
  "design.request_revision_changes"
]);
const RECORD_OUTCOMES = new Set(["sandbox_recorded", "sandbox_replayed"]);
const authenticRecords = new WeakSet();

const fail = () => {
  throw new Error("invalid_sandbox_verification_record_input");
};

const inputValuesFor = (input) => {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) {
    fail();
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== INPUT_KEYS.length ||
      !keys.every((key) => typeof key === "string" && INPUT_KEY_SET.has(key))) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (!INPUT_KEYS.every((key) => {
    const descriptor = descriptors[key];
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") &&
      !Object.hasOwn(descriptor, "get") && !Object.hasOwn(descriptor, "set");
  })) {
    fail();
  }
  return Object.fromEntries(INPUT_KEYS.map((key) => [key, descriptors[key].value]));
};

const matchesReference = (field, value) => typeof value === "string" &&
  REFERENCE_PATTERNS[field].test(value);

const timestampMilliseconds = (value) => {
  if (typeof value !== "string" || !CANONICAL_UTC_TIMESTAMP.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return null;
  }
  return milliseconds;
};

const assertValidInput = (input) => {
  const value = inputValuesFor(input);
  const createdAt = timestampMilliseconds(value.createdAt);
  const confirmedAt = timestampMilliseconds(value.confirmedAt);
  const valid = matchesReference("recordId", value.recordId) &&
    matchesReference("correlationId", value.correlationId) &&
    matchesReference("reviewSessionId", value.reviewSessionId) &&
    PROVIDER_CONTEXTS.has(value.providerContext) &&
    SCOPE_CONTEXTS.has(value.scopeContext) &&
    matchesReference("workItemRef", value.workItemRef) &&
    matchesReference("approvalRequestRef", value.approvalRequestRef) &&
    typeof value.revisionLabel === "string" && /^D-\d{2}$/.test(value.revisionLabel) &&
    SHA256_HEX.test(value.revisionId) &&
    SHA256_HEX.test(value.artifactManifestSha256) &&
    value.canonicalizationVersion === CANONICALIZATION_VERSION &&
    CANONICAL_ACTIONS.has(value.requestedCanonicalAction) &&
    RECORD_OUTCOMES.has(value.outcome) &&
    createdAt !== null && confirmedAt !== null && confirmedAt >= createdAt;
  if (!valid) fail();
  return value;
};

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function createSandboxVerificationRecord(input) {
  const value = assertValidInput(input);
  const payload = {
    title: TITLE,
    recordVersion: 1,
    mode: "sandbox",
    businessEffect: "none",
    recordId: value.recordId,
    correlationId: value.correlationId,
    reviewSessionId: value.reviewSessionId,
    providerContext: value.providerContext,
    scopeContext: value.scopeContext,
    workItemRef: value.workItemRef,
    approvalRequestRef: value.approvalRequestRef,
    revisionLabel: value.revisionLabel,
    revisionId: value.revisionId,
    artifactManifestSha256: value.artifactManifestSha256,
    requestedCanonicalAction: value.requestedCanonicalAction,
    outcome: value.outcome,
    createdAt: value.createdAt,
    confirmedAt: value.confirmedAt,
    digestAlgorithm: "SHA-256",
    canonicalizationVersion: value.canonicalizationVersion
  };
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digestBytes = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const record = deepFreeze({
    ...payload,
    recordDigest: toHex(new Uint8Array(digestBytes))
  });
  authenticRecords.add(record);
  return record;
}

const LABELS = deepFreeze({
  en: [
    "Mode",
    "Business effect",
    "Record ID",
    "Correlation ID",
    "Review session",
    "Provider context",
    "Scope context",
    "Work item reference",
    "Request reference",
    "Revision label",
    "Revision ID",
    "Artifact manifest SHA-256",
    "Requested action",
    "Outcome",
    "Created at",
    "Confirmed at",
    "Canonicalization version",
    "SHA-256 record digest"
  ],
  th: [
    "โหมด",
    "ผลต่อธุรกิจ",
    "รหัสบันทึก",
    "รหัสความสัมพันธ์",
    "เซสชันตรวจแบบ",
    "บริบทผู้ให้บริการ",
    "ขอบเขตการตรวจ",
    "รหัสงาน",
    "รหัสคำขอ",
    "ชื่อรุ่นแบบ",
    "รหัสรุ่นแบบ",
    "SHA-256 รายการไฟล์",
    "การดำเนินการที่ร้องขอ",
    "ผลลัพธ์",
    "เวลาสร้าง",
    "เวลายืนยัน",
    "เวอร์ชัน canonicalization",
    "ค่าแฮช SHA-256 ของบันทึก"
  ]
});

const ROW_FIELDS = deepFreeze([
  "mode",
  "businessEffect",
  "recordId",
  "correlationId",
  "reviewSessionId",
  "providerContext",
  "scopeContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "revisionId",
  "artifactManifestSha256",
  "requestedCanonicalAction",
  "outcome",
  "createdAt",
  "confirmedAt",
  "canonicalizationVersion",
  "recordDigest"
]);

export function sandboxVerificationRecordRowsFor(record, language) {
  if (!Object.hasOwn(LABELS, language)) throw new Error("unsupported_language");
  if (!authenticRecords.has(record)) throw new Error("unknown_sandbox_verification_record");
  return deepFreeze(ROW_FIELDS.map((field, index) => [
    LABELS[language][index],
    String(record[field])
  ]));
}

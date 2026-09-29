import { canonicalize, deepFreeze } from "./line-flex-model.mjs";

export const ALLOWED_REVIEW_OUTCOMES = deepFreeze([
  "sandbox_recorded",
  "sandbox_replayed",
  "expired",
  "stale_revision",
  "version_conflict",
  "idempotency_conflict",
  "unauthorized",
  "not_available",
  "invalid_request",
  "temporarily_unavailable"
]);

const REVIEW_SNAPSHOT_KEYS = deepFreeze([
  "reviewSessionId",
  "serverIssuedIdempotencyKey",
  "mode",
  "businessEffect",
  "providerContext",
  "workItemRef",
  "approvalRequestRef",
  "revisionLabel",
  "revisionId",
  "artifactManifestSha256",
  "digestAlgorithm",
  "canonicalizationVersion",
  "expectedWorkflowVersion",
  "reviewArtifacts",
  "requestedCanonicalAction",
  "plainLanguageConsequence",
  "issuedAt",
  "expiresAt"
]);

const CONFIRM_REVIEW_INPUT_KEYS = deepFreeze([
  "reviewSessionId",
  "serverIssuedIdempotencyKey",
  "expectedRevisionId",
  "decision"
]);

const REVIEW_ARTIFACT_KEYS = deepFreeze(["kind", "label", "uri"]);
const REVIEW_ARTIFACT_ORIGIN = "https://example.com";
const REVIEW_ARTIFACT_PATH_PREFIX = "/monolith/demo/artifacts/";
const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "tenant",
  "tenantid",
  "tenantassertion",
  "customer",
  "customerid",
  "customeridentity",
  "role",
  "recipient",
  "project",
  "projectid",
  "projectowner",
  "approvalstatus",
  "approved",
  "signature",
  "signaturestatus",
  "keyid",
  "privatekey",
  "publickey",
  "signingkey",
  "secret",
  "lineidtoken",
  "accesstoken"
]);

const isRecord = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isSha256Hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const hasExactOwnKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (!actual.every((key) => typeof key === "string")) return false;
  return canonicalize(actual.sort()) === canonicalize([...expected].sort());
};

const hasDenseExactArrayKeys = (value) => {
  if (!Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (actual.length !== value.length + 1 ||
      !actual.every((key) => typeof key === "string")) return false;
  const indexKeys = new Set(actual);
  if (!indexKeys.delete("length") || indexKeys.size !== value.length) return false;
  return [...indexKeys].every((key) => {
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < value.length &&
      String(index) === key;
  });
};

const hasForbiddenAuthorityField = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_AUTHORITY_FIELDS.has(normalized)) return true;
    if (hasForbiddenAuthorityField(child, seen)) return true;
  }
  return false;
};

const isCanonicalizable = (value) => {
  try {
    return typeof canonicalize(value) === "string";
  } catch {
    return false;
  }
};

const isAllowedReviewArtifactUri = (value) => {
  if (!isNonEmptyString(value)) return false;
  try {
    const uri = new URL(value);
    const remainingPath = uri.pathname.slice(REVIEW_ARTIFACT_PATH_PREFIX.length);
    return uri.origin === REVIEW_ARTIFACT_ORIGIN &&
      uri.pathname.startsWith(REVIEW_ARTIFACT_PATH_PREFIX) &&
      remainingPath.split("/").some((segment) => segment.length > 0) &&
      uri.username === "" &&
      uri.password === "" &&
      uri.search === "" &&
      uri.hash === "";
  } catch {
    return false;
  }
};

const isReviewArtifact = (artifact) => hasExactOwnKeys(artifact, REVIEW_ARTIFACT_KEYS) &&
  artifact.kind === "rendered_preview" &&
  isNonEmptyString(artifact.label) &&
  isAllowedReviewArtifactUri(artifact.uri);

export function assertReviewSnapshot(snapshot) {
  const valid = hasExactOwnKeys(snapshot, REVIEW_SNAPSHOT_KEYS) &&
    !hasForbiddenAuthorityField(snapshot) &&
    isCanonicalizable(snapshot) &&
    isNonEmptyString(snapshot.reviewSessionId) &&
    isNonEmptyString(snapshot.serverIssuedIdempotencyKey) &&
    snapshot.mode === "sandbox" &&
    snapshot.businessEffect === "none" &&
    isNonEmptyString(snapshot.providerContext) &&
    isNonEmptyString(snapshot.workItemRef) &&
    isNonEmptyString(snapshot.approvalRequestRef) &&
    isNonEmptyString(snapshot.revisionLabel) &&
    isSha256Hex(snapshot.revisionId) &&
    isSha256Hex(snapshot.artifactManifestSha256) &&
    snapshot.digestAlgorithm === "SHA-256" &&
    isNonEmptyString(snapshot.canonicalizationVersion) &&
    Number.isInteger(snapshot.expectedWorkflowVersion) &&
    snapshot.expectedWorkflowVersion >= 0 &&
    Array.isArray(snapshot.reviewArtifacts) &&
    snapshot.reviewArtifacts.length > 0 &&
    hasDenseExactArrayKeys(snapshot.reviewArtifacts) &&
    snapshot.reviewArtifacts.every(isReviewArtifact) &&
    isNonEmptyString(snapshot.requestedCanonicalAction) &&
    isNonEmptyString(snapshot.plainLanguageConsequence) &&
    isNonEmptyString(snapshot.issuedAt) &&
    isNonEmptyString(snapshot.expiresAt);

  if (!valid) throw new Error("invalid_review_snapshot");
  return snapshot;
}

export function assertConfirmReviewInput(input) {
  const valid = hasExactOwnKeys(input, CONFIRM_REVIEW_INPUT_KEYS) &&
    !hasForbiddenAuthorityField(input) &&
    isCanonicalizable(input) &&
    isNonEmptyString(input.reviewSessionId) &&
    isNonEmptyString(input.serverIssuedIdempotencyKey) &&
    isSha256Hex(input.expectedRevisionId) &&
    input.decision === "confirm";

  if (!valid) throw new Error("invalid_confirm_review_input");
  return input;
}

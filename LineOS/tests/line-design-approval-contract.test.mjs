import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_REVIEW_OUTCOMES,
  assertConfirmReviewInput,
  assertReviewSnapshot
} from "../line-design-approval-contract.mjs";
import { buildFlexMessage } from "../line-flex-json.mjs";
import { createDraft } from "../line-flex-model.mjs";
import { PRESET_IDS, getPreset } from "../line-flex-presets.mjs";

const REVIEW_TOKEN = "rvw_A1_7L3n9Q2pV8xK";
const SHA256 = "a".repeat(64);

const reviewSnapshot = () => ({
  reviewSessionId: "review_session_demo_001",
  serverIssuedIdempotencyKey: "idempotency_demo_001",
  mode: "sandbox",
  businessEffect: "none",
  providerContext: "Daph Studio · A1 sandbox fixture",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "approval_request_demo_001",
  revisionLabel: "D-07",
  revisionId: SHA256,
  artifactManifestSha256: "b".repeat(64),
  digestAlgorithm: "SHA-256",
  canonicalizationVersion: "line-design-approval-v1",
  expectedWorkflowVersion: 7,
  reviewArtifacts: [{
    kind: "rendered_preview",
    label: "Main kitchen perspective",
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  requestedCanonicalAction: "design.approve_revision",
  plainLanguageConsequence: "Records a sandbox confirmation attempt only.",
  issuedAt: "2026-08-02T03:00:00.000Z",
  expiresAt: "2026-08-02T03:15:00.000Z"
});

test("gives only Design Approval one opaque non-secret review token", () => {
  const approval = createDraft(getPreset("design-approval"), "en");
  assert.equal(approval.reviewToken, REVIEW_TOKEN);
  assert.match(approval.reviewToken, /^[A-Za-z0-9_-]{16,128}$/);
  assert.doesNotMatch(
    approval.reviewToken,
    /tenant|customer|role|recipient|project|approval|secret|signature|key/i
  );

  for (const id of PRESET_IDS.filter((presetId) => presetId !== "design-approval")) {
    assert.equal(Object.hasOwn(createDraft(getPreset(id), "en"), "reviewToken"), false);
  }
});

test("puts only the encoded review token on the approved Design Approval URI", () => {
  const draft = createDraft(getPreset("design-approval"), "en");
  const action = buildFlexMessage(draft).contents.footer.contents[0].action;
  const uri = new URL(action.uri);

  assert.equal(action.type, "uri");
  assert.equal(uri.origin, "https://example.com");
  assert.equal(uri.pathname, "/monolith/demo/design-approval");
  assert.deepEqual([...uri.searchParams.keys()], ["reviewToken"]);
  assert.equal(uri.searchParams.get("reviewToken"), REVIEW_TOKEN);
  assert.equal(
    action.uri,
    "https://example.com/monolith/demo/design-approval?reviewToken=" +
      encodeURIComponent(REVIEW_TOKEN)
  );
});

test("keeps the other four preset action payloads unchanged", () => {
  const expected = {
    "quote-order": {
      type: "uri", label: "Review quote and order",
      uri: "https://example.com/monolith/demo/quote-order"
    },
    "sla-escalation": {
      type: "postback", label: "Acknowledge SLA", data: "intent=sla-escalation"
    },
    "site-update": {
      type: "uri", label: "View curated progress",
      uri: "https://example.com/monolith/demo/site-update"
    },
    "issue-evidence": {
      type: "postback", label: "Acknowledge and review", data: "intent=issue-evidence"
    }
  };

  for (const [id, action] of Object.entries(expected)) {
    const draft = createDraft(getPreset(id), "en");
    assert.deepEqual(buildFlexMessage(draft).contents.footer.contents[0].action, action);
  }
});

test("accepts only a complete A1 sandbox review snapshot", () => {
  const snapshot = reviewSnapshot();
  assert.equal(assertReviewSnapshot(snapshot), snapshot);

  for (const field of Object.keys(snapshot)) {
    const incomplete = reviewSnapshot();
    delete incomplete[field];
    assert.throws(() => assertReviewSnapshot(incomplete), new Error("invalid_review_snapshot"));
  }

  for (const [field, value] of [["mode", "production"], ["businessEffect", "approval"]]) {
    assert.throws(
      () => assertReviewSnapshot({ ...reviewSnapshot(), [field]: value }),
      new Error("invalid_review_snapshot")
    );
  }
});

test("rejects malformed review snapshot revision content hashes", () => {
  for (const revisionId of ["revision_demo_001", "a".repeat(63), "g".repeat(64)]) {
    assert.throws(
      () => assertReviewSnapshot({ ...reviewSnapshot(), revisionId }),
      new Error("invalid_review_snapshot")
    );
  }
});

test("rejects noncanonical uppercase artifact manifest SHA-256 hex", () => {
  const snapshot = reviewSnapshot();
  snapshot.artifactManifestSha256 = "B".repeat(64);
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

const forbiddenArtifactCases = [
  ["an unknown review artifact kind", {
    kind: "revision_document"
  }],
  ["an alternate HTTPS review artifact origin", {
    uri: "https://cdn.example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  ["a review artifact path outside the sandbox prefix", {
    uri: "https://example.com/monolith/demo/private/main-kitchen.png"
  }],
  ["credentials in a review artifact URL", {
    uri: "https://viewer:secret@example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  ["a query in a review artifact URL", {
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png?download=1"
  }],
  ["a hash in a review artifact URL", {
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png#detail"
  }],
  ["an empty review artifact path", {
    uri: "https://example.com/monolith/demo/artifacts/"
  }]
];

for (const [description, changes] of forbiddenArtifactCases) {
  test(`rejects ${description}`, () => {
    const snapshot = reviewSnapshot();
    Object.assign(snapshot.reviewArtifacts[0], changes);
    assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
  });
}

test("rejects a sparse review artifacts array", () => {
  const snapshot = reviewSnapshot();
  snapshot.reviewArtifacts = new Array(1);
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

test("rejects a non-enumerable extra own key on the review artifacts array", () => {
  const snapshot = reviewSnapshot();
  Object.defineProperty(snapshot.reviewArtifacts, "tenantId", {
    value: "tenant_demo",
    enumerable: false
  });
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

test("rejects a symbol extra own key on the review artifacts array", () => {
  const snapshot = reviewSnapshot();
  snapshot.reviewArtifacts[Symbol("tenantId")] = "tenant_demo";
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

test("rejects top-level and nested authority fields in review snapshots", () => {
  const topLevelCases = [
    ["tenantId", "tenant_demo"],
    ["customerIdentity", "customer_demo"],
    ["approvalStatus", "approved"],
    ["signature", "signed-value"],
    ["keyId", "signing-key"]
  ];
  for (const [field, value] of topLevelCases) {
    assert.throws(
      () => assertReviewSnapshot({ ...reviewSnapshot(), [field]: value }),
      new Error("invalid_review_snapshot")
    );
  }

  for (const nestedField of ["tenantAssertion", "customerId", "role", "signature", "privateKey"]) {
    const snapshot = reviewSnapshot();
    snapshot.reviewArtifacts[0][nestedField] = "forbidden";
    assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
  }
});

test("rejects a non-enumerable extra own key in a review snapshot", () => {
  const snapshot = reviewSnapshot();
  Object.defineProperty(snapshot, "tenantId", {
    value: "tenant_demo",
    enumerable: false
  });
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

test("rejects a symbol extra own key in a review snapshot", () => {
  const snapshot = reviewSnapshot();
  snapshot[Symbol("tenantId")] = "tenant_demo";
  assert.throws(() => assertReviewSnapshot(snapshot), new Error("invalid_review_snapshot"));
});

test("accepts only the four-field confirm input with decision confirm", () => {
  const valid = {
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    expectedRevisionId: SHA256,
    decision: "confirm"
  };
  assert.equal(assertConfirmReviewInput(valid), valid);

  for (const field of Object.keys(valid)) {
    const incomplete = { ...valid };
    delete incomplete[field];
    assert.throws(
      () => assertConfirmReviewInput(incomplete),
      new Error("invalid_confirm_review_input")
    );
  }
  for (const extra of ["tenantId", "customerIdentity", "approvalStatus", "signature", "keyId"]) {
    assert.throws(
      () => assertConfirmReviewInput({ ...valid, [extra]: "forbidden" }),
      new Error("invalid_confirm_review_input")
    );
  }
  assert.throws(
    () => assertConfirmReviewInput({ ...valid, decision: "approve" }),
    new Error("invalid_confirm_review_input")
  );
});

test("rejects malformed expected revision content hashes", () => {
  const valid = {
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    expectedRevisionId: SHA256,
    decision: "confirm"
  };
  for (const expectedRevisionId of ["revision_demo_001", "a".repeat(63), "g".repeat(64)]) {
    assert.throws(
      () => assertConfirmReviewInput({ ...valid, expectedRevisionId }),
      new Error("invalid_confirm_review_input")
    );
  }
});

test("rejects a non-enumerable extra own key in confirm input", () => {
  const input = {
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    expectedRevisionId: SHA256,
    decision: "confirm"
  };
  Object.defineProperty(input, "tenantId", {
    value: "tenant_demo",
    enumerable: false
  });
  assert.throws(
    () => assertConfirmReviewInput(input),
    new Error("invalid_confirm_review_input")
  );
});

test("rejects a symbol extra own key in confirm input", () => {
  const input = {
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    expectedRevisionId: SHA256,
    decision: "confirm"
  };
  input[Symbol("tenantId")] = "tenant_demo";
  assert.throws(
    () => assertConfirmReviewInput(input),
    new Error("invalid_confirm_review_input")
  );
});

test("exposes the exact deeply frozen A1 outcome registry", () => {
  assert.deepEqual(ALLOWED_REVIEW_OUTCOMES, [
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
  assert.equal(Object.isFrozen(ALLOWED_REVIEW_OUTCOMES), true);
  assert.throws(() => ALLOWED_REVIEW_OUTCOMES.push("approved"), TypeError);
});

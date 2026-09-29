import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createSandboxDesignApprovalPort
} from "../line-design-approval-sandbox.mjs";
import {
  createSandboxVerificationRecord
} from "../line-design-approval-record.mjs";

const REVIEW_TOKEN = "rvw_A1_7L3n9Q2pV8xK";
const CROSS_SCOPE_TOKEN = "rvw_A1_crossScope01";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SAFE_ALTERNATE_ARTIFACT = Object.freeze({
  kind: "rendered_preview",
  label: "Guest bedroom perspective",
  uri: "https://example.com/monolith/demo/artifacts/guest-bedroom.png"
});

const fixture = () => ({
  providerContext: "Daph Studio · A1 sandbox fixture",
  scopeContext: "Main kitchen review scope",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "approval_request_demo_001",
  revisionLabel: "D-07",
  revisionId: SHA_A,
  artifactManifestSha256: SHA_B,
  canonicalizationVersion: "line-design-approval-v1",
  expectedWorkflowVersion: 7,
  reviewArtifacts: [{
    kind: "rendered_preview",
    label: "Main kitchen perspective",
    uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
  }],
  requestedCanonicalAction: "design.approve_revision",
  plainLanguageConsequence: "Records a sandbox confirmation attempt only.",
  reviewTtlMs: 15 * 60 * 1000,
  fixtureIdentity: "fx_A1_7L3n9Q2pV8xK",
  customerIdentity: "customer-internal-001",
  tenantId: "tenant-internal-001",
  role: "internal-reviewer",
  secret: "fixture-secret-value"
});

const createIdFactory = () => {
  const counts = new Map();
  const prefixes = {
    reviewSessionId: "review_session_demo_",
    serverIssuedIdempotencyKey: "idempotency_demo_",
    recordId: "record_demo_",
    correlationId: "correlation_demo_"
  };
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefixes[kind]}${String(next).padStart(3, "0")}`;
  };
};

const createSequencedIdFactory = (sequences) => {
  const fallback = createIdFactory();
  const indexes = new Map();
  return (kind) => {
    const values = sequences[kind];
    if (!values) return fallback(kind);
    const index = indexes.get(kind) ?? 0;
    indexes.set(kind, index + 1);
    return values[index] ?? values.at(-1);
  };
};

function createHarness(options = {}) {
  let now = options.now ?? "2026-08-02T03:00:00.000Z";
  const openedFixture = options.openedFixture ?? fixture();
  let currentFixture = options.currentFixture ?? structuredClone(openedFixture);
  const ledger = options.ledger ?? new Map();
  const source = options.fixtureSource ?? {
    async open(reviewToken) {
      if (reviewToken === CROSS_SCOPE_TOKEN) {
        throw new Error("cross-scope customer-internal-001 fixture-secret-value");
      }
      return reviewToken === REVIEW_TOKEN ? openedFixture : null;
    },
    async recheck() {
      return currentFixture;
    }
  };
  const port = createSandboxDesignApprovalPort({
    clock: () => now,
    idFactory: options.idFactory ?? createIdFactory(),
    fixtureSource: source,
    recordFactory: options.recordFactory ?? createSandboxVerificationRecord,
    ledger
  });
  return {
    ledger,
    openedFixture,
    port,
    setCurrent(changes) {
      currentFixture = { ...currentFixture, ...changes };
    },
    setNow(value) {
      now = value;
    }
  };
}

const confirmInput = (snapshot, changes = {}) => ({
  reviewSessionId: snapshot.reviewSessionId,
  serverIssuedIdempotencyKey: snapshot.serverIssuedIdempotencyKey,
  expectedRevisionId: snapshot.revisionId,
  decision: "confirm",
  ...changes
});

const malformedRecordsFrom = (trusted) => {
  const missingField = { ...trusted };
  delete missingField.title;

  const hiddenExtra = { ...trusted };
  Object.defineProperty(hiddenExtra, "reviewToken", {
    value: REVIEW_TOKEN,
    enumerable: false
  });

  const symbolExtra = { ...trusted };
  symbolExtra[Symbol("tenantId")] = "tenant-internal-001";

  const accessorDescriptors = Object.getOwnPropertyDescriptors(trusted);
  accessorDescriptors.recordDigest = {
    enumerable: true,
    configurable: false,
    get() {
      throw new Error("accessor fixture-secret-value");
    }
  };
  const accessor = Object.defineProperties({}, accessorDescriptors);
  Object.freeze(accessor);

  const proxy = new Proxy(trusted, {
    ownKeys() {
      throw new Error("proxy fixture-secret-value");
    }
  });

  return [
    ["token extra", Object.freeze({ ...trusted, reviewToken: REVIEW_TOKEN })],
    ["tenant extra", Object.freeze({ ...trusted, tenantId: "tenant-internal-001" })],
    ["missing field", Object.freeze(missingField)],
    ["forged digest", Object.freeze({ ...trusted, recordDigest: SHA_C })],
    ["hidden extra", Object.freeze(hiddenExtra)],
    ["symbol extra", Object.freeze(symbolExtra)],
    ["accessor", accessor],
    ["proxy", proxy]
  ];
};

test("opens one adapter-owned deeply frozen A1 ReviewSnapshot", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);

  assert.deepEqual(Object.keys(harness.port), ["openReview", "confirmReview"]);
  assert.deepEqual(snapshot, {
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    mode: "sandbox",
    businessEffect: "none",
    providerContext: "Daph Studio · A1 sandbox fixture",
    workItemRef: "work_item_demo_001",
    approvalRequestRef: "approval_request_demo_001",
    revisionLabel: "D-07",
    revisionId: SHA_A,
    artifactManifestSha256: SHA_B,
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
  assert.notEqual(snapshot, harness.openedFixture);
  assert.notEqual(snapshot.reviewArtifacts, harness.openedFixture.reviewArtifacts);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.reviewArtifacts), true);
  assert.equal(Object.isFrozen(snapshot.reviewArtifacts[0]), true);
  assert.throws(() => {
    snapshot.reviewArtifacts[0].label = "changed";
  }, TypeError);
});

test("collapses invalid, missing, and cross-scope lookups into one neutral result", async () => {
  const { port } = createHarness();
  const expected = { outcome: "not_available" };

  assert.deepEqual(await port.openReview("rvw_A1_missing00001"), expected);
  assert.deepEqual(await port.openReview(undefined), expected);
  assert.deepEqual(await port.openReview(CROSS_SCOPE_TOKEN), expected);
  for (const value of [
    await port.openReview("rvw_A1_missing00001"),
    await port.openReview(CROSS_SCOPE_TOKEN)
  ]) {
    assert.equal(JSON.stringify(value), '{"outcome":"not_available"}');
    assert.equal(Object.isFrozen(value), true);
  }
});

test("validates all fixture-visible values before disclosing a snapshot", async () => {
  const cases = [
    ["provider", { providerContext: "Tenant tenant-internal-001" }],
    ["scope", { scopeContext: "Secret customer scope" }],
    ["work reference", { workItemRef: "customer-internal-001" }],
    ["request reference", { approvalRequestRef: "tenant-internal-001" }],
    ["action", { requestedCanonicalAction: "design.approved" }],
    ["missing identity", { fixtureIdentity: undefined }],
    ["semantic identity", { fixtureIdentity: "customer-internal-001" }]
  ];

  for (const [label, changes] of cases) {
    const openedFixture = { ...fixture(), ...changes };
    const { port } = createHarness({ openedFixture });
    const result = await port.openReview(REVIEW_TOKEN);
    assert.deepEqual(result, { outcome: "not_available" }, label);
    assert.equal(JSON.stringify(result), '{"outcome":"not_available"}', label);
  }
});

const fixtureDisclosureCases = [
  ["English artifact-label leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Secret customer tenant token alice@example.com",
      uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
    }]
  }],
  ["Thai artifact-label leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "ข้อมูลลับ ลูกค้า ผู้เช่า โทเคน สมชาย 0812345678",
      uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png"
    }]
  }],
  ["raw artifact-path leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Main kitchen perspective",
      uri: "https://example.com/monolith/demo/artifacts/customer-secret-token-alice@example.com.png"
    }]
  }],
  ["encoded English artifact-path leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Main kitchen perspective",
      uri: "https://example.com/monolith/demo/artifacts/%74enant-%73ecret-%74oken.png"
    }]
  }],
  ["encoded Thai artifact-path leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Main kitchen perspective",
      uri: "https://example.com/monolith/demo/artifacts/" +
        encodeURIComponent("ข้อมูลลับ-ลูกค้า-โทเคน") + ".png"
    }]
  }],
  ["artifact-query leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Main kitchen perspective",
      uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png?token=fixture-secret-value"
    }]
  }],
  ["artifact-hash leakage", {
    reviewArtifacts: [{
      kind: "rendered_preview",
      label: "Main kitchen perspective",
      uri: "https://example.com/monolith/demo/artifacts/main-kitchen.png#customer-tenant-token"
    }]
  }],
  ["English consequence leakage", {
    plainLanguageConsequence: "Records customer alice@example.com secret tenant token."
  }],
  ["Thai consequence leakage", {
    plainLanguageConsequence: "บันทึกข้อมูลลับของลูกค้า ผู้เช่า โทเคน และเบอร์ 0812345678"
  }]
];

for (const [label, changes] of fixtureDisclosureCases) {
  test(`rejects ${label} before snapshot disclosure`, async () => {
    const openedFixture = { ...fixture(), ...changes };
    const { port } = createHarness({ openedFixture });
    const result = await port.openReview(REVIEW_TOKEN);
    assert.deepEqual(result, { outcome: "not_available" });
    assert.equal(JSON.stringify(result), '{"outcome":"not_available"}');
    assert.equal(Object.isFrozen(result), true);
  });
}

test("binds opaque fixture identity privately and rejects identity changes", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  assert.equal(JSON.stringify(snapshot).includes("fx_A1_7L3n9Q2pV8xK"), false);
  harness.setCurrent({ fixtureIdentity: "fx_A1_Changed9Q2pV8xK" });
  harness.setNow("2026-08-02T03:01:00.000Z");

  assert.deepEqual(
    await harness.port.confirmReview(confirmInput(snapshot)),
    { outcome: "not_available" }
  );
  assert.equal(harness.ledger.size, 0);
});

test("issues session and idempotency identity inside the adapter", async () => {
  const issued = [];
  const harness = createHarness({
    idFactory(kind) {
      issued.push(kind);
      return {
        reviewSessionId: "review_session_demo_002",
        serverIssuedIdempotencyKey: "idempotency_demo_002"
      }[kind] ?? `${kind}_unexpected`;
    }
  });
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);

  assert.deepEqual(issued, ["reviewSessionId", "serverIssuedIdempotencyKey"]);
  assert.equal(snapshot.reviewSessionId, "review_session_demo_002");
  assert.equal(snapshot.serverIssuedIdempotencyKey, "idempotency_demo_002");
  assert.equal(JSON.stringify(snapshot).includes(REVIEW_TOKEN), false);
});

test("rejects malformed adapter-issued IDs with one bounded outcome", async () => {
  const cases = [
    ["reviewSessionId", "review_session_demo_1"],
    ["serverIssuedIdempotencyKey", "idempotency_fixture-secret-value"],
    ["recordId", "record_demo_1"],
    ["correlationId", "correlation_fixture-secret-value"]
  ];

  for (const [kind, invalidValue] of cases) {
    const harness = createHarness({
      idFactory: createSequencedIdFactory({ [kind]: [invalidValue] })
    });
    const opened = await harness.port.openReview(REVIEW_TOKEN);
    const result = kind === "reviewSessionId" || kind === "serverIssuedIdempotencyKey"
      ? opened
      : await harness.port.confirmReview(confirmInput(opened));
    assert.deepEqual(result, { outcome: "temporarily_unavailable" }, kind);
    assert.equal(JSON.stringify(result), '{"outcome":"temporarily_unavailable"}', kind);
    assert.equal(Object.isFrozen(result), true, kind);
    assert.equal(harness.ledger.size, 0, kind);
  }
});

test("rejects an idempotency-key collision across distinct sessions", async () => {
  const harness = createHarness({
    idFactory: createSequencedIdFactory({
      reviewSessionId: ["review_session_demo_001", "review_session_demo_002"],
      serverIssuedIdempotencyKey: ["idempotency_demo_001", "idempotency_demo_001"]
    })
  });

  const first = await harness.port.openReview(REVIEW_TOKEN);
  const second = await harness.port.openReview(REVIEW_TOKEN);
  assert.equal(first.reviewSessionId, "review_session_demo_001");
  assert.deepEqual(second, { outcome: "temporarily_unavailable" });
  assert.equal(harness.ledger.size, 0);
});

test("rejects duplicate record and correlation IDs before a second commit", async () => {
  const cases = [
    {
      recordId: ["record_demo_001", "record_demo_001"],
      correlationId: ["correlation_demo_001", "correlation_demo_002"]
    },
    {
      recordId: ["record_demo_001", "record_demo_002"],
      correlationId: ["correlation_demo_001", "correlation_demo_001"]
    }
  ];

  for (const sequences of cases) {
    const harness = createHarness({
      idFactory: createSequencedIdFactory({
        reviewSessionId: ["review_session_demo_001", "review_session_demo_002"],
        serverIssuedIdempotencyKey: ["idempotency_demo_001", "idempotency_demo_002"],
        ...sequences
      })
    });
    const first = await harness.port.openReview(REVIEW_TOKEN);
    const second = await harness.port.openReview(REVIEW_TOKEN);
    harness.setNow("2026-08-02T03:01:00.000Z");

    assert.equal(
      (await harness.port.confirmReview(confirmInput(first))).outcome,
      "sandbox_recorded"
    );
    assert.deepEqual(
      await harness.port.confirmReview(confirmInput(second)),
      { outcome: "temporarily_unavailable" }
    );
    assert.equal(harness.ledger.size, 1);
  }
});

test("fails closed at the exact expiry boundary and remains expired", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow(snapshot.expiresAt);

  assert.deepEqual(
    await harness.port.confirmReview(confirmInput(snapshot)),
    { outcome: "expired" }
  );
  harness.setNow("2026-08-02T03:16:00.000Z");
  assert.deepEqual(
    await harness.port.confirmReview(confirmInput(snapshot)),
    { outcome: "expired" }
  );
  assert.equal(harness.ledger.size, 0);
});

test("rechecks revision, artifact manifest, and workflow version before recording", async () => {
  for (const [changes, expected] of [
    [{ revisionId: SHA_C }, "stale_revision"],
    [{ artifactManifestSha256: SHA_C }, "stale_revision"],
    [{ expectedWorkflowVersion: 8 }, "version_conflict"]
  ]) {
    const harness = createHarness();
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    harness.setCurrent(changes);
    assert.deepEqual(
      await harness.port.confirmReview(confirmInput(snapshot)),
      { outcome: expected }
    );
    assert.equal(harness.ledger.size, 0);
  }
});

test("rechecks expiry after an asynchronous record factory resolves", async () => {
  let releaseFactory;
  let markFactoryStarted;
  const factoryStarted = new Promise((resolve) => {
    markFactoryStarted = resolve;
  });
  const factoryGate = new Promise((resolve) => {
    releaseFactory = resolve;
  });
  const harness = createHarness({
    async recordFactory(input) {
      markFactoryStarted();
      await factoryGate;
      return createSandboxVerificationRecord(input);
    }
  });
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");

  const pending = harness.port.confirmReview(confirmInput(snapshot));
  await factoryStarted;
  harness.setNow(snapshot.expiresAt);
  releaseFactory();

  assert.deepEqual(await pending, { outcome: "expired" });
  assert.equal(harness.ledger.size, 0);
});

test("rechecks every bound fixture category after an asynchronous record factory", async () => {
  const cases = [
    [{ revisionId: SHA_C }, "stale_revision"],
    [{ artifactManifestSha256: SHA_C }, "stale_revision"],
    [{ expectedWorkflowVersion: 8 }, "version_conflict"],
    [{ providerContext: "Other Studio · A1 sandbox fixture" }, "not_available"],
    [{ reviewArtifacts: [SAFE_ALTERNATE_ARTIFACT] }, "stale_revision"]
  ];

  for (const [changes, expected] of cases) {
    let releaseFactory;
    let markFactoryStarted;
    const factoryStarted = new Promise((resolve) => {
      markFactoryStarted = resolve;
    });
    const factoryGate = new Promise((resolve) => {
      releaseFactory = resolve;
    });
    const harness = createHarness({
      async recordFactory(input) {
        markFactoryStarted();
        await factoryGate;
        return createSandboxVerificationRecord(input);
      }
    });
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    harness.setNow("2026-08-02T03:01:00.000Z");

    const pending = harness.port.confirmReview(confirmInput(snapshot));
    await factoryStarted;
    harness.setCurrent(changes);
    releaseFactory();

    assert.deepEqual(await pending, { outcome: expected });
    assert.equal(harness.ledger.size, 0);
  }
});

test("enforces the exact confirm shape and records only the stored snapshot", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.openedFixture.providerContext = "Other Studio · A1 sandbox fixture";
  harness.openedFixture.scopeContext = "Guest bedroom review scope";
  harness.openedFixture.revisionLabel = "D-08";
  harness.setNow("2026-08-02T03:01:00.000Z");

  assert.deepEqual(
    await harness.port.confirmReview({
      ...confirmInput(snapshot),
      project: "editable-project",
      tenantId: "caller-tenant",
      recordId: "record_demo_999"
    }),
    { outcome: "invalid_request" }
  );
  const result = await harness.port.confirmReview(confirmInput(snapshot));

  assert.equal(result.outcome, "sandbox_recorded");
  assert.equal(result.record.providerContext, "Daph Studio · A1 sandbox fixture");
  assert.equal(result.record.scopeContext, "Main kitchen review scope");
  assert.equal(result.record.revisionLabel, "D-07");
  assert.equal(result.record.revisionId, SHA_A);
  assert.equal(result.record.outcome, "sandbox_recorded");
  assert.equal(harness.ledger.size, 1);
});

test("rejects a stateful idempotency getter without executing it", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  const input = confirmInput(snapshot);
  let getterCalls = 0;
  Object.defineProperty(input, "serverIssuedIdempotencyKey", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return getterCalls === 1
        ? "idempotency_demo_001"
        : "idempotency_demo_999";
    }
  });

  const result = await harness.port.confirmReview(input);
  assert.deepEqual(result, { outcome: "invalid_request" });
  assert.equal(JSON.stringify(result), '{"outcome":"invalid_request"}');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(getterCalls, 0);
  assert.equal(harness.ledger.size, 0);
});

test("uses one frozen input capture across asynchronous confirmation", async () => {
  let releaseFactory;
  let markFactoryStarted;
  const factoryStarted = new Promise((resolve) => {
    markFactoryStarted = resolve;
  });
  const factoryGate = new Promise((resolve) => {
    releaseFactory = resolve;
  });
  const harness = createHarness({
    async recordFactory(input) {
      markFactoryStarted();
      await factoryGate;
      return createSandboxVerificationRecord(input);
    }
  });
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  const input = confirmInput(snapshot);

  const pending = harness.port.confirmReview(input);
  await factoryStarted;
  input.serverIssuedIdempotencyKey = "idempotency_demo_999";
  releaseFactory();

  const result = await pending;
  assert.equal(result.outcome, "sandbox_recorded");
  assert.equal(
    Map.prototype.has.call(harness.ledger, "idempotency_demo_001"),
    true
  );
  assert.equal(
    Map.prototype.has.call(harness.ledger, "idempotency_demo_999"),
    false
  );
  assert.equal(harness.ledger.size, 1);
});

test("rejects unsafe confirm descriptors and prototypes before use", async () => {
  const builders = [
    ["unsafe prototype", (valid) => Object.assign(Object.create({}), valid)],
    ["hidden extra", (valid) => {
      Object.defineProperty(valid, "tenantId", {
        value: "tenant-internal-001",
        enumerable: false
      });
      return valid;
    }],
    ["symbol extra", (valid) => {
      valid[Symbol("token")] = REVIEW_TOKEN;
      return valid;
    }],
    ["enumerable extra", (valid) => ({
      ...valid,
      customerIdentity: "customer-internal-001"
    })]
  ];

  for (const [label, build] of builders) {
    const harness = createHarness();
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    const result = await harness.port.confirmReview(build(confirmInput(snapshot)));
    assert.deepEqual(result, { outcome: "invalid_request" }, label);
    assert.equal(Object.isFrozen(result), true, label);
    assert.equal(harness.ledger.size, 0, label);
  }
});

test("collapses hostile confirm proxy traps into invalid_request", async () => {
  const traps = [
    ["prototype", { getPrototypeOf() {
      throw new Error("prototype fixture-secret-value");
    } }],
    ["own keys", { ownKeys() {
      throw new Error("keys fixture-secret-value");
    } }],
    ["descriptor", { getOwnPropertyDescriptor() {
      throw new Error("descriptor fixture-secret-value");
    } }]
  ];

  for (const [label, handler] of traps) {
    const harness = createHarness();
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    let result;
    try {
      result = await harness.port.confirmReview(
        new Proxy(confirmInput(snapshot), handler)
      );
    } catch (error) {
      result = { outcome: `escaped:${error.message}` };
    }
    assert.deepEqual(result, { outcome: "invalid_request" }, label);
    assert.equal(Object.isFrozen(result), true, label);
    assert.equal(harness.ledger.size, 0, label);
  }
});

test("rejects a confirm proxy without invoking its value get trap", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  let getCalls = 0;
  const input = new Proxy(confirmInput(snapshot), {
    get() {
      getCalls += 1;
      throw new Error("get fixture-secret-value");
    }
  });
  let result;
  try {
    result = await harness.port.confirmReview(input);
  } catch (error) {
    result = { outcome: `escaped:${error.message}` };
  }

  assert.deepEqual(result, { outcome: "invalid_request" });
  assert.equal(getCalls, 0);
  assert.equal(harness.ledger.size, 0);
});

test("rejects malformed or forged record-factory candidates before commit", async () => {
  const trustedInput = {
    recordId: "record_demo_001",
    correlationId: "correlation_demo_001",
    reviewSessionId: "review_session_demo_001",
    providerContext: "Daph Studio · A1 sandbox fixture",
    scopeContext: "Main kitchen review scope",
    workItemRef: "work_item_demo_001",
    approvalRequestRef: "approval_request_demo_001",
    revisionLabel: "D-07",
    revisionId: SHA_A,
    artifactManifestSha256: SHA_B,
    canonicalizationVersion: "line-design-approval-v1",
    requestedCanonicalAction: "design.approve_revision",
    outcome: "sandbox_recorded",
    createdAt: "2026-08-02T03:00:00.000Z",
    confirmedAt: "2026-08-02T03:01:00.000Z"
  };
  const trusted = await createSandboxVerificationRecord(trustedInput);

  for (const [label, candidate] of malformedRecordsFrom(trusted)) {
    const harness = createHarness({
      async recordFactory() {
        return candidate;
      }
    });
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    harness.setNow("2026-08-02T03:01:00.000Z");
    const result = await harness.port.confirmReview(confirmInput(snapshot));

    assert.deepEqual(result, { outcome: "temporarily_unavailable" }, label);
    assert.equal(JSON.stringify(result), '{"outcome":"temporarily_unavailable"}', label);
    assert.equal(Object.isFrozen(result), true, label);
    assert.equal(harness.ledger.size, 0, label);
  }
});

test("validates a recorded ledger entry again before replay", async () => {
  for (const label of malformedRecordsFrom(Object.freeze({})).map(([name]) => name)) {
    const harness = createHarness();
    const snapshot = await harness.port.openReview(REVIEW_TOKEN);
    harness.setNow("2026-08-02T03:01:00.000Z");
    const input = confirmInput(snapshot);
    const first = await harness.port.confirmReview(input);
    const entry = harness.ledger.get(snapshot.serverIssuedIdempotencyKey);
    const candidate = malformedRecordsFrom(first.record)
      .find(([name]) => name === label)[1];
    harness.ledger.set(snapshot.serverIssuedIdempotencyKey, Object.freeze({
      ...entry,
      record: candidate
    }));

    const replay = await harness.port.confirmReview(input);
    assert.deepEqual(replay, { outcome: "temporarily_unavailable" }, label);
    assert.equal(JSON.stringify(replay), '{"outcome":"temporarily_unavailable"}', label);
    assert.equal(Object.isFrozen(replay), true, label);
  }
});

test("requires an injected session ledger to be fresh and empty", () => {
  const preloaded = new Map([["idempotency_demo_001", Object.freeze({})]]);
  assert.throws(
    () => createHarness({ ledger: preloaded }),
    new Error("invalid_sandbox_design_approval_dependencies")
  );
});

test("rejects Map subclasses and proxies without exposing their raw errors", () => {
  class LeakyLedger extends Map {
    get() {
      throw new Error("subclass fixture-secret-value");
    }
  }
  const proxy = new Proxy(new Map(), {
    get(_target, property) {
      if (property === "size") throw new Error("proxy fixture-secret-value");
      return undefined;
    }
  });

  for (const ledger of [new LeakyLedger(), proxy]) {
    assert.throws(
      () => createHarness({ ledger }),
      new Error("invalid_sandbox_design_approval_dependencies")
    );
  }
});

test("uses captured base Map operations when ledger instance methods are poisoned", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  for (const method of ["get", "set", "has", "delete"]) {
    Object.defineProperty(harness.ledger, method, {
      value() {
        throw new Error(`${method} fixture-secret-value`);
      },
      configurable: true
    });
  }

  const result = await harness.port.confirmReview(confirmInput(snapshot));
  assert.equal(result.outcome, "sandbox_recorded");
  const ledgerSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")
    .get.call(harness.ledger);
  assert.equal(ledgerSize, 1);
});

test("replays the exact same record for the same key and canonical payload", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  const input = confirmInput(snapshot);

  const first = await harness.port.confirmReview(input);
  const replay = await harness.port.confirmReview({
    decision: input.decision,
    expectedRevisionId: input.expectedRevisionId,
    serverIssuedIdempotencyKey: input.serverIssuedIdempotencyKey,
    reviewSessionId: input.reviewSessionId
  });

  assert.equal(first.outcome, "sandbox_recorded");
  assert.equal(replay.outcome, "sandbox_replayed");
  assert.equal(replay.record, first.record);
  assert.equal(replay.record.recordDigest, first.record.recordDigest);
  assert.equal(replay.record.outcome, "sandbox_recorded");
  assert.equal(harness.ledger.size, 1);
});

test("rejects reuse of a recorded key with a different canonical payload", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  await harness.port.confirmReview(confirmInput(snapshot));

  assert.deepEqual(
    await harness.port.confirmReview(confirmInput(snapshot, { expectedRevisionId: SHA_C })),
    { outcome: "idempotency_conflict" }
  );
  assert.equal(harness.ledger.size, 1);
});

test("single-flights concurrent identical confirms into one ledger record", async () => {
  let recordFactoryCalls = 0;
  const harness = createHarness({
    async recordFactory(input) {
      recordFactoryCalls += 1;
      await Promise.resolve();
      return createSandboxVerificationRecord(input);
    }
  });
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");

  const results = await Promise.all(Array.from(
    { length: 12 },
    () => harness.port.confirmReview(confirmInput(snapshot))
  ));

  assert.equal(recordFactoryCalls, 1);
  assert.equal(harness.ledger.size, 1);
  assert.equal(results[0].outcome, "sandbox_recorded");
  assert.equal(results.slice(1).every((result) => result.outcome === "sandbox_replayed"), true);
  assert.equal(results.every((result) => result.record === results[0].record), true);
  assert.equal(new Set(results.map((result) => result.record.recordDigest)).size, 1);
});

test("allows same-key retry after a pre-commit record-factory failure", async () => {
  let attempts = 0;
  const harness = createHarness({
    async recordFactory(input) {
      attempts += 1;
      if (attempts === 1) throw new Error("database role secret raw failure");
      return createSandboxVerificationRecord(input);
    }
  });
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  const input = confirmInput(snapshot);

  const failed = await harness.port.confirmReview(input);
  assert.deepEqual(failed, { outcome: "temporarily_unavailable" });
  assert.equal(JSON.stringify(failed).includes("database role secret"), false);
  assert.equal(harness.ledger.size, 0);

  const retried = await harness.port.confirmReview(input);
  assert.equal(retried.outcome, "sandbox_recorded");
  assert.equal(attempts, 2);
  assert.equal(harness.ledger.size, 1);
});

test("starts each default adapter with an empty session-only ledger", async () => {
  const firstLedger = new Map();
  const first = createHarness({ ledger: firstLedger });
  const snapshot = await first.port.openReview(REVIEW_TOKEN);
  first.setNow("2026-08-02T03:01:00.000Z");
  await first.port.confirmReview(confirmInput(snapshot));
  assert.equal(firstLedger.size, 1);

  const freshLedger = new Map();
  const fresh = createHarness({ ledger: freshLedger });
  assert.equal(freshLedger.size, 0);
  const freshSnapshot = await fresh.port.openReview(REVIEW_TOKEN);
  fresh.setNow("2026-08-02T03:01:00.000Z");
  const freshResult = await fresh.port.confirmReview(confirmInput(freshSnapshot));
  assert.equal(freshResult.outcome, "sandbox_recorded");
  assert.equal(freshLedger.size, 1);
});

test("uses no browser persistence, network, logging, or draft authority surface", async () => {
  const source = await readFile(
    new URL("../line-design-approval-sandbox.mjs", import.meta.url),
    "utf8"
  );
  for (const forbidden of [
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /console\./,
    /document\./,
    /editableDraft/
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("never leaks tokens, fixture identity, authority values, secrets, or raw errors", async () => {
  const harness = createHarness();
  const snapshot = await harness.port.openReview(REVIEW_TOKEN);
  harness.setNow("2026-08-02T03:01:00.000Z");
  const result = await harness.port.confirmReview(confirmInput(snapshot));
  const serialized = JSON.stringify({ snapshot, result });

  for (const forbidden of [
    REVIEW_TOKEN,
    "customer-internal-001",
    "tenant-internal-001",
    "internal-reviewer",
    "fixture-secret-value"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(Object.hasOwn(result.record, "token"), false);
  assert.equal(Object.hasOwn(result.record, "tenantId"), false);
  assert.equal(Object.hasOwn(result.record, "role"), false);
  assert.equal(Object.hasOwn(result.record, "secret"), false);
});

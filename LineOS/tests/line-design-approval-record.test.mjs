import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalize } from "../line-flex-model.mjs";
import {
  createSandboxVerificationRecord,
  sandboxVerificationRecordRowsFor
} from "../line-design-approval-record.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const recordInput = () => ({
  recordId: "record_demo_001",
  correlationId: "correlation_demo_001",
  reviewSessionId: "review_session_demo_001",
  providerContext: "Daph Studio · A1 sandbox fixture",
  scopeContext: "Main kitchen review scope",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "request_demo_001",
  revisionLabel: "D-07",
  revisionId: SHA_A,
  artifactManifestSha256: SHA_B,
  canonicalizationVersion: "line-design-approval-v1",
  requestedCanonicalAction: "design.approve_revision",
  outcome: "sandbox_recorded",
  createdAt: "2026-08-02T03:00:00.000Z",
  confirmedAt: "2026-08-02T03:01:00.000Z"
});

const digestPayload = (input = recordInput()) => ({
  title: "Sandbox Verification Record — Demo · No Business Effect",
  recordVersion: 1,
  mode: "sandbox",
  businessEffect: "none",
  recordId: input.recordId,
  correlationId: input.correlationId,
  reviewSessionId: input.reviewSessionId,
  providerContext: input.providerContext,
  scopeContext: input.scopeContext,
  workItemRef: input.workItemRef,
  approvalRequestRef: input.approvalRequestRef,
  revisionLabel: input.revisionLabel,
  revisionId: input.revisionId,
  artifactManifestSha256: input.artifactManifestSha256,
  requestedCanonicalAction: input.requestedCanonicalAction,
  outcome: input.outcome,
  createdAt: input.createdAt,
  confirmedAt: input.confirmedAt,
  digestAlgorithm: "SHA-256",
  canonicalizationVersion: input.canonicalizationVersion
});

test("creates the exact deterministic Sandbox Verification Record", async () => {
  const first = await createSandboxVerificationRecord(recordInput());
  const second = await createSandboxVerificationRecord(recordInput());
  const expectedPayload = digestPayload();

  assert.deepEqual(Object.keys(first), [...Object.keys(expectedPayload), "recordDigest"]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(first).filter(([key]) => key !== "recordDigest")),
    expectedPayload
  );
  assert.equal(first.recordDigest, second.recordDigest);
  assert.equal(
    first.recordDigest,
    createHash("sha256").update(canonicalize(expectedPayload)).digest("hex")
  );
  assert.match(first.recordDigest, /^[0-9a-f]{64}$/);
});

test("accepts the legitimate approval request reference prefix without authority semantics", async () => {
  const record = await createSandboxVerificationRecord({
    ...recordInput(),
    approvalRequestRef: "approval_request_demo_001"
  });
  assert.equal(record.approvalRequestRef, "approval_request_demo_001");
});

test("changes the digest when every caller-bound field changes", async () => {
  const baseline = await createSandboxVerificationRecord(recordInput());
  const changes = {
    recordId: "record_demo_002",
    correlationId: "correlation_demo_002",
    reviewSessionId: "review_session_demo_002",
    providerContext: "Other Studio · A1 sandbox fixture",
    scopeContext: "Guest bedroom review scope",
    workItemRef: "work_item_demo_002",
    approvalRequestRef: "request_demo_002",
    revisionLabel: "D-08",
    revisionId: "c".repeat(64),
    artifactManifestSha256: "d".repeat(64),
    requestedCanonicalAction: "design.request_revision_changes",
    outcome: "sandbox_replayed",
    createdAt: "2026-08-02T03:00:30.000Z",
    confirmedAt: "2026-08-02T03:01:30.000Z"
  };

  for (const [field, value] of Object.entries(changes)) {
    const changed = await createSandboxVerificationRecord({
      ...recordInput(),
      [field]: value
    });
    assert.notEqual(changed.recordDigest, baseline.recordDigest, field);
  }
});

test("ignores recursive object key insertion order when hashing", async () => {
  const input = recordInput();
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  const first = await createSandboxVerificationRecord(input);
  const second = await createSandboxVerificationRecord(reversed);

  assert.equal(first.recordDigest, second.recordDigest);
});

test("deeply freezes records and bilingual visible rows", async () => {
  const record = await createSandboxVerificationRecord(recordInput());
  const rows = sandboxVerificationRecordRowsFor(record, "en");

  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(rows.every((row) => Object.isFrozen(row)), true);
  assert.throws(() => {
    record.providerContext = "Changed";
  }, TypeError);
  assert.throws(() => {
    rows[0][1] = "Changed";
  }, TypeError);
});

test("rejects missing, enumerable extra, hidden, symbol, and accessor input fields", async () => {
  const missing = recordInput();
  delete missing.scopeContext;
  await assert.rejects(
    () => createSandboxVerificationRecord(missing),
    new Error("invalid_sandbox_verification_record_input")
  );
  await assert.rejects(
    () => createSandboxVerificationRecord({ ...recordInput(), tenantId: "tenant_demo" }),
    new Error("invalid_sandbox_verification_record_input")
  );

  const hidden = recordInput();
  Object.defineProperty(hidden, "token", { value: "secret", enumerable: false });
  await assert.rejects(
    () => createSandboxVerificationRecord(hidden),
    new Error("invalid_sandbox_verification_record_input")
  );

  const symbol = recordInput();
  symbol[Symbol("keyId")] = "signing-key";
  await assert.rejects(
    () => createSandboxVerificationRecord(symbol),
    new Error("invalid_sandbox_verification_record_input")
  );

  const accessor = recordInput();
  Object.defineProperty(accessor, "providerContext", {
    enumerable: true,
    get() {
      throw new Error("unsafe_getter_executed");
    }
  });
  await assert.rejects(
    () => createSandboxVerificationRecord(accessor),
    new Error("invalid_sandbox_verification_record_input")
  );
});

test("rejects unsafe prototypes and non-scalar bound values", async () => {
  const inherited = Object.assign(Object.create({ tenantId: "tenant_demo" }), recordInput());
  await assert.rejects(
    () => createSandboxVerificationRecord(inherited),
    new Error("invalid_sandbox_verification_record_input")
  );

  for (const [field, value] of [
    ["providerContext", { displayName: "Daph Studio" }],
    ["scopeContext", ["main-kitchen"]],
    ["recordId", 7],
    ["revisionLabel", "D-07\u0000hidden"],
    ["requestedCanonicalAction", { action: "design.approve_revision" }],
    ["outcome", ["sandbox_recorded"]]
  ]) {
    await assert.rejects(
      () => createSandboxVerificationRecord({ ...recordInput(), [field]: value }),
      new Error("invalid_sandbox_verification_record_input"),
      field
    );
  }
});

test("rejects malformed, uppercase, and unbounded identifiers or digests", async () => {
  for (const [field, value] of [
    ["recordId", "record id with spaces"],
    ["correlationId", "x".repeat(129)],
    ["reviewSessionId", ""],
    ["workItemRef", "../work"],
    ["approvalRequestRef", "request/ref"],
    ["revisionId", "a".repeat(63)],
    ["revisionId", "A".repeat(64)],
    ["artifactManifestSha256", "g".repeat(64)],
    ["canonicalizationVersion", "other-canonicalizer"],
    ["requestedCanonicalAction", "approved"],
    ["outcome", "approved"]
  ]) {
    await assert.rejects(
      () => createSandboxVerificationRecord({ ...recordInput(), [field]: value }),
      new Error("invalid_sandbox_verification_record_input"),
      `${field}: ${value}`
    );
  }
});

test("rejects authority-like claims in record-visible input", async () => {
  for (const [field, value] of [
    ["recordId", "approved"],
    ["correlationId", "tenant_assertion"],
    ["reviewSessionId", "token"],
    ["providerContext", "Daph Studio · verified tenant"],
    ["scopeContext", "Production audit complete"],
    ["workItemRef", "signed"],
    ["approvalRequestRef", "audit_complete"],
    ["revisionLabel", "SIGNED"],
    ["requestedCanonicalAction", "design.audit_complete"]
  ]) {
    await assert.rejects(
      () => createSandboxVerificationRecord({ ...recordInput(), [field]: value }),
      new Error("invalid_sandbox_verification_record_input"),
      field
    );
  }
});

for (const [description, unsafeValue] of [
  ["a Thai authority claim", "อนุมัติแล้ว"],
  ["the literal secret", "secret"],
  ["a tenant-prefixed value", "tenant123"],
  ["an email address", "reviewer@example.com"],
  ["a phone number", "0812345678"]
]) {
  test(`rejects ${description} from every visible caller-bound field`, async () => {
    for (const field of Object.keys(recordInput())) {
      await assert.rejects(
        () => createSandboxVerificationRecord({
          ...recordInput(),
          [field]: unsafeValue
        }),
        new Error("invalid_sandbox_verification_record_input"),
        field
      );
    }
  });
}

test("requires canonical ordered UTC timestamps", async () => {
  for (const [field, value] of [
    ["createdAt", "2026-08-02T03:00:00Z"],
    ["createdAt", "2026-02-30T03:00:00.000Z"],
    ["confirmedAt", "2026-08-02T10:01:00.000+07:00"],
    ["confirmedAt", "not-a-date"]
  ]) {
    await assert.rejects(
      () => createSandboxVerificationRecord({ ...recordInput(), [field]: value }),
      new Error("invalid_sandbox_verification_record_input"),
      field
    );
  }
  await assert.rejects(
    () => createSandboxVerificationRecord({
      ...recordInput(),
      confirmedAt: "2026-08-02T02:59:59.999Z"
    }),
    new Error("invalid_sandbox_verification_record_input")
  );
});

test("exposes only scalar textContent-ready English and Thai rows", async () => {
  const record = await createSandboxVerificationRecord(recordInput());
  const en = sandboxVerificationRecordRowsFor(record, "en");
  const th = sandboxVerificationRecordRowsFor(record, "th");

  assert.deepEqual(en.slice(0, 4), [
    ["Mode", "sandbox"],
    ["Business effect", "none"],
    ["Record ID", "record_demo_001"],
    ["Correlation ID", "correlation_demo_001"]
  ]);
  assert.deepEqual(th.slice(0, 4), [
    ["โหมด", "sandbox"],
    ["ผลต่อธุรกิจ", "none"],
    ["รหัสบันทึก", "record_demo_001"],
    ["รหัสความสัมพันธ์", "correlation_demo_001"]
  ]);
  for (const rows of [en, th]) {
    assert.equal(rows.length, 18);
    assert.equal(rows.flat().every((value) => typeof value === "string"), true);
    assert.equal(
      rows.flat().every((value) =>
        [...value].every((character) => {
          const codePoint = character.codePointAt(0);
          return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f;
        })
      ),
      true
    );
  }
  assert.deepEqual(en.at(-1), ["SHA-256 record digest", record.recordDigest]);
  assert.deepEqual(th.at(-1), ["ค่าแฮช SHA-256 ของบันทึก", record.recordDigest]);
});

test("omits authority claims and rejects non-authentic records or languages", async () => {
  const record = await createSandboxVerificationRecord(recordInput());
  const allowedApprovalReference = "approvalRequestRef";
  const prohibitedKeys = Reflect.ownKeys(record).filter((key) =>
    typeof key !== "string" ||
    (/approval|signature|key|tenant|token|audit/i.test(key) && key !== allowedApprovalReference)
  );
  assert.deepEqual(prohibitedKeys, []);
  assert.equal(JSON.stringify(record).includes("approved"), false);

  for (const language of ["fr", "EN", "", null]) {
    assert.throws(
      () => sandboxVerificationRecordRowsFor(record, language),
      new Error("unsupported_language")
    );
  }
  assert.throws(
    () => sandboxVerificationRecordRowsFor({ ...record }, "en"),
    new Error("unknown_sandbox_verification_record")
  );
});

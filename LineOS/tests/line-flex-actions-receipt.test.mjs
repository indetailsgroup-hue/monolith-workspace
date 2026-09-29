import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalize, createDraft, updateDraftAtPath } from "../line-flex-model.mjs";
import { getPreset } from "../line-flex-presets.mjs";
import {
  selectActionMode, createDemoTransaction, confirmDemoTransaction
} from "../line-flex-actions.mjs";
import { buildFlexMessage } from "../line-flex-json.mjs";
import { createDemoReceipt } from "../line-flex-receipt.mjs";
import { receiptRowsFor } from "../line-flex-studio.mjs";
import { validateDraft } from "../line-flex-validator.mjs";

const approval = () => createDraft(getPreset("design-approval"), "th");
const NON_CANONICAL_PARSEABLE_TIMESTAMPS = [
  "0",
  "2026-02-30T00:00:00.000Z",
  "2026-08-01T10:00:00.000",
  "2026-08-01T17:00:00.000+07:00",
  "2026-08-01T10:00:00Z",
  "2026-08-01t10:00:00.000z"
];

test("routes every consequential action through LIFF URI", () => {
  for (const requestedActionType of ["message", "postback", "uri", "liff_uri"]) {
    assert.equal(selectActionMode({ risk: "high", requestedActionType }), "liff_uri");
  }
});

test("exports a URI for a high-risk postback request while reporting MON-ACT-001", () => {
  const unsafe = updateDraftAtPath(
    approval(), ["intent", "requestedActionType"], "postback"
  );
  const message = buildFlexMessage(unsafe);
  const action = message.contents.footer.contents[0].action;
  const findings = validateDraft(unsafe, message);

  assert.equal(action.type, "uri");
  assert.equal(
    action.uri,
    "https://example.com/monolith/demo/design-approval?reviewToken=rvw_A1_7L3n9Q2pV8xK"
  );
  assert.ok(findings.some((finding) => finding.ruleId === "MON-ACT-001"));
});

test("allows low-risk acknowledgement postback", () => {
  assert.equal(selectActionMode({ risk: "low", requestedActionType: "postback" }), "postback");
});

test("fails closed to LIFF URI for unknown or malformed risk", () => {
  for (const intent of [
    { requestedActionType: "postback" },
    { risk: "medium", requestedActionType: "postback" },
    { risk: null, requestedActionType: "postback" },
    null
  ]) {
    assert.equal(selectActionMode(intent), "liff_uri");
  }
});

test("binds tenant recipient revision action and expiry", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_001",
    now: "2026-08-01T10:00:00.000Z"
  });
  assert.equal(tx.tenantId, "tenant_daph_demo");
  assert.equal(tx.providerName, "Daph Studio");
  assert.equal(tx.recipientRef, "customer_demo_001");
  assert.equal(tx.targetRef, "project_s49_main_kitchen");
  assert.equal(tx.revision, "D-07");
  assert.equal(tx.canonicalAction, "design.approve_revision");
  assert.equal(tx.amount, "฿486,000");
  assert.equal(tx.deadline, "3 ส.ค. 2026 · 18:00");
  assert.equal(tx.actionMode, "liff_uri");
  assert.equal(tx.createdAt, "2026-08-01T10:00:00.000Z");
  assert.equal(tx.expiresAt, "2026-08-02T10:00:00.000Z");
  assert.equal(tx.boundPayload, canonicalize({
    tenantId: tx.tenantId,
    providerName: tx.providerName,
    recipientRef: tx.recipientRef,
    targetRef: tx.targetRef,
    revision: tx.revision,
    canonicalAction: tx.canonicalAction,
    amount: tx.amount,
    deadline: tx.deadline
  }));
  assert.equal(Object.isFrozen(tx), true);
});

test("fails closed when any bound value changes", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_002",
    now: "2026-08-01T10:00:00.000Z"
  });
  const changes = [
    [["context", "tenantId"], "tenant_other_demo"],
    [["context", "tenantName"], "Other Studio"],
    [["context", "recipientRef"], "customer_demo_002"],
    [["intent", "targetRef"], "project_other"],
    [["body", "revision"], "D-08"],
    [["intent", "canonicalAction"], "design.reject_revision"],
    [["body", "amount"], "฿487,000"],
    [["body", "deadline"], "4 ส.ค. 2026 · 18:00"]
  ];

  for (const [path, value] of changes) {
    const changed = updateDraftAtPath(approval(), path, value);
    assert.throws(
      () => confirmDemoTransaction(tx, changed, "2026-08-01T11:00:00.000Z"),
      new Error("bound_value_changed"),
      path.join(".")
    );
  }
});

test("rejects cloned tampered and rebound transactions", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_tamper",
    now: "2026-08-01T10:00:00.000Z"
  });
  const mutations = [
    ["tenantId", "tenant_other_demo"],
    ["providerName", "Other Studio"],
    ["recipientRef", "customer_demo_002"],
    ["targetRef", "project_other"],
    ["revision", "D-08"],
    ["canonicalAction", "design.reject_revision"],
    ["amount", "฿487,000"],
    ["deadline", "4 ส.ค. 2026 · 18:00"],
    ["actionMode", "postback"],
    ["boundPayload", "{}"]
  ];

  for (const [field, value] of mutations) {
    assert.throws(() => {
      tx[field] = value;
    }, TypeError, `frozen ${field}`);
    assert.throws(
      () => confirmDemoTransaction(
        { ...tx, [field]: value }, approval(), "2026-08-01T11:00:00.000Z"
      ),
      new Error("unknown_transaction"),
      `cloned ${field}`
    );
  }

  const reboundDraft = updateDraftAtPath(
    approval(), ["context", "tenantName"], "Other Studio"
  );
  const rebound = {
    ...tx,
    providerName: reboundDraft.context.tenantName,
    boundPayload: canonicalize({
      tenantId: reboundDraft.context.tenantId,
      providerName: reboundDraft.context.tenantName,
      recipientRef: reboundDraft.context.recipientRef,
      targetRef: reboundDraft.intent.targetRef,
      revision: reboundDraft.body.revision,
      canonicalAction: reboundDraft.intent.canonicalAction,
      amount: reboundDraft.body.amount,
      deadline: reboundDraft.body.deadline
    })
  };
  assert.throws(
    () => confirmDemoTransaction(rebound, reboundDraft, "2026-08-01T11:00:00.000Z"),
    new Error("unknown_transaction")
  );
});

test("rejects invalid creation time and transaction TTL", () => {
  for (const now of ["not-a-date", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createDemoTransaction(approval(), { id: "tx_bad_time", now }),
      new Error("invalid_created_at")
    );
  }

  for (const ttl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1440"]) {
    const invalid = updateDraftAtPath(approval(), ["intent", "expiresInMinutes"], ttl);
    assert.throws(
      () => createDemoTransaction(invalid, {
        id: "tx_bad_ttl",
        now: "2026-08-01T10:00:00.000Z"
      }),
      new Error("invalid_transaction_ttl")
    );
  }
});

test("rejects parseable noncanonical creation timestamps", () => {
  for (const now of NON_CANONICAL_PARSEABLE_TIMESTAMPS) {
    assert.equal(Number.isFinite(Date.parse(now)), true, now);
    assert.throws(
      () => createDemoTransaction(approval(), { id: "tx_noncanonical_time", now }),
      new Error("invalid_created_at"),
      now
    );
  }
});

test("accepts its internally generated canonical creation timestamp", () => {
  const tx = createDemoTransaction(approval(), { id: "tx_default_time" });
  assert.match(tx.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(tx.createdAt).toISOString(), tx.createdAt);
});

test("allows the expiry instant and rejects time after it", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_003",
    now: "2026-08-01T10:00:00.000Z"
  });
  assert.doesNotThrow(() =>
    confirmDemoTransaction(tx, approval(), "2026-08-02T10:00:00.000Z"));
  assert.throws(
    () => confirmDemoTransaction(tx, approval(), "2026-08-02T10:00:00.001Z"),
    new Error("transaction_expired")
  );
});

test("rejects invalid confirmation time and transaction expiry", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_time_validation",
    now: "2026-08-01T10:00:00.000Z"
  });
  for (const now of ["not-a-date", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => confirmDemoTransaction(tx, approval(), now),
      new Error("invalid_confirmation_time")
    );
  }
  for (const expiresAt of ["not-a-date", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => confirmDemoTransaction({ ...tx, expiresAt }, approval(), "2026-08-01T11:00:00.000Z"),
      new Error("invalid_transaction_expiry")
    );
  }
});

test("rejects parseable noncanonical confirmation and expiry timestamps", () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_noncanonical_time",
    now: "2026-08-01T10:00:00.000Z"
  });
  for (const timestamp of NON_CANONICAL_PARSEABLE_TIMESTAMPS) {
    assert.equal(Number.isFinite(Date.parse(timestamp)), true, timestamp);
    assert.throws(
      () => confirmDemoTransaction(tx, approval(), timestamp),
      new Error("invalid_confirmation_time"),
      `confirmation ${timestamp}`
    );
    assert.throws(
      () => confirmDemoTransaction(
        { ...tx, expiresAt: timestamp }, approval(), "2026-08-01T11:00:00.000Z"
      ),
      new Error("invalid_transaction_expiry"),
      `expiry ${timestamp}`
    );
  }
});

test("rejects a receipt made from a different transaction confirmation pair", async () => {
  const firstTx = createDemoTransaction(approval(), {
    id: "tx_demo_pair_001",
    now: "2026-08-01T10:00:00.000Z"
  });
  const secondTx = createDemoTransaction(approval(), {
    id: "tx_demo_pair_002",
    now: "2026-08-01T10:00:00.000Z"
  });
  const firstConfirmation = confirmDemoTransaction(
    firstTx, approval(), "2026-08-01T11:00:00.000Z"
  );
  const secondConfirmation = confirmDemoTransaction(
    secondTx, approval(), "2026-08-01T11:00:00.000Z"
  );

  await assert.rejects(
    () => createDemoReceipt(firstTx, secondConfirmation),
    new Error("transaction_confirmation_mismatch")
  );
  await assert.rejects(
    () => createDemoReceipt(firstTx, { ...firstConfirmation }),
    new Error("unknown_confirmation")
  );
});

test("creates a labelled deterministic SHA-256 digest that changes on bound input", async () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_004",
    now: "2026-08-01T10:00:00.000Z"
  });
  const confirmed = confirmDemoTransaction(tx, approval(), "2026-08-01T11:00:00.000Z");
  const first = await createDemoReceipt(tx, confirmed);
  const second = await createDemoReceipt(tx, confirmed);
  const digestPayload = {
    receiptVersion: 1,
    transactionId: tx.id,
    tenantId: confirmed.tenantId,
    providerName: confirmed.providerName,
    recipientRef: confirmed.recipientRef,
    targetRef: confirmed.targetRef,
    revision: confirmed.revision,
    canonicalAction: confirmed.canonicalAction,
    amount: confirmed.amount,
    deadline: confirmed.deadline,
    createdAt: tx.createdAt,
    confirmedAt: confirmed.confirmedAt,
    outcome: confirmed.outcome
  };

  assert.equal(first.digest, second.digest);
  assert.equal(first.digest, createHash("sha256").update(canonicalize(digestPayload)).digest("hex"));
  assert.match(first.digest, /^[0-9a-f]{64}$/);
  assert.equal(first.title, "Verification Receipt — Demo");
  assert.equal(first.label, "DEMO — NOT A PRODUCTION SIGNATURE");
  assert.equal(
    first.productionNotice,
    "Production signing and audit require the MONOLITH Trust Kernel."
  );
  assert.equal(Object.hasOwn(first, "signature"), false);
  assert.equal(first.amount, "฿486,000");
  assert.equal(first.deadline, "3 ส.ค. 2026 · 18:00");
  assert.equal(first.providerName, "Daph Studio");
  assert.equal(Object.isFrozen(confirmed), true);
});

test("freezes authentic receipt evidence before rendering", async () => {
  const tx = createDemoTransaction(approval(), {
    id: "tx_demo_frozen_receipt",
    now: "2026-08-01T10:00:00.000Z"
  });
  const confirmed = confirmDemoTransaction(tx, approval(), "2026-08-01T11:00:00.000Z");
  const receipt = await createDemoReceipt(tx, confirmed);
  const originalProviderName = receipt.providerName;
  const originalDigest = receipt.digest;

  assert.equal(Object.isFrozen(receipt), true);
  assert.throws(() => {
    receipt.providerName = "Other Studio";
  }, TypeError);
  assert.throws(() => {
    delete receipt.providerName;
  }, TypeError);
  assert.throws(() => {
    Object.defineProperty(receipt, "providerName", { value: "Other Studio" });
  }, TypeError);
  assert.throws(() => {
    receipt.digest = "b".repeat(64);
  }, TypeError);
  assert.throws(() => {
    delete receipt.digest;
  }, TypeError);
  assert.throws(() => {
    Object.defineProperty(receipt, "digest", { value: "b".repeat(64) });
  }, TypeError);

  assert.equal(receipt.providerName, originalProviderName);
  assert.equal(receipt.digest, originalDigest);
  assert.deepEqual(
    receiptRowsFor(receipt, "en").filter(([label]) =>
      label === "Provider" || label === "SHA-256 digest"),
    [["Provider", originalProviderName], ["SHA-256 digest", originalDigest]]
  );
  assert.deepEqual(
    receiptRowsFor(receipt, "th").filter(([label]) =>
      label === "ผู้ให้บริการ" || label === "SHA-256 digest"),
    [["ผู้ให้บริการ", originalProviderName], ["SHA-256 digest", originalDigest]]
  );
});

test("changes the digest when provider amount or deadline changes", async () => {
  const baselineDraft = approval();
  const baselineTx = createDemoTransaction(baselineDraft, {
    id: "tx_demo_digest_bound",
    now: "2026-08-01T10:00:00.000Z"
  });
  const baselineConfirmation = confirmDemoTransaction(
    baselineTx, baselineDraft, "2026-08-01T11:00:00.000Z"
  );
  const baselineReceipt = await createDemoReceipt(baselineTx, baselineConfirmation);

  for (const [path, value] of [
    [["context", "tenantName"], "Other Studio"],
    [["body", "amount"], "฿487,000"],
    [["body", "deadline"], "4 ส.ค. 2026 · 18:00"]
  ]) {
    const changedDraft = updateDraftAtPath(approval(), path, value);
    const changedTx = createDemoTransaction(changedDraft, {
      id: "tx_demo_digest_bound",
      now: "2026-08-01T10:00:00.000Z"
    });
    const changedConfirmation = confirmDemoTransaction(
      changedTx, changedDraft, "2026-08-01T11:00:00.000Z"
    );
    const changedReceipt = await createDemoReceipt(changedTx, changedConfirmation);
    assert.notEqual(baselineReceipt.digest, changedReceipt.digest, path.join("."));
  }
});

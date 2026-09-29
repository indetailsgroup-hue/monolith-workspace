import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESET_IDS } from "../line-flex-presets.mjs";
import { createSandboxVerificationRecord } from "../line-design-approval-record.mjs";
import {
  createStudioTestDocument, deferred
} from "./helpers/studio-fake-dom.mjs";
import {
  createInitialStudioState, reduceStudioState, deriveStudioView, isStudioDraftDirty,
  receiptRowsFor, selectStudioJourney, createDesignApprovalJourneyController,
  designApprovalReviewRowsFor, designApprovalErrorCopyFor,
  designApprovalReceiptCopyFor, shouldClearDesignApprovalReview,
  setConfirmationBusy, bindStudio
} from "../line-flex-studio.mjs";

const studioSource = readFileSync(
  fileURLToPath(new URL("../line-flex-studio.mjs", import.meta.url)),
  "utf8"
);

const reviewSnapshot = () => ({
  reviewSessionId: "review_session_demo_001",
  serverIssuedIdempotencyKey: "idempotency_demo_001",
  mode: "sandbox",
  businessEffect: "none",
  providerContext: "Daph Studio · A1 sandbox fixture",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "approval_request_demo_001",
  revisionLabel: "D-07",
  revisionId: "a".repeat(64),
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
  issuedAt: "2026-08-01T10:00:00.000Z",
  expiresAt: "2026-08-01T10:15:00.000Z"
});

const sandboxRecord = () => createSandboxVerificationRecord({
  recordId: "record_demo_001",
  correlationId: "correlation_demo_001",
  reviewSessionId: "review_session_demo_001",
  providerContext: "Daph Studio · A1 sandbox fixture",
  scopeContext: "Main kitchen review scope",
  workItemRef: "work_item_demo_001",
  approvalRequestRef: "approval_request_demo_001",
  revisionLabel: "D-07",
  revisionId: "a".repeat(64),
  artifactManifestSha256: "b".repeat(64),
  canonicalizationVersion: "line-design-approval-v1",
  requestedCanonicalAction: "design.approve_revision",
  outcome: "sandbox_recorded",
  createdAt: "2026-08-01T10:00:00.000Z",
  confirmedAt: "2026-08-01T10:05:00.000Z"
});

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

test("dirty state follows draft values instead of edit events", () => {
  let state = createInitialStudioState();
  assert.equal(isStudioDraftDirty(state), false);

  state = reduceStudioState(state, {
    type: "field.changed", path: ["body", "revision"], value: "D-08"
  });
  assert.equal(isStudioDraftDirty(state), true);

  state = reduceStudioState(state, {
    type: "field.changed", path: ["body", "revision"], value: "D-07"
  });
  assert.equal(isStudioDraftDirty(state), false);

  state = reduceStudioState(state, { type: "language.changed", language: "en" });
  assert.equal(isStudioDraftDirty(state), false);
  state = reduceStudioState(state, { type: "preset.changed", presetId: "quote-order" });
  assert.equal(isStudioDraftDirty(state), false);
});

test("receipt rows expose the exact English and Thai visible evidence contract", () => {
  const receipt = {
    transactionId: "tx_demo_visible",
    tenantId: "tenant_daph_demo",
    providerName: "Daph Studio",
    recipientRef: "customer_demo_001",
    targetRef: "project_s49_main_kitchen",
    revision: "D-07",
    canonicalAction: "design.approve_revision",
    outcome: "confirmed_demo",
    createdAt: "2026-08-01T10:00:00.000Z",
    confirmedAt: "2026-08-01T11:00:00.000Z",
    digest: "a".repeat(64)
  };

  assert.deepEqual(receiptRowsFor(receipt, "en"), [
    ["Transaction / correlation ID", "tx_demo_visible"],
    ["Tenant ID", "tenant_daph_demo"],
    ["Provider", "Daph Studio"],
    ["Recipient", "customer_demo_001"],
    ["Project / resource", "project_s49_main_kitchen"],
    ["Revision", "D-07"],
    ["Action", "design.approve_revision"],
    ["Outcome", "confirmed_demo"],
    ["Created", "2026-08-01T10:00:00.000Z"],
    ["Confirmed", "2026-08-01T11:00:00.000Z"],
    ["SHA-256 digest", "a".repeat(64)]
  ]);
  assert.deepEqual(receiptRowsFor(receipt, "th"), [
    ["รายการ / Correlation ID", "tx_demo_visible"],
    ["รหัส Tenant", "tenant_daph_demo"],
    ["ผู้ให้บริการ", "Daph Studio"],
    ["ผู้รับ", "customer_demo_001"],
    ["โครงการ / ทรัพยากร", "project_s49_main_kitchen"],
    ["รุ่นแบบ", "D-07"],
    ["การดำเนินการ", "design.approve_revision"],
    ["ผลลัพธ์", "confirmed_demo"],
    ["สร้างเมื่อ", "2026-08-01T10:00:00.000Z"],
    ["ยืนยันเมื่อ", "2026-08-01T11:00:00.000Z"],
    ["SHA-256 digest", "a".repeat(64)]
  ]);
});

test("routes only Design Approval to the port and fails closed for unknown presets", () => {
  assert.equal(selectStudioJourney("design-approval"), "design-approval-port");
  for (const presetId of PRESET_IDS.filter((id) => id !== "design-approval")) {
    assert.equal(selectStudioJourney(presetId), "legacy-demo");
  }
  assert.throws(
    () => selectStudioJourney("future-approval"),
    /unknown_studio_journey/
  );
});

test("renders Design Approval review rows only from the captured adapter snapshot", async () => {
  const snapshot = reviewSnapshot();
  const mutableDraft = {
    body: { project: "DRAFT PROJECT", revision: "DRAFT-99", trustNote: "DRAFT EFFECT" },
    context: { tenantName: "DRAFT TENANT" }
  };
  const port = {
    openReview: async () => snapshot,
    confirmReview: async () => ({ outcome: "not_available" })
  };
  const journey = createDesignApprovalJourneyController(port);

  const opened = await journey.open({ reviewToken: "opaque-token", language: "en" });
  mutableDraft.body.project = "CHANGED DRAFT PROJECT";
  snapshot.providerContext = "MUTATED ADAPTER OBJECT";

  assert.equal(opened.outcome, "review_opened");
  assert.deepEqual(opened.rows, designApprovalReviewRowsFor(reviewSnapshot(), "en"));
  assert.deepEqual(opened.rows, [
    ["Provider context", "Daph Studio · A1 sandbox fixture"],
    ["Work item reference", "work_item_demo_001"],
    ["Request reference", "approval_request_demo_001"],
    ["Revision label", "D-07"],
    ["Revision ID", "a".repeat(64)],
    ["Requested action", "design.approve_revision"],
    ["Consequence", "Records a sandbox confirmation attempt only."],
    ["Issued at", "2026-08-01T10:00:00.000Z"],
    ["Expires at", "2026-08-01T10:15:00.000Z"],
    ["Review artifact 1", "Main kitchen perspective · https://example.com/monolith/demo/artifacts/main-kitchen.png"]
  ]);
  assert.equal(JSON.stringify(opened.rows).includes("DRAFT"), false);
  assert.equal(JSON.stringify(opened.rows).includes("MUTATED"), false);
});

test("confirms with only captured adapter-bound values and returns authentic record rows", async () => {
  const snapshot = reviewSnapshot();
  const record = await sandboxRecord();
  const confirmInputs = [];
  const port = {
    openReview: async () => snapshot,
    confirmReview: async (input) => {
      confirmInputs.push(input);
      return { outcome: "sandbox_recorded", record };
    }
  };
  const journey = createDesignApprovalJourneyController(port);
  await journey.open({ reviewToken: "opaque-token", language: "th" });

  snapshot.reviewSessionId = "review_session_demo_999";
  snapshot.serverIssuedIdempotencyKey = "idempotency_demo_999";
  snapshot.revisionId = "f".repeat(64);
  const result = await journey.confirm();

  assert.deepEqual(confirmInputs, [{
    reviewSessionId: "review_session_demo_001",
    serverIssuedIdempotencyKey: "idempotency_demo_001",
    expectedRevisionId: "a".repeat(64),
    decision: "confirm"
  }]);
  assert.equal(Object.isFrozen(confirmInputs[0]), true);
  assert.equal(result.outcome, "sandbox_recorded");
  assert.equal(result.title, "Sandbox Verification Record — Demo · No Business Effect");
  assert.equal(result.rows.at(-1)[0], "ค่าแฮช SHA-256 ของบันทึก");
  assert.equal(result.rows.at(-1)[1], record.recordDigest);
  assert.deepEqual(result.copy, designApprovalReceiptCopyFor("th"));
  assert.match(result.copy.workflowDisclosure, /workflow.*approval state.*ไม่เปลี่ยน/u);
  assert.match(result.copy.digestDisclosure, /ไม่ใช่ลายเซ็น/u);
  assert.equal(journey.getState().phase, "idle");
});

test("keeps one active confirmation while the adapter owns duplicate semantics", async () => {
  let resolveConfirm;
  let confirmCalls = 0;
  const record = await sandboxRecord();
  const port = {
    openReview: async () => reviewSnapshot(),
    confirmReview: async () => {
      confirmCalls += 1;
      return new Promise((resolve) => {
        resolveConfirm = resolve;
      });
    }
  };
  const journey = createDesignApprovalJourneyController(port);
  await journey.open({ reviewToken: "opaque-token", language: "en" });

  const first = journey.confirm();
  const second = journey.confirm();
  assert.equal(journey.getState().phase, "confirming");
  assert.equal(confirmCalls, 1);
  resolveConfirm({ outcome: "sandbox_recorded", record });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(confirmCalls, 1);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(journey.getState().phase, "idle");
});

test("clears active review for every studio and dialog lifecycle boundary", async () => {
  assert.equal(shouldClearDesignApprovalReview("language.changed"), true);
  assert.equal(shouldClearDesignApprovalReview("preset.changed"), true);
  assert.equal(shouldClearDesignApprovalReview("field.changed"), true);
  assert.equal(shouldClearDesignApprovalReview("draft.reset"), true);
  assert.equal(shouldClearDesignApprovalReview("block.changed"), false);

  const journey = createDesignApprovalJourneyController({
    openReview: async () => reviewSnapshot(),
    confirmReview: async () => ({ outcome: "not_available" })
  });
  for (const reason of [
    "language.changed", "preset.changed", "field.changed", "draft.reset",
    "cancel", "dialog.cancel", "dialog.close"
  ]) {
    await journey.open({ reviewToken: "opaque-token", language: "en" });
    assert.equal(journey.getState().phase, "ready");
    journey.clear(reason);
    assert.equal(journey.getState().phase, "idle");
  }
});

test("clears terminal adapter outcomes and exposes exact neutral bilingual copy", async () => {
  const expected = {
    en: {
      expired: "This sandbox session is no longer available. Open the latest LINE message and try again.",
      stale_revision: "The reviewed revision is no longer current. Open the latest LINE message and try again.",
      version_conflict: "The current workflow view changed. Open the latest LINE message and try again.",
      idempotency_conflict: "This confirmation could not be completed safely. Open the latest LINE message and try again.",
      unauthorized: "This request is unavailable. Check the latest LINE message or contact your service team.",
      not_available: "This request is unavailable. Check the latest LINE message or contact your service team.",
      invalid_request: "This confirmation could not be completed. Open the latest LINE message and try again.",
      temporarily_unavailable: "The sandbox service is temporarily unavailable. Please try again."
    },
    th: {
      expired: "เซสชัน Sandbox นี้ไม่พร้อมใช้งานแล้ว โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่",
      stale_revision: "รุ่นแบบที่ตรวจไม่ใช่รุ่นปัจจุบันแล้ว โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่",
      version_conflict: "ข้อมูล workflow ปัจจุบันเปลี่ยนแล้ว โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่",
      idempotency_conflict: "ไม่สามารถดำเนินการยืนยันนี้ได้อย่างปลอดภัย โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่",
      unauthorized: "คำขอนี้ไม่พร้อมใช้งาน โปรดตรวจข้อความ LINE ล่าสุดหรือติดต่อทีมบริการ",
      not_available: "คำขอนี้ไม่พร้อมใช้งาน โปรดตรวจข้อความ LINE ล่าสุดหรือติดต่อทีมบริการ",
      invalid_request: "ไม่สามารถดำเนินการยืนยันนี้ได้ โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่",
      temporarily_unavailable: "บริการ Sandbox ไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้ง"
    }
  };

  for (const language of ["en", "th"]) {
    for (const [outcome, message] of Object.entries(expected[language])) {
      assert.equal(designApprovalErrorCopyFor(outcome, language), message);
      assert.equal(message.includes(outcome), false);
      const journey = createDesignApprovalJourneyController({
        openReview: async () => reviewSnapshot(),
        confirmReview: async () => ({ outcome })
      });
      await journey.open({ reviewToken: "opaque-token", language });
      const result = await journey.confirm();
      assert.deepEqual(result, { outcome, message });
      assert.equal(journey.getState().phase, "idle");
    }
  }
});

test("maps thrown adapter errors to neutral temporary failure without leaking details", async () => {
  const journey = createDesignApprovalJourneyController({
    openReview: async () => reviewSnapshot(),
    confirmReview: async () => {
      throw new Error("secret customer_id=42 token=abc stack");
    }
  });
  await journey.open({ reviewToken: "opaque-token", language: "en" });
  const result = await journey.confirm();
  assert.deepEqual(result, {
    outcome: "temporarily_unavailable",
    message: "The sandbox service is temporarily unavailable. Please try again."
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(journey.getState().phase, "idle");
});

test("uses the exact approved Design Approval receipt disclosure in both languages", () => {
  for (const language of ["en", "th"]) {
    const copy = designApprovalReceiptCopyFor(language);
    assert.equal(copy.title, "Sandbox Verification Record — Demo · No Business Effect");
    assert.match(copy.workflowDisclosure, /workflow.*approval state/u);
    assert.equal(/did not change|ไม่เปลี่ยน/u.test(copy.workflowDisclosure), true);
    assert.equal(/not a (?:digital )?signature|ไม่ใช่ลายเซ็น/u.test(copy.digestDisclosure), true);
  }
});

test("uses a visible busy state as UX while the adapter remains authoritative", () => {
  const attributes = new Map();
  const button = {
    disabled: false,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  };

  setConfirmationBusy(button, true);
  assert.equal(button.disabled, true);
  assert.equal(attributes.get("aria-busy"), "true");

  setConfirmationBusy(button, false);
  assert.equal(button.disabled, false);
  assert.equal(attributes.has("aria-busy"), false);
});

test("bindStudio accepts an injected port and constructs the sandbox default only at browser binding", () => {
  assert.match(studioSource, /export function bindStudio\(doc, options = \{\}\)/u);
  assert.match(studioSource, /installJourney\(doc, controller, options\.designApprovalPort\)/u);
  assert.match(
    studioSource,
    /bindStudio\(document, \{\s*designApprovalPort: createSandboxDesignApprovalPort\(\)\s*\}\)/u
  );
  assert.doesNotMatch(
    studioSource,
    /const\s+\w*[Pp]ort\s*=\s*createSandboxDesignApprovalPort\(\)/u
  );
});

test("bindStudio drives the adapter-owned review and record surfaces end to end", async () => {
  const doc = createStudioTestDocument();
  const snapshot = reviewSnapshot();
  const record = await sandboxRecord();
  const openTokens = [];
  const confirmInputs = [];
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async (token) => {
        openTokens.push(token);
        return snapshot;
      },
      confirmReview: async (input) => {
        confirmInputs.push(input);
        return { outcome: "sandbox_recorded", record };
      }
    }
  });

  assert.equal(doc.getElementById("liff-title").textContent, "ตรวจแบบส่วนตัว · Sandbox");
  assert.equal(doc.getElementById("confirm-journey").textContent, "ยืนยันการทดลองใน Sandbox");
  await doc.getElementById("run-journey").click();

  assert.deepEqual(openTokens, ["rvw_A1_7L3n9Q2pV8xK"]);
  assert.equal(doc.getElementById("liff-dialog").open, true);
  assert.equal(doc.querySelector("[data-review-mode]").textContent, "sandbox");
  assert.equal(doc.querySelector("[data-business-effect]").textContent, "none");
  assert.equal(doc.querySelector("[data-review-expiry]").textContent, snapshot.expiresAt);
  assert.equal(
    doc.querySelector("[data-artifact-manifest-sha256]").textContent,
    snapshot.artifactManifestSha256
  );
  assert.match(doc.querySelector("[data-liff-review]").textContent, /Daph Studio · A1 sandbox fixture/u);
  assert.equal(doc.querySelector("[data-liff-review]").textContent.includes("บ้านสุขุมวิท"), false);

  await doc.getElementById("confirm-journey").click();
  assert.deepEqual(confirmInputs, [{
    reviewSessionId: snapshot.reviewSessionId,
    serverIssuedIdempotencyKey: snapshot.serverIssuedIdempotencyKey,
    expectedRevisionId: snapshot.revisionId,
    decision: "confirm"
  }]);
  assert.equal(doc.getElementById("liff-dialog").open, false);
  assert.equal(doc.getElementById("receipt-dialog").open, true);
  assert.equal(
    doc.getElementById("receipt-title").textContent,
    "Sandbox Verification Record — Demo · No Business Effect"
  );
  assert.match(doc.getElementById("receipt-description").textContent, /workflow.*approval state.*ไม่เปลี่ยน/u);
  assert.match(doc.getElementById("receipt-digest-disclosure").textContent, /ไม่ใช่ลายเซ็น/u);
  assert.match(doc.querySelector("[data-receipt]").textContent, new RegExp(record.recordDigest, "u"));
});

for (const lifecycle of ["preset", "language", "field", "reset"]) {
  test(`bindStudio releases a pending open immediately on ${lifecycle} change`, async () => {
    const doc = createStudioTestDocument();
    const firstOpen = deferred();
    let openCalls = 0;
    bindStudio(doc, {
      designApprovalPort: {
        openReview: async () => {
          openCalls += 1;
          return openCalls === 1 ? firstOpen.promise : reviewSnapshot();
        },
        confirmReview: async () => ({ outcome: "not_available" })
      }
    });
    const run = doc.getElementById("run-journey");

    if (lifecycle === "reset") {
      const field = doc.getElementById("field-header-title");
      field.value = "แบบพร้อมอนุมัติ — แก้ไข";
      await field.dispatchEvent({ type: "input" });
    }
    const pendingRun = run.click();
    assert.equal(run.getAttribute("aria-busy"), "true");
    assert.equal(run.disabled, true);

    try {
      if (lifecycle === "preset") {
        await doc.getElementById("preset-list").children[1].click();
      } else if (lifecycle === "language") {
        await doc.getElementById("language-toggle").click();
      } else if (lifecycle === "field") {
        const field = doc.getElementById("field-header-title");
        field.value = "แบบพร้อมอนุมัติ — ใหม่";
        await field.dispatchEvent({ type: "input" });
      } else {
        await doc.getElementById("reset-draft").click();
      }

      assert.equal(run.getAttribute("aria-busy"), null);
      assert.equal(run.disabled, false);
      await run.click();
      if (lifecycle === "preset") {
        assert.equal(openCalls, 1);
        assert.equal(doc.getElementById("liff-title").textContent, "ตรวจแบบส่วนตัว · Demo");
      } else {
        assert.equal(openCalls, 2);
        assert.equal(doc.getElementById("liff-dialog").open, true);
      }
    } finally {
      firstOpen.resolve(reviewSnapshot());
      await pendingRun;
    }
  });
}

for (const lifecycle of ["cancel", "dialog.cancel", "dialog.close"]) {
  test(`bindStudio releases a pending confirm immediately on ${lifecycle}`, async () => {
    const doc = createStudioTestDocument();
    const firstConfirm = deferred();
    const record = await sandboxRecord();
    let confirmCalls = 0;
    bindStudio(doc, {
      designApprovalPort: {
        openReview: async () => reviewSnapshot(),
        confirmReview: async () => {
          confirmCalls += 1;
          return confirmCalls === 1 ? firstConfirm.promise : {
            outcome: "sandbox_recorded",
            record
          };
        }
      }
    });
    const liff = doc.getElementById("liff-dialog");
    const confirm = doc.getElementById("confirm-journey");
    await doc.getElementById("run-journey").click();
    const pendingConfirmation = confirm.click();
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    assert.equal(confirm.disabled, true);

    try {
      if (lifecycle === "cancel") {
        await doc.getElementById("cancel-journey").click();
      } else if (lifecycle === "dialog.cancel") {
        await liff.dispatchEvent({ type: "cancel" });
        liff.close("cancel");
      } else {
        liff.close("dismissed");
      }

      assert.equal(confirm.getAttribute("aria-busy"), null);
      assert.equal(confirm.disabled, true);
      assert.equal(doc.getElementById("receipt-dialog").open, false);

      await doc.getElementById("run-journey").click();
      assert.equal(liff.open, true);
      assert.equal(confirm.disabled, false);
      await confirm.click();
      assert.equal(confirmCalls, 2);
      assert.equal(doc.getElementById("receipt-dialog").open, true);
    } finally {
      firstConfirm.resolve({ outcome: "sandbox_recorded", record });
      await pendingConfirmation;
    }
    assert.equal(doc.getElementById("receipt-dialog").open, true);
  });
}

test("a stale open finally cannot release a newer pending open", async () => {
  const doc = createStudioTestDocument();
  const firstOpen = deferred();
  const secondOpen = deferred();
  let openCalls = 0;
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => {
        openCalls += 1;
        return openCalls === 1 ? firstOpen.promise : secondOpen.promise;
      },
      confirmReview: async () => ({ outcome: "not_available" })
    }
  });
  const run = doc.getElementById("run-journey");
  const firstRun = run.click();
  await doc.getElementById("language-toggle").click();
  const secondRun = run.click();
  assert.equal(run.getAttribute("aria-busy"), "true");

  firstOpen.resolve(reviewSnapshot());
  await firstRun;
  assert.equal(run.getAttribute("aria-busy"), "true");
  assert.equal(run.disabled, true);
  assert.equal(doc.getElementById("liff-dialog").open, false);

  secondOpen.resolve(reviewSnapshot());
  await secondRun;
  assert.equal(run.getAttribute("aria-busy"), null);
  assert.equal(doc.getElementById("liff-dialog").open, true);
});

test("a stale confirm finally cannot release a newer pending confirm", async () => {
  const doc = createStudioTestDocument();
  const firstConfirm = deferred();
  const secondConfirm = deferred();
  const record = await sandboxRecord();
  let confirmCalls = 0;
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => reviewSnapshot(),
      confirmReview: async () => {
        confirmCalls += 1;
        return confirmCalls === 1 ? firstConfirm.promise : secondConfirm.promise;
      }
    }
  });
  const run = doc.getElementById("run-journey");
  const confirm = doc.getElementById("confirm-journey");
  await run.click();
  const firstConfirmation = confirm.click();
  await doc.getElementById("cancel-journey").click();
  await run.click();
  const secondConfirmation = confirm.click();
  assert.equal(confirm.getAttribute("aria-busy"), "true");

  firstConfirm.resolve({ outcome: "sandbox_recorded", record });
  await firstConfirmation;
  assert.equal(confirm.getAttribute("aria-busy"), "true");
  assert.equal(confirm.disabled, true);
  assert.equal(doc.getElementById("receipt-dialog").open, false);

  secondConfirm.resolve({ outcome: "sandbox_recorded", record });
  await secondConfirmation;
  assert.equal(confirm.getAttribute("aria-busy"), null);
  assert.equal(doc.getElementById("receipt-dialog").open, true);
});

test("bindStudio shows a bounded open error in a visible non-confirmable dialog", async () => {
  const doc = createStudioTestDocument();
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => ({ outcome: "not_available" }),
      confirmReview: async () => ({ outcome: "not_available" })
    }
  });

  await doc.getElementById("run-journey").click();
  const message = "คำขอนี้ไม่พร้อมใช้งาน โปรดตรวจข้อความ LINE ล่าสุดหรือติดต่อทีมบริการ";
  assert.equal(doc.getElementById("liff-dialog").open, true);
  assert.equal(doc.getElementById("confirm-journey").disabled, true);
  assert.equal(doc.querySelector("[data-review-outcome] span").textContent, message);
  assert.equal(doc.getElementById("toast-live").textContent, message);
  assert.match(doc.getElementById("liff-description").textContent, /workflow.*approval state.*ไม่เปลี่ยน/u);
});

test("bindStudio keeps a bounded confirm error visible until acknowledgment", async () => {
  const doc = createStudioTestDocument();
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => reviewSnapshot(),
      confirmReview: async () => ({ outcome: "stale_revision" })
    }
  });

  await doc.getElementById("run-journey").click();
  await doc.getElementById("confirm-journey").click();
  const message = "รุ่นแบบที่ตรวจไม่ใช่รุ่นปัจจุบันแล้ว โปรดเปิดข้อความ LINE ล่าสุดและลองใหม่";
  assert.equal(doc.getElementById("liff-dialog").open, true);
  assert.equal(doc.getElementById("confirm-journey").disabled, true);
  assert.equal(doc.querySelector("[data-review-outcome] span").textContent, message);
  assert.equal(doc.getElementById("toast-live").textContent, message);
  assert.equal(doc.getElementById("receipt-dialog").open, false);
});

test("bindStudio preserves all four legacy routes without calling the Design Approval port", async () => {
  const doc = createStudioTestDocument();
  let adapterCalls = 0;
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => {
        adapterCalls += 1;
        return reviewSnapshot();
      },
      confirmReview: async () => {
        adapterCalls += 1;
        return { outcome: "not_available" };
      }
    }
  });
  const expectedThaiTitles = [
    "ใบเสนอราคาพร้อมตรวจ", "งานใกล้เกิน SLA",
    "อัปเดตหน้างานที่คัดแล้ว", "รับหลักฐานปัญหาแล้ว"
  ];

  for (let index = 1; index < PRESET_IDS.length; index += 1) {
    await doc.getElementById("preset-list").children[index].click();
    assert.equal(doc.getElementById("liff-title").textContent, "ตรวจแบบส่วนตัว · Demo");
    assert.equal(doc.getElementById("confirm-journey").textContent, "ยืนยันเจตนาใน Demo");
    assert.equal(doc.getElementById("preset-list").children[index].textContent.includes(
      expectedThaiTitles[index - 1]
    ), true);
    await doc.getElementById("run-journey").click();
    assert.equal(doc.getElementById("liff-dialog").open, true);
    doc.getElementById("liff-dialog").close("test-next-route");
  }
  assert.equal(adapterCalls, 0);
});

test("bindStudio still completes a current legacy confirmation with its demo receipt", async () => {
  const doc = createStudioTestDocument();
  let adapterCalls = 0;
  bindStudio(doc, {
    designApprovalPort: {
      openReview: async () => {
        adapterCalls += 1;
        return reviewSnapshot();
      },
      confirmReview: async () => {
        adapterCalls += 1;
        return { outcome: "not_available" };
      }
    }
  });

  await doc.getElementById("preset-list").children[1].click();
  await doc.getElementById("run-journey").click();
  await doc.getElementById("confirm-journey").click();

  assert.equal(doc.getElementById("liff-dialog").open, false);
  assert.equal(doc.getElementById("receipt-dialog").open, true);
  assert.equal(
    doc.getElementById("receipt-title").textContent,
    "หลักฐานการยืนยัน — Demo · Verification Receipt — Demo"
  );
  const receiptSurface = doc.querySelector("[data-receipt]");
  assert.equal(
    receiptSurface.children[0].textContent,
    "DEMO — NOT A PRODUCTION SIGNATURE · เดโม — ไม่ใช่ลายเซ็นสำหรับระบบจริง"
  );
  const digestRow = receiptSurface.querySelectorAll(".review-pair").find(
    (row) => row.children[0].textContent === "SHA-256 digest"
  );
  assert.match(digestRow.children[1].textContent, /^[0-9a-f]{64}$/u);
  assert.equal(
    receiptSurface.children.at(-1).textContent,
    "การลงนามและบันทึกหลักฐานในระบบจริงต้องผ่าน MONOLITH Trust Kernel"
  );
  assert.equal(adapterCalls, 0);
});

test("bindStudio still renders a bounded current legacy rejection", async () => {
  const doc = createStudioTestDocument();
  const subtlePrototype = Object.getPrototypeOf(globalThis.crypto.subtle);
  const originalDigest = subtlePrototype.digest;
  subtlePrototype.digest = async () => {
    throw new Error("current legacy digest failure secret=must-not-leak");
  };

  try {
    bindStudio(doc, {
      designApprovalPort: {
        openReview: async () => reviewSnapshot(),
        confirmReview: async () => ({ outcome: "not_available" })
      }
    });
    await doc.getElementById("preset-list").children[1].click();
    await doc.getElementById("run-journey").click();
    await doc.getElementById("confirm-journey").click();

    const message = "สร้างหลักฐาน Demo ไม่สำเร็จเนื่องจากข้อผิดพลาดที่ไม่คาดคิด";
    assert.equal(doc.getElementById("liff-dialog").open, false);
    assert.equal(doc.getElementById("receipt-dialog").open, false);
    assert.equal(doc.querySelector("[data-review-outcome] span").textContent, message);
    assert.equal(doc.getElementById("toast-live").textContent, message);
    assert.equal(doc.getElementById("confirm-journey").disabled, true);
    assert.doesNotMatch(doc.getElementById("toast-live").textContent, /secret|digest failure/u);
  } finally {
    subtlePrototype.digest = originalDigest;
  }
});

test("a canceled legacy digest success cannot overwrite a newer busy Design Approval", async () => {
  const doc = createStudioTestDocument();
  const legacyDigest = deferred();
  const designConfirmation = deferred();
  const record = await sandboxRecord();
  const subtlePrototype = Object.getPrototypeOf(globalThis.crypto.subtle);
  const originalDigest = subtlePrototype.digest;
  subtlePrototype.digest = async () => legacyDigest.promise;
  let oldLegacyConfirmation;
  let newDesignConfirmation;

  try {
    bindStudio(doc, {
      designApprovalPort: {
        openReview: async () => reviewSnapshot(),
        confirmReview: async () => designConfirmation.promise
      }
    });
    const run = doc.getElementById("run-journey");
    const confirm = doc.getElementById("confirm-journey");
    const liff = doc.getElementById("liff-dialog");

    await doc.getElementById("preset-list").children[1].click();
    await run.click();
    oldLegacyConfirmation = confirm.click();
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    await doc.getElementById("cancel-journey").click();

    await doc.getElementById("preset-list").children[0].click();
    await run.click();
    newDesignConfirmation = confirm.click();
    assert.equal(liff.open, true);
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    assert.equal(doc.querySelector("[data-artifact-manifest-sha256]").textContent, "b".repeat(64));

    legacyDigest.resolve(new Uint8Array(32).buffer);
    await oldLegacyConfirmation;
    assert.equal(liff.open, true);
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    assert.equal(doc.getElementById("receipt-dialog").open, false);
    assert.equal(doc.getElementById("liff-title").textContent, "ตรวจแบบส่วนตัว · Sandbox");
    assert.equal(doc.querySelector("[data-artifact-manifest-sha256]").textContent, "b".repeat(64));

    designConfirmation.resolve({ outcome: "sandbox_recorded", record });
    await newDesignConfirmation;
    assert.equal(doc.getElementById("receipt-dialog").open, true);
    assert.equal(
      doc.getElementById("receipt-title").textContent,
      "Sandbox Verification Record — Demo · No Business Effect"
    );
  } finally {
    legacyDigest.resolve(new Uint8Array(32).buffer);
    designConfirmation.resolve({ outcome: "sandbox_recorded", record });
    await Promise.allSettled([
      oldLegacyConfirmation,
      newDesignConfirmation
    ].filter(Boolean));
    subtlePrototype.digest = originalDigest;
  }
});

test("a canceled legacy digest rejection cannot clear a newer busy Design Approval", async () => {
  const doc = createStudioTestDocument();
  const legacyDigest = deferred();
  const designConfirmation = deferred();
  const record = await sandboxRecord();
  const subtlePrototype = Object.getPrototypeOf(globalThis.crypto.subtle);
  const originalDigest = subtlePrototype.digest;
  subtlePrototype.digest = async () => legacyDigest.promise;
  let oldLegacyConfirmation;
  let newDesignConfirmation;

  try {
    bindStudio(doc, {
      designApprovalPort: {
        openReview: async () => reviewSnapshot(),
        confirmReview: async () => designConfirmation.promise
      }
    });
    const run = doc.getElementById("run-journey");
    const confirm = doc.getElementById("confirm-journey");
    const liff = doc.getElementById("liff-dialog");

    await doc.getElementById("preset-list").children[1].click();
    await run.click();
    oldLegacyConfirmation = confirm.click();
    await doc.getElementById("cancel-journey").click();

    await doc.getElementById("preset-list").children[0].click();
    await run.click();
    newDesignConfirmation = confirm.click();
    assert.equal(liff.open, true);
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    const visibleOutcome = doc.querySelector("[data-review-outcome] span").textContent;
    const liveMessage = doc.getElementById("toast-live").textContent;

    legacyDigest.reject(new Error("stale legacy digest failure secret=old"));
    await oldLegacyConfirmation;
    assert.equal(liff.open, true);
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    assert.equal(confirm.disabled, true);
    assert.equal(doc.getElementById("receipt-dialog").open, false);
    assert.equal(doc.querySelector("[data-review-outcome] span").textContent, visibleOutcome);
    assert.equal(doc.getElementById("toast-live").textContent, liveMessage);
    assert.equal(doc.querySelector("[data-artifact-manifest-sha256]").textContent, "b".repeat(64));

    designConfirmation.resolve({ outcome: "sandbox_recorded", record });
    await newDesignConfirmation;
    assert.equal(doc.getElementById("receipt-dialog").open, true);
    assert.equal(
      doc.getElementById("receipt-title").textContent,
      "Sandbox Verification Record — Demo · No Business Effect"
    );
  } finally {
    legacyDigest.reject(new Error("test cleanup"));
    designConfirmation.resolve({ outcome: "sandbox_recorded", record });
    await Promise.allSettled([
      oldLegacyConfirmation,
      newDesignConfirmation
    ].filter(Boolean));
    subtlePrototype.digest = originalDigest;
  }
});

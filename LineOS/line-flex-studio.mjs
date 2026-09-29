import {
  canonicalize, createDraft, deepFreeze, updateDraftAtPath
} from "./line-flex-model.mjs";
import { PRESET_IDS, getPreset } from "./line-flex-presets.mjs";
import { buildFlexMessage, measureUtf8Bytes } from "./line-flex-json.mjs";
import { validateDraft } from "./line-flex-validator.mjs";
import {
  createDemoTransaction, confirmDemoTransaction
} from "./line-flex-actions.mjs";
import { createDemoReceipt } from "./line-flex-receipt.mjs";
import { assertReviewSnapshot } from "./line-design-approval-contract.mjs";
import {
  sandboxVerificationRecordRowsFor
} from "./line-design-approval-record.mjs";
import {
  createSandboxDesignApprovalPort
} from "./line-design-approval-sandbox.mjs";

export function createInitialStudioState() {
  const language = "th";
  const presetId = "design-approval";
  return {
    language,
    presetId,
    activeBlock: "header",
    draft: createDraft(getPreset(presetId), language),
    transaction: null,
    receipt: null
  };
}

export function reduceStudioState(state, event) {
  if (event.type === "language.changed") {
    return {
      ...state,
      language: event.language,
      draft: createDraft(getPreset(state.presetId), event.language),
      transaction: null,
      receipt: null
    };
  }
  if (event.type === "preset.changed") {
    return {
      ...state,
      presetId: event.presetId,
      draft: createDraft(getPreset(event.presetId), state.language),
      transaction: null,
      receipt: null
    };
  }
  if (event.type === "block.changed") {
    return { ...state, activeBlock: event.block };
  }
  if (event.type === "field.changed") {
    return {
      ...state,
      draft: updateDraftAtPath(state.draft, event.path, event.value),
      transaction: null,
      receipt: null
    };
  }
  if (event.type === "draft.reset") {
    return {
      ...state,
      draft: createDraft(getPreset(state.presetId), state.language),
      transaction: null,
      receipt: null
    };
  }
  return state;
}

export function deriveStudioView(state) {
  const message = buildFlexMessage(state.draft);
  const findings = validateDraft(state.draft, message);
  const hasBlockingErrors = findings.some((finding) => finding.severity === "error");
  return {
    ...state,
    message,
    jsonText: JSON.stringify(message, null, 2),
    payloadBytes: measureUtf8Bytes(message.contents),
    findings,
    hasBlockingErrors,
    canExport: !hasBlockingErrors,
    canRunJourney: !hasBlockingErrors,
    preview: state.draft
  };
}

export function isStudioDraftDirty(state) {
  const baseline = createDraft(getPreset(state.presetId), state.language);
  return canonicalize(state.draft) !== canonicalize(baseline);
}

const LEGACY_DEMO_PRESET_IDS = new Set([
  "quote-order", "sla-escalation", "site-update", "issue-evidence"
]);
const CLEARING_STUDIO_EVENTS = new Set([
  "language.changed", "preset.changed", "field.changed", "draft.reset"
]);

export function selectStudioJourney(presetId) {
  if (presetId === "design-approval") return "design-approval-port";
  if (LEGACY_DEMO_PRESET_IDS.has(presetId)) return "legacy-demo";
  throw new Error("unknown_studio_journey");
}

export function shouldClearDesignApprovalReview(eventType) {
  return CLEARING_STUDIO_EVENTS.has(eventType);
}

const DESIGN_APPROVAL_REVIEW_LABELS = deepFreeze({
  en: [
    "Provider context", "Work item reference", "Request reference",
    "Revision label", "Revision ID", "Requested action", "Consequence",
    "Issued at", "Expires at"
  ],
  th: [
    "บริบทผู้ให้บริการ", "รหัสงาน", "รหัสคำขอ", "ชื่อรุ่นแบบ", "รหัสรุ่นแบบ",
    "การดำเนินการที่ร้องขอ", "ผลของการทดลอง", "เวลาออกเซสชัน", "หมดอายุ"
  ]
});

const supportedLanguage = (language) => {
  if (language !== "en" && language !== "th") throw new Error("unsupported_language");
  return language;
};

const captureReviewSnapshot = (snapshot) => {
  assertReviewSnapshot(snapshot);
  return assertReviewSnapshot(deepFreeze({
    reviewSessionId: snapshot.reviewSessionId,
    serverIssuedIdempotencyKey: snapshot.serverIssuedIdempotencyKey,
    mode: snapshot.mode,
    businessEffect: snapshot.businessEffect,
    providerContext: snapshot.providerContext,
    workItemRef: snapshot.workItemRef,
    approvalRequestRef: snapshot.approvalRequestRef,
    revisionLabel: snapshot.revisionLabel,
    revisionId: snapshot.revisionId,
    artifactManifestSha256: snapshot.artifactManifestSha256,
    digestAlgorithm: snapshot.digestAlgorithm,
    canonicalizationVersion: snapshot.canonicalizationVersion,
    expectedWorkflowVersion: snapshot.expectedWorkflowVersion,
    reviewArtifacts: snapshot.reviewArtifacts.map((artifact) => ({
      kind: artifact.kind,
      label: artifact.label,
      uri: artifact.uri
    })),
    requestedCanonicalAction: snapshot.requestedCanonicalAction,
    plainLanguageConsequence: snapshot.plainLanguageConsequence,
    issuedAt: snapshot.issuedAt,
    expiresAt: snapshot.expiresAt
  }));
};

export function designApprovalReviewRowsFor(snapshot, language) {
  const selectedLanguage = supportedLanguage(language);
  assertReviewSnapshot(snapshot);
  const labels = DESIGN_APPROVAL_REVIEW_LABELS[selectedLanguage];
  const values = [
    snapshot.providerContext,
    snapshot.workItemRef,
    snapshot.approvalRequestRef,
    snapshot.revisionLabel,
    snapshot.revisionId,
    snapshot.requestedCanonicalAction,
    snapshot.plainLanguageConsequence,
    snapshot.issuedAt,
    snapshot.expiresAt
  ];
  const rows = values.map((value, index) => [labels[index], String(value)]);
  snapshot.reviewArtifacts.forEach((artifact, index) => {
    rows.push([
      selectedLanguage === "en" ? `Review artifact ${index + 1}` : `หลักฐานแบบ ${index + 1}`,
      `${artifact.label} · ${artifact.uri}`
    ]);
  });
  return deepFreeze(rows);
}

const DESIGN_APPROVAL_ERROR_COPY = deepFreeze({
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
});

export function designApprovalErrorCopyFor(outcome, language) {
  const messages = DESIGN_APPROVAL_ERROR_COPY[supportedLanguage(language)];
  if (!Object.hasOwn(messages, outcome)) throw new Error("unsupported_review_outcome");
  return messages[outcome];
}

const DESIGN_APPROVAL_RECEIPT_COPY = deepFreeze({
  en: {
    title: "Sandbox Verification Record — Demo · No Business Effect",
    ribbon: "SANDBOX — NO BUSINESS EFFECT",
    workflowDisclosure: "MONOLITH workflow and approval state did not change. This record captures only the sandbox confirmation attempt.",
    digestDisclosure: "The SHA-256 digest is integrity metadata for this sandbox record, not a digital signature.",
    ready: "Sandbox verification record is ready. Workflow and approval state did not change."
  },
  th: {
    title: "Sandbox Verification Record — Demo · No Business Effect",
    ribbon: "SANDBOX — NO BUSINESS EFFECT",
    workflowDisclosure: "workflow และ approval state ของ MONOLITH ไม่เปลี่ยน บันทึกนี้เก็บเฉพาะการทดลองยืนยันใน Sandbox",
    digestDisclosure: "ค่า SHA-256 digest เป็นข้อมูลตรวจความครบถ้วนของบันทึก Sandbox นี้ ไม่ใช่ลายเซ็นดิจิทัล",
    ready: "บันทึกการยืนยันใน Sandbox พร้อมแล้ว โดย workflow และ approval state ไม่เปลี่ยน"
  }
});

export function designApprovalReceiptCopyFor(language) {
  return DESIGN_APPROVAL_RECEIPT_COPY[supportedLanguage(language)];
}

const DESIGN_APPROVAL_REVIEW_COPY = deepFreeze({
  en: {
    ribbon: "PRIVATE SANDBOX REVIEW · NO BUSINESS EFFECT",
    title: "Private design review · Sandbox",
    description: "Review the adapter-owned revision and consequence before recording a sandbox confirmation attempt. No workflow or approval state will change.",
    confirm: "Confirm sandbox attempt",
    emptyOutcome: "No sandbox confirmation attempt has been recorded.",
    ready: "Sandbox review opened. No business state has changed."
  },
  th: {
    ribbon: "ตรวจแบบส่วนตัวใน SANDBOX · ไม่มีผลต่อธุรกิจ",
    title: "ตรวจแบบส่วนตัว · Sandbox",
    description: "ตรวจรุ่นแบบและผลที่มาจาก adapter ก่อนบันทึกการทดลองยืนยัน โดย workflow และ approval state จะไม่เปลี่ยน",
    confirm: "ยืนยันการทดลองใน Sandbox",
    emptyOutcome: "ยังไม่มีการบันทึกการทดลองยืนยันใน Sandbox",
    ready: "เปิดรายการตรวจใน Sandbox แล้ว โดยสถานะธุรกิจยังไม่เปลี่ยน"
  }
});

const designApprovalReviewCopyFor = (language) =>
  DESIGN_APPROVAL_REVIEW_COPY[supportedLanguage(language)];

export function setConfirmationBusy(button, busy) {
  button.disabled = busy;
  if (busy) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
}

const terminalDesignApprovalResult = (outcome, language) => deepFreeze({
  outcome,
  message: designApprovalErrorCopyFor(outcome, language)
});

export function createDesignApprovalJourneyController(port) {
  if (typeof port?.openReview !== "function" ||
      typeof port?.confirmReview !== "function") {
    throw new Error("invalid_design_approval_port");
  }

  const idleState = (reason = null) => deepFreeze({ phase: "idle", reason });
  let state = idleState();
  let generation = 0;
  let pendingConfirmation = null;

  const clear = (reason = "cleared") => {
    generation += 1;
    pendingConfirmation = null;
    state = idleState(reason);
  };

  const open = async ({ reviewToken, language }) => {
    const selectedLanguage = supportedLanguage(language);
    clear("open");
    const currentGeneration = generation;
    state = deepFreeze({ phase: "opening", language: selectedLanguage });
    let response;
    try {
      response = await port.openReview(reviewToken);
    } catch {
      response = { outcome: "temporarily_unavailable" };
    }
    if (currentGeneration !== generation) return deepFreeze({ status: "cleared" });
    try {
      if (response?.outcome) {
        const result = terminalDesignApprovalResult(response.outcome, selectedLanguage);
        clear(response.outcome);
        return result;
      }
      const snapshot = captureReviewSnapshot(response);
      const rows = designApprovalReviewRowsFor(snapshot, selectedLanguage);
      state = deepFreeze({
        phase: "ready", language: selectedLanguage, snapshot
      });
      return deepFreeze({ outcome: "review_opened", snapshot, rows });
    } catch {
      const result = terminalDesignApprovalResult(
        "temporarily_unavailable",
        selectedLanguage
      );
      clear("temporarily_unavailable");
      return result;
    }
  };

  const confirm = () => {
    if (pendingConfirmation) return pendingConfirmation;
    if (state.phase !== "ready") {
      return Promise.resolve(terminalDesignApprovalResult(
        "not_available",
        state.language ?? "en"
      ));
    }

    const active = state;
    const currentGeneration = generation;
    state = deepFreeze({
      phase: "confirming", language: active.language, snapshot: active.snapshot
    });
    const input = deepFreeze({
      reviewSessionId: active.snapshot.reviewSessionId,
      serverIssuedIdempotencyKey: active.snapshot.serverIssuedIdempotencyKey,
      expectedRevisionId: active.snapshot.revisionId,
      decision: "confirm"
    });

    const operation = (async () => {
      let response;
      try {
        response = await port.confirmReview(input);
      } catch {
        response = { outcome: "temporarily_unavailable" };
      }
      if (currentGeneration !== generation) return deepFreeze({ status: "cleared" });
      try {
        if (response?.outcome === "sandbox_recorded" ||
            response?.outcome === "sandbox_replayed") {
          const copy = designApprovalReceiptCopyFor(active.language);
          const rows = sandboxVerificationRecordRowsFor(response.record, active.language);
          const result = deepFreeze({
            outcome: response.outcome,
            title: copy.title,
            rows,
            copy
          });
          clear(response.outcome);
          return result;
        }
        const result = terminalDesignApprovalResult(
          response?.outcome ?? "temporarily_unavailable",
          active.language
        );
        clear(response?.outcome ?? "temporarily_unavailable");
        return result;
      } catch {
        const result = terminalDesignApprovalResult(
          "temporarily_unavailable",
          active.language
        );
        clear("temporarily_unavailable");
        return result;
      }
    })();
    pendingConfirmation = operation;
    operation.finally(() => {
      if (pendingConfirmation === operation) pendingConfirmation = null;
    });
    return operation;
  };

  return deepFreeze({ open, confirm, clear, getState: () => state });
}

const BLOCKS = ["header", "hero", "body", "footer"];
const FIELDS = {
  header: [
    ["header.eyebrow", "Eyebrow", "คิ้วหัวเรื่อง"],
    ["header.title", "Title", "หัวเรื่อง"],
    ["header.status", "Status", "สถานะ"],
    ["altText", "Alt text", "ข้อความสำรอง"]
  ],
  hero: [
    ["hero.exportUrl", "Export HTTPS URL", "URL HTTPS สำหรับส่งจริง"],
    ["hero.aspectRatio", "Aspect ratio", "อัตราส่วนภาพ"],
    ["hero.aspectMode", "Aspect mode", "รูปแบบการครอบภาพ"]
  ],
  body: [
    ["body.project", "Project", "โครงการ"],
    ["body.revision", "Revision", "Revision"],
    ["body.requester", "Requested by", "ผู้ส่งคำขอ"],
    ["body.amount", "Amount / scope", "มูลค่า / ขอบเขต"],
    ["body.deadline", "Due", "กำหนดเวลา"],
    ["body.summary", "Summary", "สรุป"],
    ["body.trustNote", "Trust note", "ข้อความยืนยันความน่าเชื่อถือ"]
  ],
  footer: [
    ["footer.primaryLabel", "Primary CTA", "ปุ่มหลัก"],
    ["footer.secondaryLabel", "Secondary CTA", "ปุ่มรอง"],
    ["intent.requestedActionType", "Requested action", "Action ที่ร้องขอ"]
  ]
};

const COPY = {
  en: {
    blocks: ["Header", "Hero", "Body", "Footer"],
    panes: ["Editor", "Preview", "JSON & Validation"],
    audiences: {
      customer: "Customer", internal: "Internal", customer_group: "Customer group",
      internal_group: "Internal group"
    },
    editorTitle: "Flex Message Studio", previewTitle: "LINE Preview",
    jsonTitle: "JSON Preview", validationTitle: "Validation",
    bytes: "bubble bytes", safeBytes: "within 24 KB", softBytes: "over 24 KB soft budget",
    hardBytes: "over 30 KB limit", run: "Run Journey", copyJson: "Copy JSON",
    downloadJson: "Download JSON", resetDraft: "Reset", copied: "JSON copied",
    downloaded: "JSON downloaded", reset: "Draft reset",
    copyFailed: "Copy failed. Select the JSON and copy manually.",
    downloadFailed: "Download failed. Copy the JSON manually.",
    blocked: "Resolve blocking validation errors first.",
    validationBlocked: "The draft has blocking errors and cannot be confirmed.",
    transactionExpired: "The review expired. Start again.",
    transactionStale: "Bound review values changed. Start the review again.",
    apiUnavailable: "This browser does not provide an API required for the demo.",
    unexpectedReceipt: "The demo receipt could not be created because of an unexpected error.",
    privateReview: "PRIVATE REVIEW — DEMO",
    liffTitle: "Private review · Demo",
    liffDescription: "Review the bound demo values before confirming the demo intent.",
    receiptTitle: "Verification Receipt — Demo",
    receiptRibbon: "DEMO — NOT A PRODUCTION SIGNATURE",
    receiptDescription: "This demo receipt records the confirmation shown below.",
    digestDisclosure: "The SHA-256 digest is demo integrity metadata, not a production signature.",
    receiptReady: "Verification Receipt — Demo is ready.",
    productionNotice: "Production signing and audit require the MONOLITH Trust Kernel.",
    reviewLabels: {
      tenant: "Tenant", recipient: "Recipient", project: "Project", revision: "Revision",
      action: "Action", consequence: "Consequence", actionMode: "Action mode", expires: "Expires"
    },
    receiptLabels: {
      transaction: "Transaction / correlation ID", tenant: "Tenant ID", provider: "Provider",
      recipient: "Recipient", target: "Project / resource", revision: "Revision",
      action: "Action", outcome: "Outcome", created: "Created", confirmed: "Confirmed",
      digest: "SHA-256 digest"
    },
    fix: "Fix",
    cancel: "Cancel", confirm: "Confirm demo intent", close: "Close",
    resetPrompt: "Reset all edits?", resetUnavailable: "Reset confirmation is unavailable.",
    languageLabel: "Switch interface to Thai", presetLabel: "Message presets",
    blockLabel: "Flex blocks", paneLabel: "Studio panes", skip: "Skip to workspace"
  },
  th: {
    blocks: ["ส่วนหัว", "ภาพหลัก", "เนื้อหา", "ส่วนท้าย"],
    panes: ["แก้ไข", "ตัวอย่าง", "JSON และตรวจสอบ"],
    audiences: {
      customer: "ลูกค้า", internal: "ภายใน", customer_group: "กลุ่มลูกค้า",
      internal_group: "กลุ่มภายใน"
    },
    editorTitle: "สตูดิโอ Flex Message", previewTitle: "ตัวอย่าง LINE",
    jsonTitle: "ตัวอย่าง JSON", validationTitle: "การตรวจสอบ",
    bytes: "ไบต์ของ bubble", safeBytes: "ไม่เกิน 24 KB", softBytes: "เกินงบแนะนำ 24 KB",
    hardBytes: "เกินขีดจำกัด 30 KB", run: "ทดลอง Journey", copyJson: "คัดลอก JSON",
    downloadJson: "ดาวน์โหลด JSON", resetDraft: "คืนค่า", copied: "คัดลอก JSON แล้ว",
    downloaded: "ดาวน์โหลด JSON แล้ว", reset: "คืนค่าแบบร่างแล้ว",
    copyFailed: "คัดลอกไม่สำเร็จ โปรดเลือก JSON แล้วคัดลอกด้วยตนเอง",
    downloadFailed: "ดาวน์โหลดไม่สำเร็จ โปรดคัดลอก JSON ด้วยตนเอง",
    blocked: "โปรดแก้ข้อผิดพลาดที่ปิดกั้นก่อน",
    validationBlocked: "แบบร่างมีข้อผิดพลาดที่ปิดกั้น จึงยืนยันไม่ได้",
    transactionExpired: "รายการตรวจหมดอายุ โปรดเริ่มใหม่",
    transactionStale: "ข้อมูลที่ผูกกับรายการตรวจเปลี่ยนแล้ว โปรดเริ่มตรวจใหม่",
    apiUnavailable: "เบราว์เซอร์นี้ไม่มี API ที่จำเป็นสำหรับ Demo",
    unexpectedReceipt: "สร้างหลักฐาน Demo ไม่สำเร็จเนื่องจากข้อผิดพลาดที่ไม่คาดคิด",
    privateReview: "ตรวจแบบส่วนตัว — Demo",
    liffTitle: "ตรวจแบบส่วนตัว · Demo",
    liffDescription: "ตรวจค่าที่ผูกกับ Demo ก่อนยืนยันเจตนาการทดลอง",
    receiptTitle: "หลักฐานการยืนยัน — Demo · Verification Receipt — Demo",
    receiptRibbon: "DEMO — NOT A PRODUCTION SIGNATURE · เดโม — ไม่ใช่ลายเซ็นสำหรับระบบจริง",
    receiptDescription: "หลักฐาน Demo นี้บันทึกการยืนยันที่แสดงด้านล่าง",
    digestDisclosure: "ค่า SHA-256 digest เป็นข้อมูลตรวจความครบถ้วนของ Demo ไม่ใช่ลายเซ็นสำหรับระบบจริง",
    receiptReady: "Verification Receipt — Demo พร้อมแล้ว",
    productionNotice: "การลงนามและบันทึกหลักฐานในระบบจริงต้องผ่าน MONOLITH Trust Kernel",
    reviewLabels: {
      tenant: "ผู้ให้บริการ", recipient: "ผู้รับ", project: "โครงการ", revision: "รุ่นแบบ",
      action: "การดำเนินการ", consequence: "ผลที่จะเกิดขึ้น",
      actionMode: "โหมดการดำเนินการ", expires: "หมดอายุ"
    },
    receiptLabels: {
      transaction: "รายการ / Correlation ID", tenant: "รหัส Tenant", provider: "ผู้ให้บริการ",
      recipient: "ผู้รับ", target: "โครงการ / ทรัพยากร", revision: "รุ่นแบบ",
      action: "การดำเนินการ", outcome: "ผลลัพธ์", created: "สร้างเมื่อ",
      confirmed: "ยืนยันเมื่อ", digest: "SHA-256 digest"
    },
    fix: "แก้ไข",
    cancel: "ยกเลิก", confirm: "ยืนยันเจตนาใน Demo", close: "ปิด",
    resetPrompt: "คืนค่าการแก้ไขทั้งหมดหรือไม่", resetUnavailable: "ไม่สามารถเปิดคำยืนยันการคืนค่าได้",
    languageLabel: "เปลี่ยนหน้าจอเป็นภาษาอังกฤษ", presetLabel: "รูปแบบข้อความ",
    blockLabel: "ส่วนของ Flex", paneLabel: "พื้นที่ในสตูดิโอ", skip: "ข้ามไปพื้นที่ทำงาน"
  }
};

export function receiptRowsFor(receipt, language) {
  const labels = COPY[language === "en" ? "en" : "th"].receiptLabels;
  return [
    [labels.transaction, receipt.transactionId],
    [labels.tenant, receipt.tenantId],
    [labels.provider, receipt.providerName],
    [labels.recipient, receipt.recipientRef],
    [labels.target, receipt.targetRef],
    [labels.revision, receipt.revision],
    [labels.action, receipt.canonicalAction],
    [labels.outcome, receipt.outcome],
    [labels.created, receipt.createdAt],
    [labels.confirmed, receipt.confirmedAt],
    [labels.digest, receipt.digest]
  ];
}

const pathParts = (path) => path.split(".");
const valueAt = (value, path) => pathParts(path).reduce((cursor, part) => cursor[part], value);
const navigatedIndex = (key, current, length) => {
  if (key === "ArrowRight") return (current + 1) % length;
  if (key === "ArrowLeft") return (current - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
};

const make = (doc, tag, options = {}) => {
  const element = doc.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, String(value));
  }
  return element;
};

const addText = (doc, parent, className, text) => {
  parent.append(make(doc, "div", { className, text }));
};

function renderPreview(doc, container, draft) {
  const message = make(doc, "div", { className: "phone-message" });
  const card = make(doc, "article", { className: "flex-card" });
  const header = make(doc, "header", { className: "flex-header" });
  addText(doc, header, "flex-eyebrow", draft.header.eyebrow);
  addText(doc, header, "flex-title", draft.header.title);
  addText(doc, header, "flex-status", draft.header.status);

  const hero = make(doc, "div", { className: "flex-hero" });
  const image = make(doc, "img", {
    attributes: { src: draft.hero.localAsset, alt: draft.hero.description ?? "" }
  });
  image.addEventListener("error", () => image.remove());
  hero.append(image);

  const body = make(doc, "div", { className: "flex-body" });
  addText(doc, body, "flex-project", draft.body.project);
  for (const [label, value] of [
    ["Revision", draft.body.revision],
    [draft.language === "th" ? "ผู้ส่ง" : "Requested by", draft.body.requester],
    [draft.language === "th" ? "มูลค่า / ขอบเขต" : "Amount / scope", draft.body.amount],
    [draft.language === "th" ? "ภายใน" : "Due", draft.body.deadline]
  ]) {
    const row = make(doc, "div", { className: "flex-fact" });
    addText(doc, row, "flex-fact-label", label);
    addText(doc, row, "flex-fact-value", value);
    body.append(row);
  }
  addText(doc, body, "flex-summary", draft.body.summary);
  addText(doc, body, "trust-note", draft.body.trustNote);

  const footer = make(doc, "footer", { className: "flex-footer" });
  footer.append(make(doc, "button", {
    className: "flex-primary",
    text: draft.footer.primaryLabel,
    attributes: { type: "button", tabindex: "-1" }
  }));
  card.append(header, hero, body, footer);
  message.append(card);
  container.replaceChildren(message);
}

function appendPair(doc, target, label, value) {
  const row = make(doc, "div", { className: "review-pair" });
  row.append(
    make(doc, "strong", { text: label }),
    make(doc, "span", { text: String(value) })
  );
  target.append(row);
}

function installJourney(doc, controller, designApprovalPort) {
  const liff = doc.getElementById("liff-dialog");
  const receiptDialog = doc.getElementById("receipt-dialog");
  const review = liff.querySelector("[data-liff-review]");
  const receiptTarget = receiptDialog.querySelector("[data-receipt]");
  const confirm = liff.querySelector("[data-confirm-demo]");
  const cancel = liff.querySelector('button[value="cancel"]');
  const closeReceipt = receiptDialog.querySelector("[data-close-receipt]");
  const reviewMode = liff.querySelector("[data-review-mode]");
  const businessEffect = liff.querySelector("[data-business-effect]");
  const reviewExpiry = liff.querySelector("[data-review-expiry]");
  const artifactManifest = liff.querySelector("[data-artifact-manifest-sha256]");
  const reviewOutcome = liff.querySelector("[data-review-outcome] span");
  const designJourney = designApprovalPort ?
    createDesignApprovalJourneyController(designApprovalPort) : null;
  let transaction = null;
  let reviewLanguage = "th";
  let activeJourney = null;
  let confirming = false;
  let openingDesignReview = false;
  let uiOperationEpoch = 0;

  const hasDialogApis = () =>
    typeof liff?.showModal === "function" && typeof liff?.close === "function" &&
    typeof receiptDialog?.showModal === "function" && typeof receiptDialog?.close === "function";
  const hasLegacyJourneyApis = () => hasDialogApis() &&
    typeof doc.defaultView.crypto?.randomUUID === "function" &&
    typeof doc.defaultView.crypto?.subtle?.digest === "function";
  const staleErrors = new Set([
    "bound_value_changed", "transaction_tampered", "unknown_transaction",
    "invalid_transaction_expiry", "transaction_confirmation_mismatch",
    "unknown_confirmation", "confirmation_tampered"
  ]);
  const copyForState = () => COPY[controller.getState().language];
  const errorCopy = (error) => {
    const copy = copyForState();
    if (error?.message === "validation_blocked") return copy.validationBlocked;
    if (error?.message === "transaction_expired") return copy.transactionExpired;
    if (staleErrors.has(error?.message)) return copy.transactionStale;
    if (error?.message === "browser_api_unavailable") return copy.apiUnavailable;
    return copy.unexpectedReceipt;
  };
  const closeReview = (returnValue) => {
    if (liff.open && typeof liff.close === "function") liff.close(returnValue);
    else controller.nodes.run.focus();
  };
  const resetReviewSurface = () => {
    review.replaceChildren();
    reviewMode.textContent = "sandbox";
    businessEffect.textContent = "none";
    reviewExpiry.textContent = "—";
    artifactManifest.textContent = "—";
    reviewOutcome.textContent = activeJourney === "design-approval-port" ?
      designApprovalReviewCopyFor(controller.getState().language).emptyOutcome : "—";
  };
  const renderRows = (target, ribbon, rows) => {
    target.replaceChildren(make(doc, "p", {
      className: "demo-ribbon", text: ribbon
    }));
    for (const [label, value] of rows) appendPair(doc, target, label, value);
  };
  const beginUiOperation = () => {
    uiOperationEpoch += 1;
    return uiOperationEpoch;
  };
  const isCurrentUiOperation = (operation) => operation === uiOperationEpoch;
  const invalidateUiOperations = () => {
    uiOperationEpoch += 1;
    openingDesignReview = false;
    confirming = false;
    controller.nodes.run.removeAttribute("aria-busy");
    controller.nodes.run.disabled = false;
    setConfirmationBusy(confirm, false);
    confirm.disabled = true;
  };
  const clearForStudioChange = (reason) => {
    transaction = null;
    activeJourney = null;
    designJourney?.clear(reason);
    invalidateUiOperations();
    resetReviewSurface();
    if (liff.open && typeof liff.close === "function") liff.close("cleared");
  };
  const showBoundedDesignError = (message) => {
    transaction = null;
    activeJourney = null;
    designJourney?.clear("visible.error");
    resetReviewSurface();
    reviewOutcome.textContent = message;
    confirm.disabled = true;
    if (!liff.open) liff.showModal();
    controller.announce(message);
  };

  controller.nodes.run.addEventListener("click", async () => {
    const current = controller.render();
    const copy = copyForState();
    if (!current.canRunJourney || !current.canExport) {
      controller.announce(copy.validationBlocked);
      return;
    }
    if (!hasDialogApis()) {
      controller.announce(copy.apiUnavailable);
      return;
    }
    const draft = controller.getState().draft;
    const journey = selectStudioJourney(controller.getState().presetId);
    reviewLanguage = draft.language;
    activeJourney = journey;

    if (journey === "design-approval-port") {
      if (openingDesignReview) return;
      if (!designJourney) {
        const message = designApprovalErrorCopyFor("not_available", reviewLanguage);
        showBoundedDesignError(message);
        return;
      }
      const operation = beginUiOperation();
      openingDesignReview = true;
      confirm.disabled = true;
      controller.nodes.run.disabled = true;
      controller.nodes.run.setAttribute("aria-busy", "true");
      try {
        const result = await designJourney.open({
          reviewToken: draft.reviewToken,
          language: reviewLanguage
        });
        if (result.status === "cleared") return;
        if (result.outcome !== "review_opened") {
          showBoundedDesignError(result.message);
          return;
        }
        const designCopy = designApprovalReviewCopyFor(reviewLanguage);
        renderRows(review, designCopy.ribbon, result.rows);
        reviewMode.textContent = result.snapshot.mode;
        businessEffect.textContent = result.snapshot.businessEffect;
        reviewExpiry.textContent = result.snapshot.expiresAt;
        artifactManifest.textContent = result.snapshot.artifactManifestSha256;
        reviewOutcome.textContent = designCopy.emptyOutcome;
        confirm.disabled = false;
        liff.showModal();
        controller.announce(designCopy.ready);
      } finally {
        if (isCurrentUiOperation(operation)) {
          openingDesignReview = false;
          controller.nodes.run.removeAttribute("aria-busy");
          controller.nodes.run.disabled = controller.render().hasBlockingErrors;
        }
      }
      return;
    }

    if (!hasLegacyJourneyApis()) {
      activeJourney = null;
      controller.announce(copy.apiUnavailable);
      return;
    }
    try {
      transaction = createDemoTransaction(draft);
      renderRows(review, copy.privateReview, [
        [copy.reviewLabels.tenant, draft.context.tenantName],
        [copy.reviewLabels.recipient, transaction.recipientRef],
        [copy.reviewLabels.project, draft.body.project],
        [copy.reviewLabels.revision, transaction.revision],
        [copy.reviewLabels.action, transaction.canonicalAction],
        [copy.reviewLabels.consequence, draft.body.trustNote],
        [copy.reviewLabels.actionMode, transaction.actionMode],
        [copy.reviewLabels.expires, transaction.expiresAt]
      ]);
      reviewMode.textContent = "demo";
      businessEffect.textContent = "none";
      reviewExpiry.textContent = transaction.expiresAt;
      artifactManifest.textContent = "—";
      reviewOutcome.textContent = "—";
      confirm.disabled = false;
      liff.showModal();
    } catch {
      transaction = null;
      activeJourney = null;
      controller.announce(copy.apiUnavailable);
    }
  });

  cancel.addEventListener("click", () => {
    transaction = null;
    designJourney?.clear("cancel");
    activeJourney = null;
    invalidateUiOperations();
    closeReview("cancel");
  });
  liff.addEventListener("cancel", () => {
    transaction = null;
    designJourney?.clear("dialog.cancel");
    activeJourney = null;
    invalidateUiOperations();
  });
  liff.addEventListener("close", () => {
    transaction = null;
    designJourney?.clear("dialog.close");
    activeJourney = null;
    invalidateUiOperations();
    controller.nodes.run.focus();
  });

  confirm.addEventListener("click", async () => {
    if (confirming || !activeJourney) return;
    const operationJourney = activeJourney;
    const operation = beginUiOperation();
    confirming = true;
    setConfirmationBusy(confirm, true);
    try {
      const current = controller.render();
      if (!current.canRunJourney || !current.canExport) {
        throw new Error("validation_blocked");
      }
      if (!hasDialogApis()) throw new Error("browser_api_unavailable");

      if (operationJourney === "design-approval-port") {
        const result = await designJourney.confirm();
        if (!isCurrentUiOperation(operation)) return;
        if (result.status === "cleared") return;
        if (result.outcome !== "sandbox_recorded" &&
            result.outcome !== "sandbox_replayed") {
          showBoundedDesignError(result.message);
          return;
        }
        controller.nodes.receiptTitle.textContent = result.title;
        controller.nodes.receiptDescription.textContent = result.copy.workflowDisclosure;
        controller.nodes.receiptDigestDisclosure.textContent = result.copy.digestDisclosure;
        renderRows(receiptTarget, result.copy.ribbon, result.rows);
        reviewOutcome.textContent = result.outcome;
        closeReview("confirmed");
        receiptDialog.showModal();
        controller.announce(result.copy.ready);
        return;
      }

      if (!transaction || !hasLegacyJourneyApis()) {
        throw new Error("browser_api_unavailable");
      }
      const confirmation = confirmDemoTransaction(transaction, current.draft);
      const receipt = await createDemoReceipt(transaction, confirmation);
      if (!isCurrentUiOperation(operation)) return;
      const copy = COPY[reviewLanguage];
      renderRows(
        receiptTarget,
        copy.receiptRibbon,
        receiptRowsFor(receipt, reviewLanguage)
      );
      receiptTarget.append(make(doc, "p", { text: copy.productionNotice }));
      transaction = null;
      closeReview("confirmed");
      receiptDialog.showModal();
      controller.announce(copy.receiptReady);
    } catch (error) {
      if (!isCurrentUiOperation(operation)) return;
      transaction = null;
      designJourney?.clear("controller.error");
      const message = operationJourney === "design-approval-port" ?
        designApprovalErrorCopyFor("temporarily_unavailable", reviewLanguage) :
        errorCopy(error);
      if (operationJourney === "design-approval-port") {
        showBoundedDesignError(message);
      } else {
        reviewOutcome.textContent = message;
        controller.announce(message);
        closeReview("rejected");
      }
    } finally {
      if (isCurrentUiOperation(operation)) {
        confirming = false;
        setConfirmationBusy(confirm, false);
        if (!activeJourney) confirm.disabled = true;
      }
    }
  });

  closeReceipt.addEventListener("click", () => {
    if (receiptDialog.open && typeof receiptDialog.close === "function") receiptDialog.close();
    else controller.nodes.run.focus();
  });
  receiptDialog.addEventListener("close", () => controller.nodes.run.focus());
  resetReviewSurface();
  confirm.disabled = true;
  return { clearForStudioChange };
}

function installResponsiveTabs(doc) {
  const panes = [
    ["editor", doc.querySelector(".editor-pane"), "Editor", "แก้ไข"],
    ["preview", doc.querySelector(".preview-pane"), "Preview", "ตัวอย่าง"],
    ["code", doc.querySelector(".code-pane"), "JSON & Validation", "JSON และตรวจสอบ"]
  ];
  let active = "editor";
  const tabButtons = [];
  const tabs = make(doc, "nav", {
    attributes: {
      "data-mobile-tabs": "", role: "tablist", "aria-label": "Studio panes"
    }
  });
  const media = typeof doc.defaultView.matchMedia === "function" ?
    doc.defaultView.matchMedia("(max-width: 720px)") : { matches: false };
  const apply = () => {
    const mobile = media.matches;
    for (const [id, pane] of panes) pane.hidden = mobile && id !== active;
    for (const button of tabs.querySelectorAll("[role=tab]")) {
      const selected = button.dataset.pane === active;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };
  for (const [id, pane, en, th] of panes) {
    pane.id ||= "pane-" + id;
    pane.tabIndex = -1;
    const tabId = "pane-tab-" + id;
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", tabId);
    const button = make(doc, "button", {
      text: doc.documentElement.lang === "th" ? th : en,
      attributes: {
        type: "button", role: "tab", id: tabId, "data-pane": id,
        "data-label-en": en, "data-label-th": th,
        "aria-controls": pane.id, "aria-selected": id === active
      }
    });
    button.addEventListener("click", () => {
      active = id;
      apply();
      pane.focus({ preventScroll: true });
    });
    button.addEventListener("keydown", (event) => {
      const index = panes.findIndex(([paneId]) => paneId === id);
      const next = navigatedIndex(event.key, index, panes.length);
      if (next === null) return;
      event.preventDefault();
      active = panes[next][0];
      apply();
      tabButtons[next].focus();
    });
    tabButtons.push(button);
    tabs.append(button);
  }
  doc.getElementById("studio-main").before(tabs);
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", apply);
  } else if (typeof media.addListener === "function") {
    media.addListener(apply);
  }
  apply();
}

export function bindStudio(doc, options = {}) {
  let state = createInitialStudioState();
  let journeyBinding = null;
  const byId = (id) => doc.getElementById(id);
  const nodes = {
    language: byId("language-toggle"), tenant: byId("tenant-context"),
    presets: byId("preset-list"), blocks: byId("block-tabs"), fields: byId("field-panel"),
    preview: byId("phone-preview"), json: byId("json-output"),
    findings: byId("validation-list"), count: byId("payload-count"),
    copy: byId("copy-json"), download: byId("download-json"),
    reset: byId("reset-draft"), run: byId("run-journey"), toast: byId("toast-live"),
    editorTitle: byId("editor-title"), previewTitle: byId("preview-title"),
    jsonTitle: byId("json-title"), validationTitle: byId("validation-title"),
    liffTitle: byId("liff-title"), receiptTitle: byId("receipt-title"),
    liffDescription: byId("liff-description"),
    receiptDescription: byId("receipt-description"),
    receiptDigestDisclosure: byId("receipt-digest-disclosure"),
    cancel: byId("cancel-journey"), confirm: byId("confirm-journey"),
    closeReceipt: byId("close-receipt"), skip: doc.querySelector(".skip-link")
  };

  const announce = (message) => {
    nodes.toast.textContent = "";
    doc.defaultView.setTimeout(() => {
      nodes.toast.textContent = message;
    }, 0);
  };
  const dispatch = (event) => {
    if (shouldClearDesignApprovalReview(event.type)) {
      journeyBinding?.clearForStudioChange(event.type);
    }
    state = reduceStudioState(state, event);
    render(event.type !== "field.changed");
  };

  function renderPresets() {
    const buttons = PRESET_IDS.map((id) => {
      const item = createDraft(getPreset(id), state.language);
      const button = make(doc, "button", {
        className: "preset-card", text: item.header.title,
        attributes: { type: "button", "aria-pressed": id === state.presetId }
      });
      button.append(make(doc, "small", {
        text: COPY[state.language].audiences[item.context.audience] ?? item.context.audience
      }));
      button.addEventListener("click", () => {
        dispatch({ type: "preset.changed", presetId: id });
      });
      return button;
    });
    nodes.presets.replaceChildren(...buttons);
  }

  function renderBlocks() {
    nodes.fields.setAttribute("role", "tabpanel");
    nodes.fields.setAttribute("aria-labelledby", "block-tab-" + state.activeBlock);
    nodes.blocks.replaceChildren(...BLOCKS.map((block, index) => {
      const selected = block === state.activeBlock;
      const button = make(doc, "button", {
        className: "block-tab", text: COPY[state.language].blocks[index],
        attributes: {
          type: "button", role: "tab", id: "block-tab-" + block,
          "aria-selected": selected, "aria-controls": "field-panel",
          tabindex: selected ? "0" : "-1"
        }
      });
      const activate = () => {
        dispatch({ type: "block.changed", block });
        doc.getElementById("block-tab-" + block)?.focus();
      };
      button.addEventListener("click", activate);
      button.addEventListener("keydown", (event) => {
        const next = navigatedIndex(event.key, index, BLOCKS.length);
        if (next === null) return;
        event.preventDefault();
        const nextBlock = BLOCKS[next];
        dispatch({ type: "block.changed", block: nextBlock });
        doc.getElementById("block-tab-" + nextBlock)?.focus();
      });
      return button;
    }));
  }

  function renderFields() {
    const controls = FIELDS[state.activeBlock].map(([path, en, th]) => {
      const wrapper = make(doc, "div", { className: "field-control" });
      const id = "field-" + path.replaceAll(".", "-");
      const label = make(doc, "label", {
        text: state.language === "th" ? th : en,
        attributes: { for: id }
      });
      const multiline = ["summary", "trustNote", "altText"].some((name) =>
        path.endsWith(name));
      const control = make(doc, multiline ? "textarea" : "input", {
        attributes: { id, name: path, "data-path": path }
      });
      control.value = valueAt(state.draft, path);
      control.addEventListener("input", () => {
        dispatch({
          type: "field.changed", path: pathParts(path), value: control.value
        });
      });
      wrapper.append(label, control);
      return wrapper;
    });
    const grid = make(doc, "div", { className: "field-grid" });
    grid.append(...controls);
    nodes.fields.replaceChildren(grid);
  }

  function focusField(field) {
    const target = [...nodes.fields.querySelectorAll("[data-path]")]
      .find((control) => control.dataset.path === field);
    target?.focus();
  }

  function renderFindings(view) {
    nodes.findings.replaceChildren(...view.findings.map((finding) => {
      const item = make(doc, "li", {
        className: "finding", attributes: { "data-severity": finding.severity }
      });
      addText(doc, item, "finding-title", finding.title);
      addText(doc, item, "finding-meta", finding.ruleId + " · " + finding.classification);
      addText(doc, item, "finding-copy", finding.explanation + " " + finding.remediation);
      const source = make(doc, "a", {
        text: "Source",
        attributes: { href: finding.sourceUrl, target: "_blank", rel: "noreferrer" }
      });
      item.append(source);
      if (finding.severity === "error") {
        const fix = make(doc, "button", {
          text: COPY[state.language].fix, attributes: { type: "button" }
        });
        fix.addEventListener("click", () => {
          dispatch({ type: "block.changed", block: finding.block });
          focusField(finding.field);
        });
        item.append(fix);
      }
      return item;
    }));
  }

  function render(rebuildControls = true) {
    const view = deriveStudioView(state);
    const copy = COPY[state.language];
    doc.documentElement.lang = state.language;
    nodes.language.textContent = state.language === "th" ? "TH / EN" : "EN / TH";
    nodes.language.setAttribute("aria-pressed", String(state.language === "en"));
    nodes.language.setAttribute("aria-label", copy.languageLabel);
    nodes.tenant.textContent = state.draft.context.tenantName + " · " +
      state.draft.context.platformMark;
    nodes.presets.setAttribute("aria-label", copy.presetLabel);
    nodes.blocks.setAttribute("aria-label", copy.blockLabel);
    nodes.editorTitle.textContent = copy.editorTitle;
    nodes.previewTitle.textContent = copy.previewTitle;
    nodes.jsonTitle.textContent = copy.jsonTitle;
    nodes.validationTitle.textContent = copy.validationTitle;
    const journey = selectStudioJourney(state.presetId);
    if (journey === "design-approval-port") {
      const reviewCopy = designApprovalReviewCopyFor(state.language);
      const receiptCopy = designApprovalReceiptCopyFor(state.language);
      nodes.liffTitle.textContent = reviewCopy.title;
      nodes.liffDescription.textContent = reviewCopy.description;
      nodes.receiptTitle.textContent = receiptCopy.title;
      nodes.receiptDescription.textContent = receiptCopy.workflowDisclosure;
      nodes.receiptDigestDisclosure.textContent = receiptCopy.digestDisclosure;
      nodes.confirm.textContent = reviewCopy.confirm;
    } else {
      nodes.liffTitle.textContent = copy.liffTitle;
      nodes.liffDescription.textContent = copy.liffDescription;
      nodes.receiptTitle.textContent = copy.receiptTitle;
      nodes.receiptDescription.textContent = copy.receiptDescription;
      nodes.receiptDigestDisclosure.textContent = copy.digestDisclosure;
      nodes.confirm.textContent = copy.confirm;
    }
    nodes.cancel.textContent = copy.cancel;
    nodes.closeReceipt.textContent = copy.close;
    nodes.skip.textContent = copy.skip;
    if (rebuildControls) {
      renderPresets();
      renderBlocks();
      renderFields();
    }
    renderPreview(doc, nodes.preview, state.draft);
    nodes.json.textContent = view.jsonText;
    const byteState = view.payloadBytes > 30 * 1024 ? "error" :
      view.payloadBytes > 24 * 1024 ? "warning" : "safe";
    const byteCopy = byteState === "error" ? copy.hardBytes :
      byteState === "warning" ? copy.softBytes : copy.safeBytes;
    nodes.count.textContent = view.payloadBytes.toLocaleString(state.language) + " " +
      copy.bytes + " · " + byteCopy;
    nodes.count.setAttribute("data-state", byteState);
    renderFindings(view);
    for (const control of nodes.fields.querySelectorAll("[data-path]")) {
      control.setAttribute("aria-invalid", String(view.findings.some((finding) =>
        finding.severity === "error" && finding.field === control.dataset.path)));
    }
    nodes.run.textContent = copy.run;
    nodes.copy.textContent = copy.copyJson;
    nodes.download.textContent = copy.downloadJson;
    nodes.reset.textContent = copy.resetDraft;
    for (const tab of doc.querySelectorAll("[data-mobile-tabs] [role=tab]")) {
      tab.textContent = state.language === "th" ? tab.dataset.labelTh : tab.dataset.labelEn;
    }
    const paneTabs = doc.querySelector("[data-mobile-tabs]");
    paneTabs?.setAttribute("aria-label", copy.paneLabel);
    for (const button of [nodes.copy, nodes.download, nodes.run]) {
      button.disabled = view.hasBlockingErrors;
    }
    return view;
  }

  nodes.language.addEventListener("click", () => {
    dispatch({
      type: "language.changed", language: state.language === "th" ? "en" : "th"
    });
  });

  nodes.copy.addEventListener("click", async () => {
    const view = deriveStudioView(state);
    if (!view.canExport) {
      announce(COPY[state.language].blocked);
      return;
    }
    try {
      const clipboard = doc.defaultView.navigator.clipboard;
      if (typeof clipboard?.writeText !== "function") throw new Error("clipboard_unavailable");
      await clipboard.writeText(view.jsonText);
      announce(COPY[state.language].copied);
    } catch {
      announce(COPY[state.language].copyFailed);
    }
  });

  nodes.download.addEventListener("click", () => {
    const view = deriveStudioView(state);
    if (!view.canExport) {
      announce(COPY[state.language].blocked);
      return;
    }
    let url = null;
    try {
      const BlobConstructor = doc.defaultView.Blob;
      const URLApi = doc.defaultView.URL;
      if (typeof BlobConstructor !== "function" ||
          typeof URLApi?.createObjectURL !== "function" ||
          typeof URLApi?.revokeObjectURL !== "function") {
        throw new Error("download_unavailable");
      }
      const blob = new BlobConstructor([view.jsonText], { type: "application/json" });
      url = URLApi.createObjectURL(blob);
      const anchor = make(doc, "a", {
        attributes: {
          href: url,
          download: "monolith-" + state.presetId + ".json",
          hidden: ""
        }
      });
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      announce(COPY[state.language].downloaded);
    } catch {
      announce(COPY[state.language].downloadFailed);
    } finally {
      if (url) {
        doc.defaultView.setTimeout(() => doc.defaultView.URL.revokeObjectURL(url), 0);
      }
    }
  });

  nodes.reset.addEventListener("click", () => {
    if (isStudioDraftDirty(state)) {
      const confirmReset = doc.defaultView.confirm;
      if (typeof confirmReset !== "function") {
        announce(COPY[state.language].resetUnavailable);
        return;
      }
      if (!confirmReset.call(doc.defaultView, COPY[state.language].resetPrompt)) return;
    }
    dispatch({ type: "draft.reset" });
    announce(COPY[state.language].reset);
  });

  const controller = { getState: () => state, dispatch, render, announce, nodes };
  journeyBinding = installJourney(doc, controller, options.designApprovalPort);
  installResponsiveTabs(doc);
  render();
  return controller;
}

if (typeof document !== "undefined") {
  bindStudio(document, {
    designApprovalPort: createSandboxDesignApprovalPort()
  });
}

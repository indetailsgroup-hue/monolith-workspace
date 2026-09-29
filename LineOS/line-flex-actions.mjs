import { canonicalize, deepFreeze } from "./line-flex-model.mjs";

const ACTION_MODES = new Set(["message", "postback", "uri", "liff_uri"]);
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_DATE_MILLISECONDS = 8.64e15;
const transactionSnapshots = new WeakMap();
const confirmationSnapshots = new WeakMap();

const parseTime = (value, errorMessage) => {
  if (typeof value !== "string" || !CANONICAL_UTC_TIMESTAMP.test(value)) {
    throw new Error(errorMessage);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(errorMessage);
  }
  return milliseconds;
};

export function selectActionMode(intent) {
  if (intent?.risk !== "low" || !ACTION_MODES.has(intent.requestedActionType)) {
    return "liff_uri";
  }
  return intent.requestedActionType;
}

const digestInputFor = (draft) => ({
  tenantId: draft.context.tenantId,
  providerName: draft.context.tenantName,
  recipientRef: draft.context.recipientRef,
  targetRef: draft.intent.targetRef,
  revision: draft.body.revision,
  canonicalAction: draft.intent.canonicalAction,
  amount: draft.body.amount,
  deadline: draft.body.deadline
});

export function createDemoTransaction(draft, options = {}) {
  const createdAtMilliseconds = parseTime(
    options.now ?? new Date().toISOString(), "invalid_created_at"
  );
  const ttl = draft.intent.expiresInMinutes;
  if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("invalid_transaction_ttl");
  }
  const expiresAtMilliseconds = createdAtMilliseconds + ttl * 60_000;
  if (!Number.isFinite(expiresAtMilliseconds) ||
      Math.abs(expiresAtMilliseconds) > MAX_DATE_MILLISECONDS) {
    throw new Error("invalid_transaction_ttl");
  }
  const createdAt = new Date(createdAtMilliseconds).toISOString();
  const expiresAt = new Date(expiresAtMilliseconds).toISOString();
  const input = digestInputFor(draft);
  const transaction = deepFreeze({
    id: options.id ?? crypto.randomUUID(),
    ...input,
    actionMode: selectActionMode(draft.intent),
    createdAt,
    expiresAt,
    boundPayload: canonicalize(input)
  });
  transactionSnapshots.set(transaction, deepFreeze(structuredClone(transaction)));
  return transaction;
}

export function confirmDemoTransaction(transaction, currentDraft, now = new Date().toISOString()) {
  const nowMilliseconds = parseTime(now, "invalid_confirmation_time");
  parseTime(transaction?.expiresAt, "invalid_transaction_expiry");
  const snapshot = transactionSnapshots.get(transaction);
  if (!snapshot) throw new Error("unknown_transaction");
  if (canonicalize(transaction) !== canonicalize(snapshot)) {
    throw new Error("transaction_tampered");
  }
  const expiresAtMilliseconds = parseTime(snapshot.expiresAt, "invalid_transaction_expiry");
  if (nowMilliseconds > expiresAtMilliseconds) {
    throw new Error("transaction_expired");
  }
  const current = canonicalize(digestInputFor(currentDraft));
  if (current !== snapshot.boundPayload) throw new Error("bound_value_changed");
  const confirmation = deepFreeze({
    transactionId: snapshot.id,
    tenantId: snapshot.tenantId,
    providerName: snapshot.providerName,
    recipientRef: snapshot.recipientRef,
    targetRef: snapshot.targetRef,
    revision: snapshot.revision,
    canonicalAction: snapshot.canonicalAction,
    amount: snapshot.amount,
    deadline: snapshot.deadline,
    confirmedAt: new Date(nowMilliseconds).toISOString(),
    outcome: "confirmed_demo"
  });
  confirmationSnapshots.set(confirmation, {
    transaction,
    payload: deepFreeze(structuredClone(confirmation))
  });
  return confirmation;
}

export function getDemoReceiptBinding(transaction, confirmation) {
  const transactionSnapshot = transactionSnapshots.get(transaction);
  if (!transactionSnapshot) throw new Error("unknown_transaction");
  if (canonicalize(transaction) !== canonicalize(transactionSnapshot)) {
    throw new Error("transaction_tampered");
  }
  const confirmationSnapshot = confirmationSnapshots.get(confirmation);
  if (!confirmationSnapshot) throw new Error("unknown_confirmation");
  if (confirmationSnapshot.transaction !== transaction) {
    throw new Error("transaction_confirmation_mismatch");
  }
  if (canonicalize(confirmation) !== canonicalize(confirmationSnapshot.payload)) {
    throw new Error("confirmation_tampered");
  }
  const confirmed = confirmationSnapshot.payload;
  const expected = canonicalize({
    transactionId: transactionSnapshot.id,
    tenantId: transactionSnapshot.tenantId,
    providerName: transactionSnapshot.providerName,
    recipientRef: transactionSnapshot.recipientRef,
    targetRef: transactionSnapshot.targetRef,
    revision: transactionSnapshot.revision,
    canonicalAction: transactionSnapshot.canonicalAction,
    amount: transactionSnapshot.amount,
    deadline: transactionSnapshot.deadline
  });
  const actual = canonicalize({
    transactionId: confirmed.transactionId,
    tenantId: confirmed.tenantId,
    providerName: confirmed.providerName,
    recipientRef: confirmed.recipientRef,
    targetRef: confirmed.targetRef,
    revision: confirmed.revision,
    canonicalAction: confirmed.canonicalAction,
    amount: confirmed.amount,
    deadline: confirmed.deadline
  });
  if (actual !== expected) throw new Error("transaction_confirmation_mismatch");
  return {
    ...structuredClone(confirmed),
    createdAt: transactionSnapshot.createdAt
  };
}

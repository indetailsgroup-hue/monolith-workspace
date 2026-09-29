import { canonicalize, deepFreeze } from "./line-flex-model.mjs";
import { getDemoReceiptBinding } from "./line-flex-actions.mjs";

const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function createDemoReceipt(transaction, confirmation) {
  const binding = getDemoReceiptBinding(transaction, confirmation);
  const payload = {
    receiptVersion: 1,
    transactionId: binding.transactionId,
    tenantId: binding.tenantId,
    providerName: binding.providerName,
    recipientRef: binding.recipientRef,
    targetRef: binding.targetRef,
    revision: binding.revision,
    canonicalAction: binding.canonicalAction,
    amount: binding.amount,
    deadline: binding.deadline,
    createdAt: binding.createdAt,
    confirmedAt: binding.confirmedAt,
    outcome: binding.outcome
  };
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digest = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  return deepFreeze({
    title: "Verification Receipt — Demo",
    label: "DEMO — NOT A PRODUCTION SIGNATURE",
    platform: "MONOLITH",
    ...payload,
    digest,
    productionNotice: "Production signing and audit require the MONOLITH Trust Kernel."
  });
}

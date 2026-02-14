/**
 * factoryReceiptTypes.ts - Factory Receipt Types
 *
 * Defines the data structures for factory acceptance/rejection receipts.
 * Receipts are signed by factory inspectors and appended to the manifest chain.
 *
 * @version 1.0.0
 */

/**
 * Factory receipt - the inspector's verdict on a job
 */
export interface FactoryReceipt {
  /** Job ID this receipt applies to */
  jobId: string;
  /** Inspector's verdict */
  verdict: 'ACCEPTED' | 'REJECTED';
  /** Factory station ID */
  stationId?: string;
  /** Inspector's note */
  note?: string;
  /** Inspector identifier */
  inspector?: string;
  /** Head manifest hash at time of inspection */
  headManifestHashHex?: string;
  /** When receipt was issued */
  acceptedAtIso?: string;
  /** Reject reasons (if verdict = REJECTED) */
  rejectReasons?: RejectReason[];
}

/**
 * Reason for rejection
 */
export interface RejectReason {
  /** Reason code */
  code: string;
  /** Human-readable description */
  message: string;
  /** Severity */
  severity: 'ERROR' | 'WARNING';
}

/**
 * Signed factory receipt with cryptographic proof
 */
export interface SignedFactoryReceipt {
  /** SHA-256 hash of receipt content */
  receiptHashHex: string;
  /** The receipt data */
  receipt: FactoryReceipt;
  /** Ed25519/HMAC signature hex */
  signatureHex: string;
  /** Key ID used for signing */
  keyId?: string;
}

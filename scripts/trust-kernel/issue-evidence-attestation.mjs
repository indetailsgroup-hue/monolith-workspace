#!/usr/bin/env node
/**
 * issue-evidence-attestation.mjs — the CI "evidence self-verify" step (design §16.4).
 *
 * Writes an EvidenceAttestation PROOF report (`{ verified: true|false, reason }`) that
 * the FINAL gate reads. The gate demands `verified === true`; the mere success of the
 * evidence job (e.g. because signer env is PRESENT) is explicitly NOT a passed gate
 * (C3). This step therefore:
 *
 *   - refuses (verified:false, exit 1) when EVIDENCE_SIGNER_URL / EVIDENCE_SIGNER_KEY_ID /
 *     EVIDENCE_VERIFY_URL are not all configured — presence of NONE of them, and even
 *     presence of SOME, cannot manufacture a pass;
 *   - in this NOT_FOR_PRODUCTION shadow there is no real managed evidence signer +
 *     verify endpoint wired, so it writes verified:false and FAILS CLOSED. A
 *     Shadow-Trust-Ready pass requires a real, SEPARATE evidence key and verify endpoint
 *     that returns a cryptographically verified attestation here.
 *
 * A real signer integration replaces the marked block below with an actual
 * issueEvidenceAttestation(...) call over the managed signer + verifier ports, writing
 * verified:true ONLY on a real verified signature.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import fs from 'node:fs';
import path from 'node:path';

const outPath = process.argv[2] || 'reports/evidence-attestation.json';
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });

function write(report) {
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

const signerUrl = process.env.EVIDENCE_SIGNER_URL;
const signerKeyId = process.env.EVIDENCE_SIGNER_KEY_ID;
const verifyUrl = process.env.EVIDENCE_VERIFY_URL;

if (!signerUrl || !signerKeyId || !verifyUrl) {
  write({
    schema: 'EvidenceAttestationV1',
    verified: false,
    reason:
      'FAIL CLOSED: EVIDENCE_SIGNER_URL / EVIDENCE_SIGNER_KEY_ID / EVIDENCE_VERIFY_URL are not all configured. ' +
      'A Shadow-Trust-Ready pass requires a real, SEPARATE evidence key + verify endpoint (design §16.4). ' +
      'Presence of signer env is not a passed gate.',
  });
  console.error('::error::evidence self-verification FAILED CLOSED: signer/verify endpoints not fully configured.');
  process.exit(1);
}

// --- BEGIN real-signer integration point -------------------------------------
// In this shadow phase no real managed evidence signer + verify endpoint is wired,
// so we CANNOT produce a cryptographically verified attestation. Write verified:false
// and fail closed rather than fake a pass.
write({
  schema: 'EvidenceAttestationV1',
  verified: false,
  reason:
    'UNVERIFIED (shadow): a real managed EVIDENCE signer + verify endpoint is not wired in CI. ' +
    'issueEvidenceAttestation + verifyEvidenceAttestation must run against the real separate evidence key ' +
    'and return a cryptographically verified attestation before this reads verified:true (design §16.4).',
  signerKeyIdConfigured: signerKeyId,
});
console.error('::error::evidence self-verification UNVERIFIED (shadow): no real signer/verify endpoint; failing closed.');
process.exit(1);
// --- END real-signer integration point ---------------------------------------

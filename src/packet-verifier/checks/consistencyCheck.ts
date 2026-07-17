// S17-5 check 7 — identity consistency (§12.7): the identity duplicated across
// attestation ↔ manifest ↔ gate evidence must agree field-for-field. Any
// disagreement is PKT_IDENTITY_MISMATCH; gate-evidence disagreement gets its
// own stable code PKT_GATE_EVIDENCE_MISMATCH (§13).

import type { PacketManifest, PacketAttestation } from '../shapes/shapes';
import type { CheckOutcome } from './identityChecks';

export function checkIdentityConsistency(
  manifest: PacketManifest,
  attestation: PacketAttestation,
): CheckOutcome {
  const mismatch = (detail: string): CheckOutcome => ({ ok: false, code: 'PKT_IDENTITY_MISMATCH', detail });

  // packetSchema (attestation) ↔ schema (manifest)
  if (attestation.packetSchema !== manifest.schema) {
    return mismatch('attestation.packetSchema != manifest.schema');
  }

  // releasedRevision — all three fields
  const mr = manifest.releasedRevision;
  const ar = attestation.releasedRevision;
  if (ar.projectId !== mr.projectId || ar.revisionId !== mr.revisionId || ar.state !== mr.state) {
    return mismatch('releasedRevision differs between attestation and manifest');
  }

  // machineProfile — id + version + digest (all three bind the signed identity)
  const mp = manifest.machineProfile;
  const ap = attestation.machineProfile;
  if (ap.id !== mp.id || ap.version !== mp.version || ap.sha256 !== mp.sha256) {
    return mismatch('machineProfile differs between attestation and manifest');
  }

  // exporter — id + version + buildCommit + artifactSha256
  const me = manifest.exporter;
  const ae = attestation.exporter;
  if (ae.id !== me.id || ae.version !== me.version || ae.buildCommit !== me.buildCommit || ae.artifactSha256 !== me.artifactSha256) {
    return mismatch('exporter differs between attestation and manifest');
  }

  // gate evidence — the attested gate file must be a manifest-listed payload
  // whose recorded digest equals the attested evidence digest (§8.1/§12.7).
  const gate = attestation.gate;
  const evidence = manifest.files.find((f) => f.path === gate.evidenceFile);
  if (evidence === undefined) {
    return {
      ok: false,
      code: 'PKT_GATE_EVIDENCE_MISMATCH',
      detail: `gate evidence file ${gate.evidenceFile} is not a manifest-listed payload`,
    };
  }
  if (gate.evidenceSha256 !== 'sha256:' + evidence.sha256) {
    return {
      ok: false,
      code: 'PKT_GATE_EVIDENCE_MISMATCH',
      detail: 'attested gate.evidenceSha256 does not match the manifest-listed digest',
    };
  }
  return { ok: true };
}

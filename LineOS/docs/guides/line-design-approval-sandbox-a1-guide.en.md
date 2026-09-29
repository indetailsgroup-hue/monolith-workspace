# MONOLITH LINE Design Approval Sandbox A1 — Operating Guide

- Status: approved A1 sandbox operating guidance
- Edition: English
- Applies to: the standalone LineOS Design Approval journey
- Design authority: [approved A1 design specification](../superpowers/specs/2026-08-02-monolith-line-design-approval-port-a1-design.en.md)
- Execution authority: [approved A1 implementation plan](../superpowers/plans/2026-08-02-monolith-line-design-approval-port-a1-implementation.en.md)

> Human Surface contract-ready with sandbox adapter — not connected to MONOLITH runtime.

## 1. Purpose and truthful result

This guide covers the A1 Trust Concierge rehearsal for a design revision. The operator opens an adapter-owned private review, inspects the revision and consequence, records a sandbox confirmation attempt, and reads the bounded verification record.

A1 is a local contract harness. It exercises review, expiry, stale-revision, idempotency, and record semantics while keeping real identity, permission, revision authority, workflow, signing, and audit effects with the MONOLITH product boundary.

## 2. A1 routing and token boundary

Only the `design-approval` preset routes through the A1 `DesignApprovalPort`; the other four presets keep the legacy local demo journey.

The A1 review token is opaque and non-secret; it carries no customer, tenant, role, recipient, project, or authorization claim.

The token selects a bounded sandbox fixture. It is not a LINE ID token, access token, credential, permission, tenant identifier, or business command. Editable Flex fields remain invitation and display content. They cannot replace the snapshot returned by `openReview(reviewToken)`.

## 3. Start the local rehearsal

From the parent repository root, serve LineOS through localhost:

```powershell
python -m http.server 4177 --directory LineOS
```

Open `http://localhost:4177/line-flex-studio.html`, then:

1. select English or Thai;
2. select the `design-approval` preset;
3. resolve every blocking validation error;
4. inspect the Flex preview and generated JSON;
5. choose **Run Journey** to open the private sandbox review.

Keep production credentials, personal data, channel secrets, channel access tokens, and LINE identity tokens out of the draft, URL, JSON, logs, screenshots, and browser storage.

## 4. Inspect the adapter-owned review

The private dialog must keep `SANDBOX — NO BUSINESS EFFECT` visible. Before confirmation, compare these adapter-owned values:

| Review value | Operator check |
|---|---|
| Mode and effect | `mode: sandbox` and `businessEffect: none` |
| Provider context | Display provenance only |
| Work item and approval request | Opaque sandbox references |
| Revision | Revision label and adapter-owned revision content hash |
| Artifact manifest | SHA-256 digest for the bound review artifacts |
| Requested action | Canonical action and plain-language consequence |
| Time boundary | Issue time and expiry |

`providerContext` is display provenance only; it is not tenant authority and must not be read as a tenant assertion.

Cancel if the revision, artifact digest, consequence, or expiry is unexpected. A successful open is not authorization for a future product confirmation.

## 5. Confirm one sandbox attempt

Choose **Confirm sandbox attempt** only after the adapter-owned values match the intended rehearsal. The browser returns only the review session, adapter-issued idempotency key, expected revision, and `decision: confirm`.

The disabled/busy button is a UX guard. The adapter owns duplicate suppression. Within the same session, the same key and canonical payload return the same record; a changed payload with the same key returns `idempotency_conflict`.

| Outcome | Safe operator response |
|---|---|
| `sandbox_recorded` or `sandbox_replayed` | Read the bounded record and retain only approved review notes. |
| `expired` | Start a new review. |
| `stale_revision` | Open the latest revision; do not reuse the old snapshot. |
| `version_conflict` | Start a new sandbox review to load the adapter-owned current snapshot; no MONOLITH workflow is queried. |
| `idempotency_conflict` | Stop and use the correlation ID for investigation. |
| `unauthorized` or `not_available` | Keep the neutral message; do not infer another customer's or scope's data. |
| `invalid_request` or `temporarily_unavailable` | Start from the bounded message and retry only as instructed. |

## 6. Read the sandbox record

The fixed record title is:

> **Sandbox Verification Record — Demo · No Business Effect**

Verify the record shows sandbox mode, no business effect, bounded references, revision and manifest digests, requested action, outcome, timestamps, canonicalization version, correlation ID, and record digest.

A1 performs no workflow mutation, sends no LINE message, writes no database record, creates no cryptographic signature, and makes no production audit claim.

The SHA-256 digest is integrity metadata for the sandbox record. It is not a signature, verified-signer status, LINE delivery receipt, workflow decision, tenant assertion, or MONOLITH audit record.

## 7. Session-only reset limitation

The A1 ledger is session-only: reload or browser restart may reset it, so replay guarantees do not survive that reset.

Switching preset or language, editing a field, resetting the draft, cancelling, or closing the dialog also clears the active review. Start again and inspect the newly issued snapshot rather than reusing copied session values.

## 8. Operator completion checklist

Before closing the rehearsal, confirm:

- the selected preset was `design-approval`;
- the sandbox warning stayed visible in the review and record;
- the review values came from the adapter-owned snapshot;
- the revision and artifact digest matched the intended rehearsal;
- the result used the exact sandbox record title;
- the record was described as integrity metadata, not a signature or audit artifact;
- the session-only reset limitation was understood;
- any copied or downloaded local artifacts are handled under the approved retention rule.

The defensible result is contract evidence for A1 only. It is not runtime integration, production readiness, customer delivery, or approval authority.

## 9. Future A2 promotion gates

A2 promotion requires separate owner approval and all seven gates below; passing A1 alone does not authorize runtime integration.

1. `A1 contract and browser evidence` pass with fresh results.
2. A `canonical server-owned revision source` and persistence path are approved.
3. The `tenant–organization–site mapping` is approved, or the slice is explicitly bounded to a non-tenant scope model.
4. `customer-design-view database contract tests` exist and pass locally, including allowlisting and denial paths.
5. A `narrow LIFF confirmation transport design` passes security review and reuses the existing product boundary.
6. `rollback, idempotency, audit, and error semantics` are proven for the runtime path.
7. `local environment and secret-handling authority` are approved.

A2 must reuse the existing design-view and customer-approval substrate. The rejected generic integration gateway remains outside this promotion path.

## Official sources

Retrieved 2026-08-02:

- [Messaging API actions](https://developers.line.biz/en/docs/messaging-api/actions/)
- [Adding a LIFF app](https://developers.line.biz/en/docs/liff/registering-liff-apps/)
- [Developing a LIFF app](https://developers.line.biz/en/docs/liff/developing-liff-apps/)
- [LIFF API reference](https://developers.line.biz/en/reference/liff/)

# S17 Hosted Auth and Staging Evidence Package

Package version: 1.0

Prepared: 2026-07-12

Status: **Human/Ops execution package — not deployment authority**

> The script does not deploy an Edge function or apply a migration. When Human/Ops runs it, it creates and transitions one synthetic staging job, so execution is a state-changing staging action and requires explicit human approval. Never run it against production.

## 1. Purpose

This package collects the remaining hosted evidence gate for the S17-1/S17-2 implementation candidate:

- real, valid Designer JWT returns `200`
- genuinely expired JWT returns `401`
- valid user with no recognized `app_metadata.roles` returns `403`
- forged `x-actor-role: DESIGNER` cannot give a Factory principal transition permission and leaves the job DRAFT
- INSTALLER can read state but receives `403` for activity
- FROZEN packet upload, export, and verify each return `409`
- valid Designer can release to RELEASED
- release activity stores `actorName = actorSubjectId = verified JWT sub`, not email

The script stores no JWT, API key, raw activity body, email, or plaintext subject ID in its evidence JSON. It stores SHA-256 subject anchors and limited response fields.

## 2. Preconditions owned by Human/Ops

- independent review has accepted the exact source candidate
- the target is an isolated hosted **staging/test** Supabase project, never production
- backup, abort owner, maintenance window, and approval are recorded
- migration 0162 has been applied successfully to staging
- the reviewed `factory-api` commit has been deployed to staging
- PostgREST schema cache and Auth are healthy
- five staging tokens are available through a secret manager/environment variables:
  - active Designer (`app_metadata.roles` includes `designer`)
  - active Factory (`factory_operator` or `factory`)
  - active Installer (`installer`)
  - active no-role user (no recognized Factory role)
  - a **real token whose `exp` is already in the past**; a corrupted token is not an equivalent test

The operator must verify the deployed commit independently. Passing the script while another commit is deployed is invalid evidence.

## 3. Human deployment sequence

The as-built migration and final Edge function do not support a zero-downtime binary order: the final function needs the new RPC signatures, while migration 0162 removes the old signatures. Use the approved maintenance sequence from the client compatibility checklist:

1. stop Factory mutations and confirm the staging target, backup, and abort owner
2. inspect `supabase migration list` and ensure 0162 is the only intended pending Factory migration
3. run and review `supabase db push --dry-run` against the linked staging project
4. with explicit approval, run `supabase db push` to apply 0162 to staging
5. deploy the reviewed function with `supabase functions deploy factory-api`
6. verify the deployed target/commit, then run this evidence script
7. keep staging traffic closed if any case fails; archive the redacted evidence and platform run/deploy logs

These are operator commands, not authorization. Project linking, push, and deploy must be performed by Human/Ops, not the AI implementer.

## 4. Secret-safe setup

Set values in the operator process from the approved secret store. Do not paste JWTs into chat, commit them, place them in command history, or include them in evidence:

```powershell
$env:S17_FACTORY_API_BASE_URL = 'https://<STAGING-REF>.supabase.co/functions/v1/factory-api'
$env:S17_SUPABASE_ANON_KEY = '<STAGING-ANON-KEY>'
$env:S17_DESIGNER_JWT = '<ACTIVE-DESIGNER-JWT>'
$env:S17_FACTORY_JWT = '<ACTIVE-FACTORY-JWT>'
$env:S17_INSTALLER_JWT = '<ACTIVE-INSTALLER-JWT>'
$env:S17_NO_ROLE_JWT = '<ACTIVE-NO-ROLE-JWT>'
$env:S17_EXPIRED_JWT = '<GENUINELY-EXPIRED-STAGING-JWT>'
$env:S17_TARGET_LABEL = 'monolith-staging'
$env:S17_EXPECTED_COMMIT = '<FULL-40-HEX-DEPLOYED-COMMIT>'
$env:S17_EXPECTED_MIGRATION_SHA256 = '<LOWERCASE-SHA256-OF-0162>'
```

The package intentionally does not accept or need the service-role key.

## 5. Reproducible execution

Safe local plan inspection (no network or state change):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-hosted-auth/run-hosted-auth-evidence.ps1 `
  -PlanOnly
```

Approved hosted staging run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File supabase/tests/s17-hosted-auth/run-hosted-auth-evidence.ps1 `
  -ConfirmNonProduction `
  -EvidencePath artifacts/s17-hosted-auth-evidence-<RUN-ID>.json
```

Guards:

- target label must contain staging/stage/preview/test/sandbox
- hosted URL must use HTTPS
- job ID must start with `S17-HOSTED-`
- expected commit and migration hashes must be full lowercase hashes
- active tokens must be unexpired and carry the expected metadata roles
- expired token must have a past `exp`
- existing evidence is not overwritten unless the operator explicitly passes `-ForceEvidenceOverwrite`
- execution stops on the first unexpected status/state and still writes a redacted FAIL record

## 6. Evidence archive checklist

- preserve the generated JSON bytes and compute SHA-256
- attach the staging deployment/function log IDs and migration apply log
- identify the hosted project using its approved non-secret label/project ref
- record the actual deployed commit and migration digest
- verify all case entries are PASS
- review that `rawTokensStored` is false and no secrets/email/plain subject IDs appear
- archive under the approved durable evidence path before any human closure decision

## 7. Boundaries

A green hosted run plus successful staging migration satisfies evidence inputs for human S17-1/S17-2 closure review only. It does not merge code, close a P0 by itself, prove production readiness, close `factory-site-isolation`, unlock real cutting, or authorize production deployment.

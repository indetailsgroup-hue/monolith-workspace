# CI Secrets — Provisioning Guide

This document lists every secret required by GitHub Actions workflows in this
repository, explains where to obtain each value, and provides step-by-step
provisioning instructions for repo maintainers.

---

## Secrets Index

| Secret name | Used by workflow | Required | Description |
|-------------|-----------------|----------|-------------|
| `SUPABASE_ACCESS_TOKEN` | `pgtap-tests.yml` | Yes | Supabase personal access token — authorises the Supabase CLI to start the local stack in CI |

---

## `SUPABASE_ACCESS_TOKEN`

### What it is

A personal access token (PAT) issued by [app.supabase.com](https://app.supabase.com).
The Supabase CLI calls the Supabase Management API with this token when running
`supabase start` to pull project configuration. Without it, the `pgtap-tests`
job fails at the "Start Supabase local stack" step.

> **Note:** This is a *Supabase* access token, not a GitHub PAT. The two are
> separate credentials from separate platforms.

### How to generate

1. Open [app.supabase.com/account/tokens](https://app.supabase.com/account/tokens).
2. Click **Generate new token**.
3. Give it a name, e.g. `monolith-ci`.
4. Copy the token — it is shown only once.

### How to provision (GitHub UI)

1. In this repository, go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: `SUPABASE_ACCESS_TOKEN`
4. Value: paste the token from step above.
5. Click **Add secret**.

### How to provision (GitHub CLI)

```bash
gh secret set SUPABASE_ACCESS_TOKEN \
  --repo indetailsgroup-hue/monolith-workspace \
  --body "<your-supabase-access-token>"
```

### Per-environment provisioning

If your repository uses GitHub Environments (e.g. `staging`, `production`), you
can scope the secret to a specific environment instead of repo-wide:

```bash
# Scope to staging environment only
gh secret set SUPABASE_ACCESS_TOKEN \
  --repo indetailsgroup-hue/monolith-workspace \
  --env staging \
  --body "<staging-supabase-token>"
```

For the `pgtap-tests.yml` workflow (which targets `main` pushes and PRs), a
**repository-level** secret is sufficient and recommended.

### Rotation

Supabase access tokens do not expire by default, but you should rotate this
secret if:
- A team member with access to the token leaves the organisation.
- The token is accidentally exposed in logs or a commit.
- As part of regular security hygiene (recommended: every 90 days).

To rotate: generate a new token at [app.supabase.com/account/tokens](https://app.supabase.com/account/tokens),
update the GitHub secret with the new value, and revoke the old token.

---

## Adding new secrets

When adding a new workflow that requires a secret:

1. Add a `REQUIRED SECRETS` comment block at the top of the `.yml` file
   (see `pgtap-tests.yml` for the established format).
2. Add a row to the **Secrets Index** table above.
3. Add a full section for the new secret (same structure as above).
4. Open a PR — reviewers will provision the secret before merging.

---

*Last updated: 2026-08-28 — initial provisioning guide for `SUPABASE_ACCESS_TOKEN`*

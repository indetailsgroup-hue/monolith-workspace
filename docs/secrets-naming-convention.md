# GitHub Actions Secrets Naming Convention

> Adopted: 2026-09-10  
> Applies to: all secrets and repository variables under `indetailsgroup-hue/monolith-workspace`

---

## Pattern

```
<MODULE>_<SERVICE>_<CREDENTIAL_TYPE>
```

| Segment | Meaning | Examples |
|---|---|---|
| `MODULE` | The application module or project that owns this credential | `MONOLITH`, `FIELD`, `LINE`, `CHROMATIC` |
| `SERVICE` | The external service or internal sub-system being authenticated | `SUPABASE`, `NOTIFY`, `FPR_CHANNEL`, `CHANNEL`, `PLAYWRIGHT` |
| `CREDENTIAL_TYPE` | The kind of credential value stored | `URL`, `TOKEN`, `KEY`, `SECRET`, `ANON_KEY`, `ACCESS_TOKEN`, `JWT_SECRET`, `PROJECT_REF`, `PROJECT_TOKEN` |

---

## Rules

1. **All three segments are required.** Bare single-word names like `DATABASE_URL` or `TOKEN` are not permitted for new secrets.
2. **All uppercase, words separated by underscores.**  No hyphens, no camelCase.
3. **MODULE comes first.** This groups secrets visually in the GitHub UI and makes ownership immediately clear.
4. **CREDENTIAL_TYPE is always last.** The tail of the name always describes *what the value is*, not *who issued it*.
5. **Non-sensitive build values belong in Repository Variables** (`vars.*`), not Secrets. Apply the same naming pattern — variables use the `VITE_` prefix where Vite injects them at build time.
6. **`GITHUB_TOKEN` is exempt** — it is a GitHub-provisioned built-in and cannot be renamed.

---

## Approved MODULE tokens

| Token | Owned by |
|---|---|
| `MONOLITH` | Core monolith Supabase project and main app |
| `FIELD` | Field-app Supabase project (`field-app-pages`) |
| `LINE` | All LINE platform integrations (Messaging API, FPR, Notify) |
| `CHROMATIC` | Chromatic visual-testing service |
| `MIGRATION` | Production database migration tooling |

---

## Approved CREDENTIAL_TYPE tokens

| Token | When to use |
|---|---|
| `URL` | Base URL of a service endpoint |
| `TOKEN` | Opaque bearer or API token (no expiry management needed) |
| `KEY` | Symmetric encryption key or signing key |
| `ANON_KEY` | Supabase anonymous (public) key |
| `SERVICE_ROLE_KEY` | Supabase service-role (privileged) key |
| `JWT_SECRET` | JWT signing secret |
| `PROJECT_REF` | Supabase project reference ID |
| `PROJECT_TOKEN` | Chromatic project token |
| `ACCESS_TOKEN` | OAuth or channel access token (managed rotation) |
| `SECRET` | Channel webhook secret or HMAC verification value |

---

## Inventory compliance table

| Secret / Variable | Module | Service | Credential Type | Compliant? | Notes |
|---|---|---|---|---|---|
| `CHROMATIC_PLAYWRIGHT_PROJECT_TOKEN` | CHROMATIC | PLAYWRIGHT | PROJECT_TOKEN | ✅ | |
| `CHROMATIC_PROJECT_TOKEN` | CHROMATIC | — | PROJECT_TOKEN | ⚠️ | Missing SERVICE segment; acceptable legacy name (Chromatic's own doc uses this key) |
| `DATABASE_URL` | — | DATABASE | URL | ❌ | Legacy — no MODULE prefix; acceptable for now (used by migration tooling) |
| `FIELD_SUPABASE_ANON_KEY` | FIELD | SUPABASE | ANON_KEY | ✅ | |
| `FIELD_SUPABASE_URL` | FIELD | SUPABASE | URL | ✅ | |
| `GITHUB_TOKEN` | — | — | — | ✅ | Built-in; exempt from convention |
| `LINE_API_BASE` | LINE | API | BASE | ⚠️ | `BASE` is not a standard CREDENTIAL_TYPE; recommend `LINE_MESSAGING_API_URL` on next rotation |
| `LINE_FPR_CHANNEL_ACCESS_TOKEN` | LINE | FPR_CHANNEL | ACCESS_TOKEN | ✅ | |
| `LINE_FPR_CHANNEL_SECRET` | LINE | FPR_CHANNEL | SECRET | ✅ | |
| `LINE_MONOLITH_CHANNEL_ACCESS_TOKEN` | LINE | MONOLITH_CHANNEL | ACCESS_TOKEN | ✅ | Renamed from bare `LINE_CHANNEL_ACCESS_TOKEN` |
| `LINE_NOTIFY_TOKEN` | LINE | NOTIFY | TOKEN | ✅ | |
| `MIGRATION_BACKUP_KEY` | MIGRATION | BACKUP | KEY | ✅ | |
| `MONOLITH_SUPABASE_ANON_KEY` | MONOLITH | SUPABASE | ANON_KEY | ✅ | Renamed from bare `SUPABASE_ANON_KEY` |
| `MONOLITH_SUPABASE_URL` | MONOLITH | SUPABASE | URL | ✅ | Renamed from bare `SUPABASE_URL` |
| `SUPABASE_ACCESS_TOKEN` | — | SUPABASE | ACCESS_TOKEN | ❌ | Missing MODULE; used by Supabase CLI — rename to `MONOLITH_SUPABASE_ACCESS_TOKEN` on next rotation |
| `SUPABASE_JWT_SECRET` | — | SUPABASE | JWT_SECRET | ❌ | Missing MODULE; rename to `MONOLITH_SUPABASE_JWT_SECRET` on next rotation |
| `SUPABASE_PROJECT_REF` | — | SUPABASE | PROJECT_REF | ❌ | Missing MODULE; used in 4 workflows — rename to `MONOLITH_SUPABASE_PROJECT_REF` on next rotation |
| `SUPABASE_SERVICE_ROLE_KEY` | — | SUPABASE | SERVICE_ROLE_KEY | ❌ | Missing MODULE; rename to `MONOLITH_SUPABASE_SERVICE_ROLE_KEY` on next rotation |
| `VITE_LINE_LOGIN_CHANNEL_ID` *(var)* | LINE | LOGIN_CHANNEL | ID | ✅ | Moved to Repository Variable |
| `VITE_MONOLITH_URL` *(var)* | MONOLITH | — | URL | ⚠️ | Missing SERVICE; acceptable (VITE_ prefix disambiguates scope) |

**Legend:** ✅ Compliant · ⚠️ Minor deviation (acceptable, note next rotation) · ❌ Non-compliant (schedule rename)

---

## Future secrets checklist

When adding a new secret, answer these questions in order:

1. **Is it non-sensitive?** → Use a Repository Variable (`vars.*`), not a Secret.
2. **What MODULE owns it?** → Pick from the approved list above, or register a new token here.
3. **What SERVICE does it authenticate?** → Be specific; avoid generic names like `API` or `SERVICE`.
4. **What CREDENTIAL_TYPE is it?** → Pick from the approved list above.
5. **Does the name follow `MODULE_SERVICE_CREDENTIAL_TYPE`?** → If not, fix it before creating.
6. **Update this doc** and `secrets-inventory.md` in the same PR that introduces the secret.

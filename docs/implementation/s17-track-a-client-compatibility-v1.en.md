# S17 Track A — Client Compatibility and Deployment Checklist

Document version: 1.0

Prepared: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

Status: **deployment analysis — not deployment authority**

> The candidate changes the factory trust boundary and RPC signatures. It must not be merged or deployed until independent review, database evidence, metadata preparation, and a human-approved cutover plan are complete.

## 1. Executive finding

The current `factory-api` candidate and migration 0162 do **not** have a zero-downtime order by themselves:

- **Function first:** the new function calls new RPC parameter signatures that do not exist before 0162; mutating routes fail.
- **Migration first:** 0162 drops the legacy signatures immediately; the currently deployed function continues calling them and mutating routes fail.

Therefore “function first” versus “migration first” is not a valid binary choice under live traffic. Use either the bridge sequence in §6.1 or a controlled maintenance window in §6.2.

## 2. Shared authentication impact

All non-health Factory API routes now require a valid end-user Bearer JWT. The anon key remains only an API key and does not become identity. Local `monolith.user.role`, `x-actor-role`, request body actor fields, and `user_metadata` cannot grant server access.

Required client conditions:

- an unexpired Supabase session exists in the browser
- the access token contains recognized `app_metadata.roles`
- production operators receive real `app_metadata.site_codes`
- after metadata changes, the user refreshes the session or signs out/in so a new JWT carries the claims

No token or no recognized role produces `401`/`403` instead of the previous permissive behavior.

## 3. Client-by-client checklist

### 3.1 Designer workspace and automatic packet upload

| Check | As-built impact / required action |
| --- | --- |
| State/freeze/release/revoke/can-export/proof | Requires active JWT and `designer`/`admin` capability; legacy local role selection is presentation-only |
| Export state | FROZEN is no longer exportable. Operator must explicitly Release before Export |
| Header export button | `AppShell.tsx` now enables it only when gate is OK and state is RELEASED |
| Automatic upload | `App.tsx` generates and downloads the local NFP ZIP before calling `uploadPacket()`. If server upload is rejected, the user may already possess a local file; current feedback is console-only |
| Other packet/download controls | Some local packet-generation controls can still create a browser download without server acceptance. Such a file is not server-released evidence and remains NO_CUT |
| Missing/expired session | Calls return `401`; the UI needs an explicit sign-in/session-expired message rather than relying on console output |

Compatibility risk: users accustomed to “Freeze then Export” now see an extra Release step. A downloaded NFP ZIP must never be interpreted as proof that the server accepted the packet.

### 3.2 FactoryApp routes

| Route/client | Required claim | Compatibility result |
| --- | --- | --- |
| jobs/state/activity/proof | any recognized Factory capability | Works with valid JWT; unknown/empty roles receive `403` |
| GET `/:jobId/export` | `factory`, `factory_operator`, or admin-equivalent | Works only for RELEASED with a recorded packet |
| POST `/:jobId/verify` | `factory`, `factory_operator`, or admin-equivalent | Works only for RELEASED with a recorded packet |
| `triggerLegacyExportApi()` POST export | — | **Broken/unsupported:** `factory-api` implements GET export, not legacy POST export |
| `fetchExportOptionsApi()` | — | **Broken/unsupported:** `/factory/export/options` is not implemented by `factory-api` |
| jobs list status mapping | — | **Misleading:** `jobsApi.ts` maps FROZEN to `VERIFIED` and comments that it is ready for export; server now denies export until RELEASED |
| route base composition | — | Re-test both hosted Edge base URL and local proxy; clients currently mix `/factory/...` and `/api/factory/...` prefixes |

The server gates remain authoritative even while these UI compatibility defects are open.

### 3.3 MCP pipeline

- The current MCP registry/pipeline has no direct factory packet tool, so migration 0162 introduces no immediate MCP route failure.
- MCP already forwards the end-user JWT through a user-scoped client and reads the same `app_metadata.roles` and `site_codes` claim family.
- Existing MCP tools that require site scope still fail closed when the JWT lacks an active site code.
- A future factory MCP tool must not call a legacy RPC signature or accept actor fields in tool input. It must use the authenticated Factory API/Track A contract and remain human-gated when classified as Write/Approval.

## 4. Production metadata matrix

Use lower-case C12 vocabulary for new assignments; upper-case MONOLITH values are temporary compatibility aliases.

| User type | Preferred `app_metadata.roles` | Factory capability |
| --- | --- | --- |
| Designer | `["designer"]` | read + freeze/release/revoke/unfreeze + packet upload |
| Factory operator | `["factory_operator"]` or `["factory"]` | read + export + verify |
| Administrator/operations | `["admin"]` or approved governance role such as `operations` | full Factory API capability; role assignment remains a human governance action |
| Installer | `["installer"]` | read-only Factory API capability |
| Finance | `["finance"]` | read-only Factory API capability |

`site_codes` must be an array of real active site codes assigned to that user, for example `["<APPROVED-SITE-CODE>"]`. The repository still carries `BKK-HQ-01` as an explicitly unconfirmed placeholder in the C12 foundation. Do not bulk-provision that value as production truth until the responsible human confirms it.

As-built limitation: `factory-api` derives and records `site_codes` but migration 0162 does not yet bind a job to a site or reject an empty site list. MCP and other C12 consumers do enforce site access. This difference must remain visible and must not be described as complete factory site isolation.

## 5. Pre-deployment checks

- [ ] Independent source review accepts the implementation candidate
- [ ] Ephemeral PostgreSQL dry-run is green and an existing pre-0162 staging snapshot is green
- [ ] Hosted backup/restore and abort owner are named
- [ ] All pilot users have reviewed roles and approved site codes
- [ ] Pilot users refresh/sign in again; decoded access tokens show the new claims
- [ ] FactoryApp legacy POST export, export-options, FROZEN status label, and route prefixes are repaired or explicitly disabled
- [ ] Designer shows upload failure and session expiry to the user, not only the console
- [ ] A bridge deployment or maintenance window is approved
- [ ] Smoke tests cover state, freeze, release, packet, export, verify, proof, activity, list, missing JWT, forged headers, and FROZEN denial

## 6. Deployment sequence

### 6.1 Preferred zero-downtime sequence — requires a bridge function

1. Provision and verify user metadata; force JWT refresh for pilot users.
2. Deploy a temporary bridge `factory-api` that derives identity only from the verified JWT, attempts the new RPC signatures, and falls back to legacy signatures only on a verified “function/signature not found” response. It must never restore client actor headers/body as authority.
3. Smoke-test the bridge against the pre-0162 schema.
4. Apply migration 0162. Wait for PostgREST schema-cache refresh and verify the bridge uses only the new signatures.
5. Deploy the final candidate without fallback; run full route/spoof/FROZEN smoke tests.
6. Preserve run IDs/logs and obtain the human decision before merge/closure claims.

The bridge does not provide full server-owned actor evidence while it is using the old RPCs, so that interval is transitional evidence only and cannot close S17-1.

### 6.2 Controlled maintenance sequence — no bridge

1. Put Factory API mutating routes into maintenance/read-only mode and stop Designer/Factory operators from starting exports.
2. Apply 0162 to the approved target.
3. Deploy the new `factory-api` immediately after schema/cache readiness.
4. Run smoke tests with prepared Designer and Factory accounts.
5. Reopen traffic only after state, Release, packet upload, export and verify all pass.

Within the maintenance window, **migration first** is required because the final function cannot call its new signatures until they exist. This is not zero downtime; the maintenance gate is what prevents user-visible inconsistent operation.

## 7. Unchanged boundaries

This checklist does not authorize production apply, merge, P0 closure, production-ready status, or real cutting. Track B and all NO_CUT rules remain unaffected.

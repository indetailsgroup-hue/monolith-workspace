# S17 Shadow Dogfood SOP — Freeze → Release → Export

Document version: 1.0

Prepared: 2026-07-11

Implementation candidate: `739aee160f324543006028e74f8ce479ecc538a3`

Operating status: **shadow-only / NO_CUT**

> The written operating flow is now **Freeze → Release → Export**. FROZEN means locked for review; it no longer authorizes packet upload, factory export, or verification. This SOP is a dogfood note, not production authority or P0 closure.

## 1. Roles and prerequisites

- Designer account: valid Supabase session, approved `app_metadata.roles` containing `designer` (or approved admin equivalent), and approved site code
- Factory account: valid session, role containing `factory_operator`/`factory` (or approved admin equivalent), and approved site code
- one controlled dogfood job and one confirmed machine profile
- gate result reviewed; no unresolved blocker
- `SHADOW_MODE_NOT_FOR_PRODUCTION = true`
- no operator may use the packet to cut a real workpiece

## 2. Operating sequence

### Step 1 — Prepare DRAFT

1. Open the controlled dogfood project.
2. Confirm the correct project/job ID and site.
3. Complete design edits and run the applicable gate checks.
4. Record any warning/blocker; do not continue when blockers remain.

### Step 2 — Freeze

1. Designer selects Freeze.
2. Confirm server state becomes `FROZEN` and a revision ID exists.
3. Review the frozen geometry, materials, hardware, drill map and gate evidence.

**FROZEN boundary:** packet upload, Factory export, and verification must all be denied. A local preview may be used for review only and is not release evidence.

### Step 3 — Release

1. After review/gate acceptance, Designer explicitly selects Release.
2. Confirm server state becomes `RELEASED`.
3. Confirm the release event records the server-derived actor and authorization context.

Release is a separate human-visible transition. Freeze alone is not sufficient.

### Step 4 — Export and upload from Designer

1. Select Export only after the UI and server both report RELEASED.
2. The generated ZIP remains prefixed `NFP-` and contains `NOT_FOR_PRODUCTION.txt`.
3. Confirm server packet upload succeeds and a packet SHA-256/storage path is recorded.
4. Do not rely only on the browser download: the current Designer path downloads the local ZIP before server upload. An upload failure can therefore leave a local file that the server never accepted.

### Step 5 — Factory receive, export and verify

1. Factory operator opens the same job with the Factory account.
2. Confirm state is RELEASED and the recorded packet anchor exists.
3. Request Factory export; obtain the short-lived signed URL.
4. Run verification and record expected/computed SHA-256, verdict, actor and time.
5. Use the output only to compare against the existing factory order/process and collect S17 evidence.

**Highest operational disposition:** shadow evidence only / NO_CUT. A PASS does not authorize manufacturing.

## 3. User-visible changes

- “Freeze then Export” no longer works; users must perform an explicit Release.
- FROZEN export/upload/verify attempts return a denial instead of proceeding.
- Users without a valid session receive `401`; users without recognized roles receive `403`.
- Changing the local UI role does not change server permission.
- A downloaded NFP file is not proof of server acceptance; confirm the server packet record/activity.
- FactoryApp may still display FROZEN as `VERIFIED`; treat server state and export response as authoritative until that label is corrected.

## 4. Abort and rollback behavior

Stop the dogfood run when any condition occurs:

- state is not the expected DRAFT/FROZEN/RELEASED value
- Release fails or the revision ID is missing
- packet upload fails or packet/storage anchors are absent
- Factory export or verification succeeds while state is FROZEN
- JWT actor/roles/site evidence is missing or disagrees with the operator
- NFP prefix/marker is absent
- computed packet hash disagrees with the server anchor

If a RELEASED job must be withdrawn, use Revoke to return it to FROZEN. After revoke, upload/export/verify must be denied again. Preserve existing events; never rewrite audit history.

## 5. Evidence to capture

- exact application commit and migration hash
- dogfood job ID and released revision ID
- Designer and Factory actor subject IDs, role arrays, site-code arrays and authorization-context IDs
- Freeze, Release, packet-record and verify event timestamps
- packet/manifest SHA-256 and storage path
- HTTP status/result for the three FROZEN negative checks
- verification expected/computed hash and verdict
- screenshot or record showing NFP marker and NO_CUT acknowledgement
- CI and database dry-run IDs/output

## 6. Closure boundary

Completing this SOP yields controlled dogfood evidence only. It does not close S17-1/S17-2, approve migration 0162, unlock Track B, authorize production, or permit real cutting. Human approvers retain all closure authority.

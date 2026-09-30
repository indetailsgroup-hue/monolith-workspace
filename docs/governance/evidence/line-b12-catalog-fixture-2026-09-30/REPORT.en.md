# B12 catalog reader — tested scope

The catalog reader at scripts/line-b12-catalog.sql emits one JSON object in a read-only transaction. It reports all twenty matrix identities, missing targets/roles, owner and SECURITY DEFINER flags, effective EXECUTE and schema USAGE for every database role, expanded ACL/grantor entries including PUBLIC defaults, membership options, unexpected overloads, future function ACLs and trigger dependencies. It does not call target functions or emit bodies, role passwords, connection strings or function configuration values.

## Validation

The initial test failed because the reader did not exist (observed in the tool transcript; no raw RED file in this bundle). The final synthetic test exited zero with 19 checks, including missing objects/roles, NULL ACL defaults, inherited EXECUTE, extra overload, future grants, trigger dependency and unchanged routine-ACL fingerprint. All target function bodies raise if called. Missing objects are output as missing, not silently excluded. This is an inventory, not an approval or automatic full-security pass.

The runner used the locally cached postgres:18 image by resolved image ID, network none, no published ports and no external credentials. It removed only its container after checking its ownership label. PostgreSQL 17 compatibility and the fully migrated MONOLITH baseline were not tested in this round. This result neither proves production exposure nor post-revoke behavior. Old evidence was preserved.

## Replay and operating boundary

Run from the product repository root: python tests/line-oa-commerce/ci/b12_catalog_check.py --output <new-directory> --image postgres:18. The output directory must not exist and the image must already be cached. Docker access is required. The runner creates only a fresh synthetic database; it accepts no existing database connection. Do not add it to ordinary CI without explicitly deciding Docker runtime and image availability.

A future authorized MONOLITH run must use a fresh fully migrated isolated stack, record source/SQL hashes and baseline versions, execute the catalog SQL with ON_ERROR_STOP, and retain the JSON with commands, UTC, exits and checksums. Compare every signature and grant origin against the B12 matrix. Missing expected objects, extra overloads or unresolved KEEP/DECIDE callers require review, not an inferred pass. No shared/production access is authorized here.

## Files and next step

empty.json, populated.json and missing-one-role.json are synthetic snapshots. result.json holds checks, image and SQL hash; context.json holds source hashes and the orchestrator-reported exit/command. SHA256SUMS protects this bundle's bytes; it is not external execution attestation. The collector does not enumerate application callers or resolve the pending ops/integration decisions. No 0199, grant change, push, cron or customer message occurred.

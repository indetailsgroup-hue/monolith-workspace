# S17 Track A — Open Gates, Privacy Decision, and Track B Handoff

Record version: 1.0

Recorded: 2026-07-12

Decision authority: **Tech Lead (human direction supplied to the implementer)**

Recorder: AI Track A implementer — advisory/non-authoritative

Status: **implementation candidate; open evidence gates remain**

> This record durably captures the five Tech Lead directions following the independent S17-1/S17-2 review. It does not merge or deploy code, close S17-1/S17-2, close any P0, claim production readiness, or authorize real cutting.

## 1. Decision register

| Ref | Decision | Recorded disposition |
| --- | --- | --- |
| F-1 | Factory site isolation | **DECOUPLE.** Track as the open hard gate `factory-site-isolation`; do not implement speculative multi-tenant enforcement while DAPH has one configured site. |
| F-2 | Hosted Auth integration | **EVIDENCE GATE.** Human/Ops must deploy to approved staging and run the hash-bound hosted test package. The implementer must not deploy it. |
| F-3 | Cross-role reads | `state` and `can-export`: all five recognized capabilities. `jobs`, `activity`, and `proof`: ADMIN + DESIGNER + FACTORY only. |
| F-4 | Email PII in audit | New Factory API audit context uses the verified `subjectId` for `actor_name`; verified email is not persisted by this path. Historical rows are not rewritten. |
| F-5 | Track B semantics | `authorizationContextId` hashes the identity snapshot only. It does **not** bind a job, action, route, revision, packet, or attestation. |

## 2. Hard gate: `factory-site-isolation`

Gate state: **OPEN — known gap, gated to multi-branch**

Trigger: this gate must close before DAPH enables a second active site/branch or treats Factory data as multi-tenant isolated.

### 2.1 As-built reason for decoupling

- `current_site_codes()` and `has_site_access()` read `auth.jwt().app_metadata.site_codes` from the current database session (`supabase/migrations/00000000000000_c12_foundation.sql`).
- Factory RPCs are called with a service-role session by `factory-api`; directly calling `has_site_access()` there would evaluate the service-role session, not the end-user identity that the Edge function verified.
- `factory_jobs` has no `site_code`, project foreign key, or other authoritative job-to-site relationship (`supabase/migrations/0155_factory_state_server.sql`).
- `get_active_site_codes()` currently returns the single configured value `BKK-HQ-01`; its own comment marks multi-branch as a pending Q3 decision.

Therefore a direct `has_site_access()` check would be misleading, while inventing a job/site relationship now would be speculative architecture. No factory site-enforcement code is added in this candidate.

### 2.2 Required future design

The gate may close only with all of the following:

1. A reviewed migration binds every Factory job to one authoritative site, directly or through a non-ambiguous project foreign key.
2. A service-role-safe site predicate accepts `p_actor_site_codes` from the verified server context as an explicit parameter. It must not derive the end-user site set from the service-role database session.
3. Every read and mutation route applies the same job/site rule and fails closed when the binding or actor site set is absent.
4. Real two-site fixtures prove same-site positive cases and cross-site negative cases for list, state, activity, proof, transition, packet, export, and verify.
5. Tech Lead and Security Owner review the migration, trust boundary, tests, and hosted evidence before multi-branch activation.

Prohibited shortcut: calling the existing session-based `has_site_access()` directly from a service-role Factory RPC.

## 3. Hosted evidence gate

The reproducible package is under `supabase/tests/s17-hosted-auth/`. Human/Ops must run it only after an approved staging maintenance/deployment action. Required cases are:

- valid real JWT → `200`
- genuinely expired JWT → `401`
- valid user with no recognized role → `403`
- forged `x-actor-role` cannot grant a transition and leaves state unchanged
- INSTALLER activity read → `403`
- FROZEN packet upload → `409`
- valid Designer release → `200`, with audit actor name equal to subject ID and no email persisted by this path

Raw output becomes E0 only when it identifies the deployed commit, migration hash, hosted target, run time, statuses, and pass/fail result without storing JWTs.

## 4. Least-privilege route matrix

| Surface | ADMIN | DESIGNER | FACTORY | INSTALLER | FINANCE |
| --- | --- | --- | --- | --- | --- |
| `state`, `can-export` | allow | allow | allow | allow | allow |
| jobs list, `activity`, `proof` | allow | allow | allow | deny | deny |
| freeze/release/revoke/unfreeze, packet upload | allow | allow | deny | deny | deny |
| export, verify | allow | deny | allow | deny | deny |

Activity contains other actors' subject IDs and authorization context. INSTALLER and FINANCE have no approved need for that evidence surface.

Migration 0162 also removes the legacy `authenticated USING (true)` policies and direct table privileges on `factory_jobs`/`factory_job_events`. This prevents bypassing the Edge matrix through PostgREST; application reads must use the service-role-only RPC path behind `factory-api`.

## 5. Audit privacy decision

For new events written through this Factory API candidate:

- authority remains `actor_subject_id`, `actor_roles`, `actor_site_codes`, and `authorization_context_id`, all derived from verified Auth data;
- compatibility field `actor_name` is set to the same verified subject ID;
- migration 0162 persists `p_actor_subject_id` even if a service caller supplies another compatibility `p_actor_name` value;
- email is ignored even when present in the verified Auth user payload;
- historical append-only rows may contain email from the earlier path and are preserved rather than rewritten.

This is a data-minimization decision, not anonymization: a subject ID is still an identifier and remains governed audit data.

## 6. Track B semantic handoff

Track A computes:

```text
authorizationContextId = SHA-256(JSON({ actorSubjectId, roles, siteCodes }))
```

The arrays are deduplicated and byte-sorted before hashing. This ID answers only: “which verified identity/authorization snapshot did the server use?” It does not include or prove `jobId`, action, HTTP route, released revision, packet content, machine profile, exporter version, schema version, gate result, or time.

Track B must bind the authorization context ID alongside the action/job/revision/packet identity inside the canonical attestation/signature contract. It must not treat the authorization context ID alone as an action authorization or packet signature.

## 7. Closure matrix

| Requirement | Current record state |
| --- | --- |
| Independent full review | Passed per Tech Lead input |
| F-1 hard gate recorded | Prepared in this candidate; gate itself remains OPEN until multi-branch work |
| F-3 route restriction and negative tests | Implemented in this candidate; CI evidence pending |
| F-4 privacy decision | Implemented and recorded in this candidate; hosted evidence pending |
| F-2 hosted live Auth evidence | **OPEN — Human/Ops action required** |
| Migration 0162 applied successfully on staging | **OPEN — Human/Ops action required** |

Until both hosted/staging requirements are evidenced and a human closes the items, S17-1/S17-2 remain **implementation candidate**. Track B and all NO_CUT boundaries are unchanged.

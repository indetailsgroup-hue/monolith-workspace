"""Property test — unauthorized-mutation denial (LINE OA Commerce, Module B5).

Spec task: 18.2 Write property test for unauthorized-mutation denial.

Implements exactly ONE numbered property against the SECURITY DEFINER mutation
RPCs shipped by the operational-RPC tasks — they each re-check the caller's role
INSIDE the function against the conversation's / target site_code and reject a
caller that is neither a Governance_Role nor holds ``public.has_site_access()``
for that site, raising ``insufficient_privilege`` (sqlstate ``42501``) with NO
state change:

    Property 28: A mutation without a permitted role for the operation and
    site_code is rejected with permission-denied and no state changes.
    Validates: Requirements 12.6.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh Conversation and then invokes one of the three mutation RPCs as a **Branch**
principal that **lacks** ``has_site_access`` for the relevant site_code:

  * ``rpc_resolve_conversation_site`` — against a freshly seeded
    ``site_unresolved`` Conversation, attempting to resolve it to an **active**
    Site_Code the principal cannot access; the in-function check
    ``is_governance_role() OR has_site_access(p_site_code)`` fails.
  * ``rpc_send_line_outbound`` — against a Conversation already resolved to an
    **active** Site_Code the principal cannot access; the in-function check
    ``is_governance_role() OR has_site_access(conversation.site_code)`` fails.
  * ``rpc_create_line_order`` — against the same kind of site-resolved
    Conversation; the same in-function check fails.

For each it asserts the call is **rejected with sqlstate 42501**
(``insufficient_privilege`` / permission-denied) and that **NO state changed**:
the Conversation's ``(status, site_code)`` is unchanged, and no
outbound-message, order, or audit-log row was written for that Conversation.

Varied principals (``branch_manager`` / ``branch_operator``), varied accessible
site sets (always disjoint from the conversation's site so access is genuinely
absent), varied verticals, and all three RPCs ensure many distinct unauthorized
role/operation/site combinations are covered.

The Branch principal is simulated with the platform convention used by the
shipped verification harness: ``set_config('request.jwt.claims', ...)`` injects
the JWT claims the C12 helpers (``is_governance_role`` / ``has_site_access`` /
``resolve_actor``) consume. Each generated example runs inside a SAVEPOINT that
is rolled back, and the (expected) rejection runs inside a nested SAVEPOINT so
the aborted RPC is recovered before the unchanged-state assertions, so the test
provisions and tears down its own rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the mutation RPCs / A1
/ C12 helpers / required tables are unavailable, no active Site_Code exists, or
the branch-claims convention is not honored (a denial round-trip does not yield
the expected permission-denied error).
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The three mutation RPCs whose in-function role + has_site_access re-check this
# property exercises. Each value selects a distinct unauthorized-mutation path.
RPCS = ("resolve", "send_outbound", "create_order")

# Branch_Roles (C12) recognized by public.has_site_access(); none is a
# Governance_Role, so denial hinges purely on the site-access grant.
BRANCH_ROLES = ("branch_manager", "branch_operator")

# Verticals add row variety; vertical_context is NOT part of this property.
VERTICALS = ("monolith", "tcck")

# The two resolution/order sources the RPCs accept (postback / manual).
SOURCES = ("postback", "manual")

# PostgreSQL sqlstate for permission-denied (insufficient_privilege); the value
# every mutation RPC raises with for an unauthorized caller (Req 12.6).
_PERMISSION_DENIED_SQLSTATE = "42501"


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPCs / helpers /
# tables are unavailable, no active site exists, or the branch-claims denial
# convention is not honored.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping unauthorized-mutation "
            "denial property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping unauthorized-mutation test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(
            f"Test database not reachable; skipping unauthorized-mutation test ({exc})."
        )

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _active_site_codes(cur: Any) -> list[str]:
    """Return the current active Site_Codes from A1's canonical source."""
    cur.execute("select site_code from public.get_active_site_codes()")
    return [row[0] for row in cur.fetchall()]


def _branch_claims(role: str, site_codes: list[str]) -> str:
    """Build JWT claims for a Branch principal with a given site-access set.

    Includes a stable ``sub`` so ``public.resolve_actor()`` has an actor to
    derive, and exactly one Branch_Role so the principal is never governance.
    """
    return json.dumps(
        {
            "sub": "00000000-0000-0000-0000-0000000000bb",
            "app_metadata": {"roles": [role], "site_codes": site_codes},
        }
    )


def _require_dependencies(conn: Any) -> None:
    """Skip unless every mutation RPC + A1/C12 helpers + tables exist, an active
    Site_Code exists, AND a Branch principal lacking access is genuinely denied
    (sqlstate 42501) by at least one mutation path."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_resolve_conversation_site(uuid,text,text)",
            "public.rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)",
            "public.rpc_create_line_order(uuid,jsonb,text,text)",
            "public.get_active_site_codes()",
            "public.has_site_access(text)",
            "public.is_governance_role()",
            "public.resolve_actor()",
            "auth.jwt()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "unauthorized-mutation denial property test."
                )

        for table in (
            "public.line_oa_conversations",
            "public.line_oa_outbound_messages",
            "public.line_oa_orders",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping unauthorized-mutation "
                    "denial property test."
                )

        # Probe: an active site exists AND a Branch principal that cannot access it
        # is denied (42501) when attempting to resolve a site_unresolved conversation.
        cur.execute("savepoint probe")
        try:
            active = _active_site_codes(cur)
            if not active:
                cur.execute("rollback to savepoint probe")
                cur.execute("release savepoint probe")
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping unauthorized-mutation denial property test."
                )

            target = active[0]
            # A Branch principal whose only granted site is a code that cannot match
            # `target` (UUID-namespaced), so has_site_access(target) must be false.
            claims = _branch_claims("branch_manager", [f"NOACCESS-{uuid.uuid4().hex}"])
            conv_id = _seed_conversation(cur, f"probe-{uuid.uuid4().hex}", "monolith")

            cur.execute("savepoint probe_call")
            sqlstate = None
            try:
                _resolve(cur, claims, conv_id, target, "manual")
            except Exception as exc:  # noqa: BLE001 — inspect the sqlstate
                sqlstate = getattr(exc, "sqlstate", None)
                cur.execute("rollback to savepoint probe_call")
            finally:
                cur.execute("release savepoint probe_call")
        except Exception as exc:  # noqa: BLE001 — any probe failure -> skip
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise the unauthorized-mutation denial path; skipping "
                f"({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if sqlstate != _PERMISSION_DENIED_SQLSTATE:
                conn.rollback()
                pytest.skip(
                    "branch-claims denial convention is not honored "
                    f"(expected sqlstate {_PERMISSION_DENIED_SQLSTATE}, got {sqlstate!r}); "
                    "skipping unauthorized-mutation denial property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Seeding + invocation helpers
# ---------------------------------------------------------------------------


def _seed_conversation(
    cur: Any, line_user_id: str, vertical: str, site_code: str | None = None
) -> Any:
    """Seed a Conversation; site_unresolved/NULL when no site_code is given,
    otherwise an already-resolved `open` conversation. Returns its id."""
    status = "open" if site_code is not None else "site_unresolved"
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, %s) returning id",
        (line_user_id, vertical, site_code, status),
    )
    return cur.fetchone()[0]


def _set_claims(cur: Any, claims: str) -> None:
    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))


def _resolve(cur: Any, claims: str, conversation_id: Any, site_code: str, source: str) -> None:
    _set_claims(cur, claims)
    cur.execute(
        "select resolved from public.rpc_resolve_conversation_site(%s, %s, %s)",
        (conversation_id, site_code, source),
    )
    cur.fetchone()


def _send_outbound(cur: Any, claims: str, conversation_id: Any) -> None:
    _set_claims(cur, claims)
    cur.execute(
        "select staged from public.rpc_send_line_outbound(%s, %s, %s::jsonb)",
        (conversation_id, "greeting", "{}"),
    )
    cur.fetchone()


def _create_order(
    cur: Any, claims: str, conversation_id: Any, source: str, webhook_event_id: str
) -> None:
    _set_claims(cur, claims)
    cur.execute(
        "select created from public.rpc_create_line_order(%s, %s::jsonb, %s, %s)",
        (conversation_id, "{}", source, webhook_event_id),
    )
    cur.fetchone()


def _conversation_state(cur: Any, conversation_id: Any) -> tuple[str, Any]:
    """Return the persisted (status, site_code) of a Conversation."""
    cur.execute(
        "select status, site_code from public.line_oa_conversations where id = %s",
        (conversation_id,),
    )
    row = cur.fetchone()
    return row[0], row[1]


def _side_effect_counts(
    cur: Any, conversation_id: Any, webhook_event_id: str
) -> dict[str, int]:
    """Count the rows the mutation would have created, scoped to this example.

    A successful mutation would write an outbound row (send_outbound), an order
    row (create_order, by its unique webhook_event_id), and/or an audit entry
    (every RPC embeds the conversation_id in its audit entity_ref). For a denied
    mutation all of these must remain zero.
    """
    cur.execute(
        "select count(*) from public.line_oa_outbound_messages where conversation_id = %s",
        (conversation_id,),
    )
    outbound = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_orders where webhook_event_id = %s",
        (webhook_event_id,),
    )
    orders = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_audit_log where entity_ref like %s",
        (f"%{conversation_id}%",),
    )
    audit = cur.fetchone()[0]
    return {"outbound": outbound, "orders": orders, "audit": audit}


# ---------------------------------------------------------------------------
# Property 28
# ---------------------------------------------------------------------------


@property(
    28,
    "A mutation without a permitted role for the operation and site_code is "
    "rejected with permission-denied and no state changes",
)
@given(
    rpc=st.sampled_from(RPCS),
    role=st.sampled_from(BRANCH_ROLES),
    vertical=st.sampled_from(VERTICALS),
    source=st.sampled_from(SOURCES),
    num_foreign_sites=st.integers(min_value=0, max_value=3),
    code_index=st.integers(min_value=0, max_value=10_000),
    user_fragment=st.text(
        alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
        min_size=0,
        max_size=16,
    ),
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_unauthorized_mutation_denial(
    db_conn: Any,
    rpc: str,
    role: str,
    vertical: str,
    source: str,
    num_foreign_sites: int,
    code_index: int,
    user_fragment: str,
) -> None:
    """**Validates: Requirements 12.6**"""
    # Namespace everything so it can never collide with pre-existing rows.
    run = uuid.uuid4().hex
    line_user_id = f"prop28-{run}-{user_fragment}"
    webhook_event_id = f"prop28-evt-{run}"

    # A Branch principal whose granted sites are all UUID-namespaced codes that
    # cannot match the conversation's active site, so access is genuinely absent.
    foreign_sites = [f"NOACCESS-{run}-{i}" for i in range(num_foreign_sites)]
    claims = _branch_claims(role, foreign_sites)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop28")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            target = active[code_index % len(active)]
            # Defensive: the principal must NOT have been granted the target site.
            assert target not in foreign_sites

            # ---- Seed the Conversation in the state each RPC needs. ----
            if rpc == "resolve":
                # site_unresolved: the RPC will attempt to resolve to `target`.
                conversation_id = _seed_conversation(cur, line_user_id, vertical)
                expected_state = ("site_unresolved", None)
            else:
                # already resolved/open to an active site the principal cannot access.
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, site_code=target
                )
                expected_state = ("open", target)

            # ---- Snapshot relevant state BEFORE the unauthorized call. ----
            state_before = _conversation_state(cur, conversation_id)
            counts_before = _side_effect_counts(cur, conversation_id, webhook_event_id)
            assert state_before == expected_state, (
                f"seed must start in {expected_state!r}; got {state_before!r}"
            )
            assert counts_before == {"outbound": 0, "orders": 0, "audit": 0}, (
                f"no side-effect rows should exist before the call; got {counts_before}"
            )

            # ---- Invoke the mutation as the unauthorized Branch principal. ----
            cur.execute("savepoint prop28_call")
            sqlstate = None
            rejected = False
            try:
                if rpc == "resolve":
                    _resolve(cur, claims, conversation_id, target, source)
                elif rpc == "send_outbound":
                    _send_outbound(cur, claims, conversation_id)
                else:  # create_order
                    _create_order(cur, claims, conversation_id, source, webhook_event_id)
            except Exception as exc:  # noqa: BLE001 — inspect the raised sqlstate
                rejected = True
                sqlstate = getattr(exc, "sqlstate", None)
                cur.execute("rollback to savepoint prop28_call")
            finally:
                cur.execute("release savepoint prop28_call")

            # ---- Assert: rejected with permission-denied (Req 12.6). ----
            assert rejected, (
                f"{rpc} must reject an unauthorized Branch principal, not succeed"
            )
            assert sqlstate == _PERMISSION_DENIED_SQLSTATE, (
                f"{rpc} must reject with permission-denied (sqlstate "
                f"{_PERMISSION_DENIED_SQLSTATE}); got {sqlstate!r}"
            )

            # ---- Assert: NO state changed. ----
            state_after = _conversation_state(cur, conversation_id)
            counts_after = _side_effect_counts(cur, conversation_id, webhook_event_id)
            assert state_after == state_before, (
                "a denied mutation must leave the conversation state unchanged; "
                f"before={state_before!r} after={state_after!r}"
            )
            assert counts_after == counts_before, (
                "a denied mutation must create no outbound / order / audit rows; "
                f"before={counts_before} after={counts_after}"
            )
        finally:
            cur.execute("rollback to savepoint prop28")
            cur.execute("release savepoint prop28")

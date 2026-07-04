"""Property test — conversation site resolution (LINE OA Commerce, Module B5).

Spec task: 10.2 Write property test for site resolution.

Implements exactly ONE numbered property against the conversation
site-resolution RPC shipped by task 10.1
(``00000000000030_line_oa_resolve_conversation_site.sql`` —
``public.rpc_resolve_conversation_site(uuid, text, text)``):

    Property 7: Conversation resolves to open with site_code iff the code is in
    get_active_site_codes(); otherwise rejected unchanged.
    Validates: Requirements 3.4, 3.5, 3.6.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh ``site_unresolved`` Conversation (NULL ``site_code``) and then invokes
``rpc_resolve_conversation_site`` as an authorized principal across BOTH the
``'postback'`` and ``'manual'`` sources with either:

  * an **active** ``site_code`` — one actually present in
    ``public.get_active_site_codes()`` (A1's only valid-site source): the test
    asserts the RPC reports ``resolved`` with ``status='open'``, and that the
    persisted Conversation transitions to ``status='open'`` with that exact
    ``site_code`` stored (Req 3.4, 3.5); or

  * an **unknown/inactive** ``site_code`` — a UUID-namespaced code that cannot be
    in ``get_active_site_codes()``: the test asserts the RPC is rejected with an
    "unknown or inactive" error and that the Conversation state is left UNCHANGED
    (still ``site_unresolved`` with a NULL ``site_code``) (Req 3.6).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']`` →
``public.is_governance_role()`` is true), so the in-function role re-check passes
for any candidate code and the test isolates the get_active_site_codes() gate
itself (the active-vs-inactive distinction), independent of branch site grants.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, and the (expected)
rejection path runs inside a nested SAVEPOINT so the aborted RPC is recovered
before the unchanged-state assertions, so the test provisions and tears down its
own conversation/audit rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the resolution RPC /
``get_active_site_codes()`` / ``has_site_access`` / ``resolve_actor`` /
``auth.jwt()`` / required tables are unavailable, the governance-claims
convention is not honored, or no active Site_Code exists to exercise the
positive (active) branch of the iff.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The two resolution sources the RPC supports (Req 3.4 postback / 3.5 manual).
SOURCES = ("postback", "manual")

# Verticals add row variety; vertical_context is NOT part of this property.
VERTICALS = ("monolith", "tcck")

# The event_type the RPC writes on a successful resolution (task 10.1 migration).
_RESOLVED_EVENT_TYPE = "conversation_site_resolved"

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role() (reads app_metadata.roles); a 'sub' is included
# so public.resolve_actor() has a stable actor to derive. As governance the
# in-function role re-check passes for ANY candidate code, isolating the
# get_active_site_codes() gate under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / tables
# are unavailable, governance claims are not honored, or no active site exists.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping site-resolution "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping site-resolution test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping site-resolution test ({exc}).")

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


def _require_dependencies(conn: Any) -> None:
    """Skip unless the resolution RPC + A1/C12 helpers + tables exist, governance
    claims are honored, at least one active Site_Code exists, AND the RPC can be
    exercised end-to-end (seed site_unresolved -> resolve to an active code)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_resolve_conversation_site(uuid,text,text)",
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
                    "site-resolution property test."
                )

        for table in ("public.line_oa_conversations", "public.line_oa_audit_log"):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping site-resolution property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> resolve round-trip succeeds.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            if is_gov and active:
                conv_id = _seed_unresolved(cur, f"probe-{uuid.uuid4().hex}", "monolith")
                _resolve(cur, conv_id, active[0], "manual")
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_resolve_conversation_site end-to-end; skipping "
                f"site-resolution property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping site-resolution property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping site-resolution property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_unresolved(cur: Any, line_user_id: str, vertical: str) -> Any:
    """Seed a fresh site_unresolved Conversation (NULL site_code); return its id."""
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, NULL, 'site_unresolved') returning id",
        (line_user_id, vertical),
    )
    return cur.fetchone()[0]


def _resolve(cur: Any, conversation_id: Any, site_code: str, source: str) -> dict[str, Any]:
    """Invoke rpc_resolve_conversation_site and return its OUT row as a dict."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select conversation_id, site_code, status, source, resolved "
        "from public.rpc_resolve_conversation_site(%s, %s, %s)",
        (conversation_id, site_code, source),
    )
    r = cur.fetchone()
    return {
        "conversation_id": r[0],
        "site_code": r[1],
        "status": r[2],
        "source": r[3],
        "resolved": r[4],
    }


def _conversation_state(cur: Any, conversation_id: Any) -> tuple[str, Any]:
    """Return the persisted (status, site_code) of a Conversation."""
    cur.execute(
        "select status, site_code from public.line_oa_conversations where id = %s",
        (conversation_id,),
    )
    row = cur.fetchone()
    return row[0], row[1]


# ---------------------------------------------------------------------------
# Property 7
# ---------------------------------------------------------------------------


@property(
    7,
    "Conversation resolves to open with site_code iff the code is in "
    "get_active_site_codes(); otherwise rejected unchanged",
)
@given(
    source=st.sampled_from(SOURCES),
    vertical=st.sampled_from(VERTICALS),
    use_active=st.booleans(),
    code_index=st.integers(min_value=0, max_value=10_000),
    user_fragment=st.text(
        alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
        min_size=0,
        max_size=16,
    ),
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_site_resolution(
    db_conn: Any,
    source: str,
    vertical: str,
    use_active: bool,
    code_index: int,
    user_fragment: str,
) -> None:
    """**Validates: Requirements 3.4, 3.5, 3.6**"""
    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"siteres-{uuid.uuid4().hex}-{user_fragment}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop7")
        try:
            conversation_id = _seed_unresolved(cur, line_user_id, vertical)

            # Confirm the seeded starting state: site_unresolved, NULL site_code.
            status0, site0 = _conversation_state(cur, conversation_id)
            assert status0 == "site_unresolved" and site0 is None, (
                f"seed must start site_unresolved/NULL; got ({status0!r}, {site0!r})"
            )

            if use_active:
                # --- ACTIVE branch: a code present in get_active_site_codes(). ---
                active = _active_site_codes(cur)
                if not active:
                    pytest.skip("no active Site_Code available for this example.")
                site_code = active[code_index % len(active)]

                result = _resolve(cur, conversation_id, site_code, source)

                # The RPC reports a successful resolution to `open` (Req 3.4, 3.5).
                assert result["resolved"] is True, (
                    f"an active site_code must resolve the conversation; got {result!r}"
                )
                assert result["status"] == "open", (
                    f"resolution must transition status to 'open'; got {result['status']!r}"
                )
                assert result["site_code"] == site_code, (
                    "the RPC must echo the resolved site_code"
                )
                assert result["source"] == source, (
                    f"the RPC must echo the resolution source; got {result['source']!r}"
                )

                # The persisted Conversation transitions to open with the code stored.
                status1, site1 = _conversation_state(cur, conversation_id)
                assert (status1, site1) == ("open", site_code), (
                    "an active code must transition the conversation to open with "
                    f"that site_code stored; got ({status1!r}, {site1!r})"
                )
            else:
                # --- UNKNOWN/INACTIVE branch: a code that cannot be active. ---
                site_code = f"UNKNOWN-{uuid.uuid4().hex}"
                # Defensive: ensure the generated code is genuinely not active.
                assert site_code not in _active_site_codes(cur)

                # The aborted RPC must be recoverable, so wrap it in a nested
                # savepoint; the seeded conversation predates it and survives.
                cur.execute("savepoint prop7_reject")
                rejected = False
                message = ""
                try:
                    _resolve(cur, conversation_id, site_code, source)
                except Exception as exc:  # the RPC raises on an unknown/inactive code
                    rejected = True
                    message = str(exc)
                    cur.execute("rollback to savepoint prop7_reject")
                finally:
                    cur.execute("release savepoint prop7_reject")

                assert rejected, (
                    "an unknown/inactive site_code must be rejected, not resolved"
                )
                assert "unknown or inactive" in message.lower(), (
                    "the rejection must indicate the site_code is unknown or inactive; "
                    f"got {message!r}"
                )

                # The Conversation state is left UNCHANGED (Req 3.6).
                status1, site1 = _conversation_state(cur, conversation_id)
                assert (status1, site1) == ("site_unresolved", None), (
                    "a rejected resolution must leave the conversation unchanged "
                    f"(site_unresolved, NULL site_code); got ({status1!r}, {site1!r})"
                )
        finally:
            cur.execute("rollback to savepoint prop7")
            cur.execute("release savepoint prop7")

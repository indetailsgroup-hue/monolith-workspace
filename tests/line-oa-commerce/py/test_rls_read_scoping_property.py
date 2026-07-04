"""Property test — RLS read scoping (LINE OA Commerce, Module B5).

Spec task: 3.3 Write property test for RLS read scoping.

Implements exactly ONE numbered property against the SELECT policies shipped by
task 3.1 (``00000000000003_line_oa_rls.sql``), which gate every ``line_oa_*``
table ``TO authenticated USING (public.is_governance_role() OR
public.has_site_access(site_code))`` and reuse the shipped C12 helpers:

    Property 27: Reads return exactly the rows the principal may access
    (Governance sees all; Branch sees only has_site_access rows; no
    site_unresolved for Branch).
    Validates: Requirements 12.1, 12.2, 12.3, 12.7.

For every generated topology the test, as the (RLS-bypassing) table owner, seeds
rows across multiple ``site_code`` values plus ``site_unresolved`` (NULL
``site_code``) rows in five state-bearing tables — conversations, inbound
messages, outbound messages, orders, and the audit log — then reads each table:

  * as a **Governance** principal (``app_metadata.roles=['admin']`` →
    ``public.is_governance_role()`` is true): asserts every seeded row is
    visible, including the ``site_unresolved`` (NULL ``site_code``) rows
    (Req 12.2);
  * as a **Branch** principal (``app_metadata.roles=['branch_manager']`` with a
    generated ``site_codes`` access set): asserts it sees **exactly** the rows
    whose ``site_code`` it has access to via ``public.has_site_access()``
    (Req 12.1, 12.3), and **never** any ``site_unresolved`` (NULL ``site_code``)
    row, since ``has_site_access(NULL)`` is false (Req 12.7).

Inbound/outbound rows have no direct ``site_code``; their visibility resolves
through the owning conversation, so a branch principal sees exactly the
inbound/outbound rows of conversations it can read.

The session is simulated with the platform convention used by the shipped RLS
verification harness: ``set_config('request.jwt.claims', ...)`` to inject the
JWT claims the C12 helpers consume, then ``set role authenticated`` so the
policies are enforced (the owner/superuser otherwise bypasses RLS). Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the C12 helpers /
``auth.jwt()`` are absent, or RLS cannot be exercised as ``authenticated``.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Verticals used to vary rows (vertical_context is NOT NULL on these tables but
# is not part of the site-scope RLS predicate — it only adds row variety).
VERTICALS = ("monolith", "tcck")

# The five state-bearing tables whose SELECT policies this property exercises.
_TABLES = (
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_orders",
    "line_oa_audit_log",
)

_GOV_CLAIMS = json.dumps({"app_metadata": {"roles": ["admin"]}})


# ---------------------------------------------------------------------------
# Strategy: a seeded topology + a branch access set.
# ---------------------------------------------------------------------------


@st.composite
def _rls_scenario(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a topology of site codes, branch access, and per-row site refs.

    Each per-row site reference is an index into the site pool, or ``-1`` to mean
    a ``site_unresolved`` (NULL ``site_code``) row.
    """
    num_sites = draw(st.integers(min_value=1, max_value=4))
    branch_access = draw(
        st.lists(st.booleans(), min_size=num_sites, max_size=num_sites)
    )
    site_ref = st.integers(min_value=-1, max_value=num_sites - 1)
    convos = draw(st.lists(site_ref, min_size=1, max_size=6))
    orders = draw(st.lists(site_ref, min_size=0, max_size=5))
    audits = draw(st.lists(site_ref, min_size=0, max_size=5))
    return {
        "num_sites": num_sites,
        "branch_access": branch_access,
        "convos": convos,
        "orders": orders,
        "audits": audits,
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / C12 helpers are
# unavailable or RLS cannot be exercised as `authenticated`.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping RLS read-scoping "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping RLS read-scoping test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping RLS read-scoping test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _best_effort_grant(cur: Any) -> None:
    """Grant SELECT to ``authenticated`` if we can; ignore if already granted.

    Runs inside a sub-savepoint so a lack of GRANT privilege never aborts the
    surrounding transaction (the platform usually pre-grants these).
    """
    cur.execute("savepoint grant_sp")
    try:
        cur.execute(
            "grant select on "
            "public.line_oa_conversations, public.line_oa_inbound_messages, "
            "public.line_oa_outbound_messages, public.line_oa_orders, "
            "public.line_oa_audit_log to authenticated"
        )
        cur.execute("release savepoint grant_sp")
    except Exception:
        cur.execute("rollback to savepoint grant_sp")
        cur.execute("release savepoint grant_sp")


def _require_dependencies(conn: Any) -> None:
    """Skip unless the C12 helpers, ``auth.jwt()``, the ``authenticated`` role,
    and the line_oa tables are present AND RLS can be exercised as authenticated.
    """
    with conn.cursor() as cur:
        for proc in (
            "public.is_governance_role()",
            "public.has_site_access(text)",
            "auth.jwt()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping RLS "
                    "read-scoping property test."
                )

        cur.execute("select 1 from pg_roles where rolname = 'authenticated'")
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "the 'authenticated' role is not present; skipping RLS "
                "read-scoping property test."
            )

        # Probe: can we read each table as `authenticated` under RLS?
        cur.execute("savepoint probe")
        try:
            _best_effort_grant(cur)
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute("set role authenticated")
            for table in _TABLES:
                cur.execute(f"select count(*) from public.{table}")
                cur.fetchone()
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise RLS as 'authenticated'; skipping RLS "
                f"read-scoping property test ({exc})."
            )
        else:
            cur.execute("reset role")
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_counts(cur: Any, token: str) -> dict[str, int]:
    """Count this run's seeded rows visible under the current role/claims."""
    conv_pat = f"{token}:c:%"
    in_pat = f"{token}:in:%"
    audit_pat = f"{token}:a:%"
    out_key = f"{token}:out"

    cur.execute(
        "select count(*) from public.line_oa_conversations where line_user_id like %s",
        (conv_pat,),
    )
    conv = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_conversations "
        "where line_user_id like %s and site_code is null",
        (conv_pat,),
    )
    conv_null = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_inbound_messages where webhook_event_id like %s",
        (in_pat,),
    )
    inbound = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_outbound_messages where template_key = %s",
        (out_key,),
    )
    outbound = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_orders where canonical_payload->>'token' = %s",
        (token,),
    )
    orders = cur.fetchone()[0]
    cur.execute(
        "select count(*) from public.line_oa_audit_log where entity_ref like %s",
        (audit_pat,),
    )
    audit = cur.fetchone()[0]
    return {
        "conv": conv,
        "conv_null": conv_null,
        "inbound": inbound,
        "outbound": outbound,
        "orders": orders,
        "audit": audit,
    }


def _read_as(cur: Any, claims: str, token: str) -> dict[str, int]:
    """Read this run's visible counts as the principal described by ``claims``."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
    cur.execute("set role authenticated")
    try:
        return _read_counts(cur, token)
    finally:
        cur.execute("reset role")


# ---------------------------------------------------------------------------
# Property 27
# ---------------------------------------------------------------------------


@property(
    27,
    "Reads return exactly the rows the principal may access (Governance sees all; "
    "Branch sees only has_site_access rows; no site_unresolved for Branch)",
)
@given(scenario=_rls_scenario())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_rls_read_scoping(db_conn: Any, scenario: dict[str, Any]) -> None:
    """**Validates: Requirements 12.1, 12.2, 12.3, 12.7**"""
    num_sites: int = scenario["num_sites"]
    branch_access: list[bool] = scenario["branch_access"]
    convos: list[int] = scenario["convos"]
    orders: list[int] = scenario["orders"]
    audits: list[int] = scenario["audits"]

    token = uuid.uuid4().hex
    site_codes = [f"{token}-S{j}" for j in range(num_sites)]
    accessible_codes = [site_codes[j] for j in range(num_sites) if branch_access[j]]
    branch_claims = json.dumps(
        {"app_metadata": {"roles": ["branch_manager"], "site_codes": accessible_codes}}
    )

    def _site_of(ref: int) -> str | None:
        return site_codes[ref] if ref >= 0 else None

    def _branch_visible(ref: int) -> bool:
        # has_site_access(NULL) is false; otherwise true iff the code is granted.
        return ref >= 0 and branch_access[ref]

    visible_convos = sum(1 for ref in convos if _branch_visible(ref))
    visible_orders = sum(1 for ref in orders if _branch_visible(ref))
    visible_audit = sum(1 for ref in audits if _branch_visible(ref))
    null_convos = sum(1 for ref in convos if ref < 0)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop27")
        try:
            # ---- Seed as the table owner (RLS bypassed; no client write policy). ----
            for i, ref in enumerate(convos):
                site = _site_of(ref)
                status = "open" if site is not None else "site_unresolved"
                vert = VERTICALS[i % len(VERTICALS)]
                cur.execute(
                    "insert into public.line_oa_conversations "
                    "(line_user_id, vertical_context, site_code, status) "
                    "values (%s, %s, %s, %s) returning id",
                    (f"{token}:c:{i}", vert, site, status),
                )
                conversation_id = cur.fetchone()[0]
                cur.execute(
                    "insert into public.line_oa_inbound_messages "
                    "(conversation_id, webhook_event_id, payload) "
                    "values (%s, %s, '{}'::jsonb)",
                    (conversation_id, f"{token}:in:{i}"),
                )
                cur.execute(
                    "insert into public.line_oa_outbound_messages "
                    "(conversation_id, send_type, status, template_key, slot_values) "
                    "values (%s, 'push', 'pending', %s, '{}'::jsonb)",
                    (conversation_id, f"{token}:out"),
                )

            for j, ref in enumerate(orders):
                site = _site_of(ref)
                vert = VERTICALS[j % len(VERTICALS)]
                cur.execute(
                    "insert into public.line_oa_orders "
                    "(vertical_context, site_code, canonical_payload) "
                    "values (%s, %s, %s::jsonb)",
                    (vert, site, json.dumps({"token": token, "j": j})),
                )

            for k, ref in enumerate(audits):
                site = _site_of(ref)
                vert = VERTICALS[k % len(VERTICALS)]
                cur.execute(
                    "insert into public.line_oa_audit_log "
                    "(event_type, vertical_context, site_code, entity_ref, performed_by) "
                    "values ('rls_test', %s, %s, %s, 'rls-test')",
                    (vert, site, f"{token}:a:{k}"),
                )

            _best_effort_grant(cur)

            # ---- Read as Governance (Req 12.2): everything is visible. ----
            gov = _read_as(cur, _GOV_CLAIMS, token)
            assert gov == {
                "conv": len(convos),
                "conv_null": null_convos,
                "inbound": len(convos),
                "outbound": len(convos),
                "orders": len(orders),
                "audit": len(audits),
            }, f"governance must see every seeded row, including site_unresolved: {gov}"

            # ---- Read as Branch (Req 12.1, 12.3, 12.7): exactly the accessible rows. ----
            branch = _read_as(cur, branch_claims, token)
            assert branch == {
                "conv": visible_convos,
                "conv_null": 0,  # Req 12.7 — has_site_access(NULL) is false
                "inbound": visible_convos,
                "outbound": visible_convos,
                "orders": visible_orders,
                "audit": visible_audit,
            }, (
                "branch must see exactly its has_site_access rows and no "
                f"site_unresolved row: {branch}"
            )
        finally:
            cur.execute("rollback to savepoint prop27")
            cur.execute("release savepoint prop27")
            try:
                cur.execute("reset role")
            except Exception:
                pass

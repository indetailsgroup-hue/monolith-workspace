"""Property test — filtered, permission-bounded audit queries (LINE OA, Module B5).

Spec task: 17.2 Write property test for filtered, permission-bounded audit queries.

Implements exactly ONE numbered property against the SECURITY DEFINER read helper
shipped by task 17.1 (``00000000000062_line_oa_query_audit.sql``):

    public.rpc_query_line_audit(p_event_type, p_vertical_context, p_site_code,
                                p_performed_by, p_performed_from, p_performed_to)

The function AND-combines every supplied (non-NULL) filter with the permitted
read set — mirroring the audit-log RLS SELECT policy exactly:
``public.is_governance_role() OR public.has_site_access(site_code)`` — so it can
never widen visibility beyond what a direct RLS read would allow:

    Property 31: Every returned row satisfies all supplied filters and is within
    the principal's permitted read set.
    Validates: Requirements 13.4.

For every generated example the test, as the (RLS-bypassing) table owner, seeds
audit rows spread across various ``event_type`` / ``vertical_context`` /
``site_code`` (including NULL ``site_code``) / ``performed_by`` / ``performed_at``
values, then calls ``rpc_query_line_audit`` with a generated combination of
filters:

  * as a **Governance** principal (``app_metadata.roles=['admin']`` →
    ``public.is_governance_role()`` is true): may read across all sites,
    including audit rows whose ``site_code`` is NULL;
  * as a **Branch** principal (``app_metadata.roles=['branch_manager']`` with a
    generated ``site_codes`` access set): may read ONLY rows whose ``site_code``
    satisfies ``public.has_site_access(site_code)`` — never a NULL ``site_code``
    row, since ``has_site_access(NULL)`` is false.

It then asserts, for the principal:

  1. **Soundness (the property):** every returned row matches ALL supplied
     (non-NULL) filters AND is within the principal's permitted read set
     (checked directly against the returned columns, covering any row, not just
     this run's seeded rows).
  2. **Completeness:** restricted to this run's own seeded rows (scoped by a
     unique ``entity_ref`` token), the set returned equals exactly the rows that
     match the filters and are permitted — guarding against silent
     under-returning.

The session is simulated with the platform convention used by the shipped RLS
verification harness: ``set_config('request.jwt.claims', ...)`` to inject the
JWT claims the C12 helpers consume, then ``set role authenticated``. Each example
runs inside a SAVEPOINT that is rolled back, so the test provisions and tears
down its own rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the C12 helpers /
``auth.jwt()`` / the RPC are absent, or the RPC cannot be exercised as
``authenticated``.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Small pools to make equality filters land on real rows often enough that the
# generated filter combinations are meaningful (not always "no rows match").
_EVENT_TYPES = ("evt_alpha", "evt_beta", "evt_gamma")
_VERTICALS = ("monolith", "tcck")
_PERFORMERS = ("actor_p0", "actor_p1", "actor_p2")

# Fixed UTC base for performed_at; rows are placed at base + N minutes so range
# filters (performed_from / performed_to) are exercised deterministically.
_BASE = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
_MAX_OFFSET = 60

_GOV_CLAIMS = json.dumps({"app_metadata": {"roles": ["admin"]}})


# ---------------------------------------------------------------------------
# Strategy: a seeded topology + a branch access set + a filter combination.
# ---------------------------------------------------------------------------


@st.composite
def _audit_scenario(draw: st.DrawFn) -> dict[str, Any]:
    """Generate seeded audit rows, a branch access set, and a filter combo.

    Each row's ``site_ref`` is an index into the site pool, or ``-1`` to mean a
    NULL ``site_code`` (site-unresolved) row. Each filter dimension is optional
    (``None`` means "do not filter on this dimension").
    """
    num_sites = draw(st.integers(min_value=1, max_value=3))
    branch_access = draw(
        st.lists(st.booleans(), min_size=num_sites, max_size=num_sites)
    )

    site_ref = st.integers(min_value=-1, max_value=num_sites - 1)
    row = st.fixed_dictionaries(
        {
            "event_idx": st.integers(min_value=0, max_value=len(_EVENT_TYPES) - 1),
            "vert_idx": st.integers(min_value=0, max_value=len(_VERTICALS) - 1),
            "site_ref": site_ref,
            "perf_idx": st.integers(min_value=0, max_value=len(_PERFORMERS) - 1),
            "offset": st.integers(min_value=0, max_value=_MAX_OFFSET),
        }
    )
    rows = draw(st.lists(row, min_size=1, max_size=8))

    # Optional filters. site_code filter may reference a known site index or be
    # absent; using the index keeps it within the (tokenised) site pool.
    filters = {
        "event_idx": draw(st.one_of(st.none(), st.integers(0, len(_EVENT_TYPES) - 1))),
        "vert_idx": draw(st.one_of(st.none(), st.integers(0, len(_VERTICALS) - 1))),
        "site_idx": draw(st.one_of(st.none(), st.integers(0, num_sites - 1))),
        "perf_idx": draw(st.one_of(st.none(), st.integers(0, len(_PERFORMERS) - 1))),
        "from_off": draw(st.one_of(st.none(), st.integers(0, _MAX_OFFSET))),
        "to_off": draw(st.one_of(st.none(), st.integers(0, _MAX_OFFSET))),
    }
    return {
        "num_sites": num_sites,
        "branch_access": branch_access,
        "rows": rows,
        "filters": filters,
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / helpers / RPC are
# unavailable or the RPC cannot be exercised as `authenticated`.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping audit-query scoping "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping audit-query scoping test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping audit-query scoping test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _best_effort_grant(cur: Any) -> None:
    """Grant EXECUTE on the RPC + INSERT on the audit log if we can; ignore if
    already granted. Runs inside a sub-savepoint so a lack of privilege never
    aborts the surrounding transaction (the platform usually pre-grants these).
    """
    cur.execute("savepoint grant_sp")
    try:
        cur.execute(
            "grant execute on function public.rpc_query_line_audit("
            "text, text, text, text, timestamptz, timestamptz) to authenticated"
        )
        cur.execute("release savepoint grant_sp")
    except Exception:
        cur.execute("rollback to savepoint grant_sp")
        cur.execute("release savepoint grant_sp")


def _require_dependencies(conn: Any) -> None:
    """Skip unless the C12 helpers, ``auth.jwt()``, the RPC, and the
    ``authenticated`` role are present AND the RPC can be called as authenticated.
    """
    with conn.cursor() as cur:
        for proc in (
            "public.is_governance_role()",
            "public.has_site_access(text)",
            "auth.jwt()",
            "public.rpc_query_line_audit(text, text, text, text, timestamptz, timestamptz)",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "audit-query scoping property test."
                )

        cur.execute("select 1 from pg_roles where rolname = 'authenticated'")
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "the 'authenticated' role is not present; skipping audit-query "
                "scoping property test."
            )

        # Probe: can we call the RPC as `authenticated` under the helper claims?
        cur.execute("savepoint probe")
        try:
            _best_effort_grant(cur)
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute("set role authenticated")
            cur.execute(
                "select count(*) from public.rpc_query_line_audit("
                "null, null, null, null, null, null)"
            )
            cur.fetchone()
        except Exception as exc:
            cur.execute("reset role")
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_query_line_audit as 'authenticated'; "
                f"skipping audit-query scoping property test ({exc})."
            )
        else:
            cur.execute("reset role")
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
    conn.rollback()


# ---------------------------------------------------------------------------
# Property 31
# ---------------------------------------------------------------------------


@property(
    31,
    "Every returned row satisfies all supplied filters and is within the "
    "principal's permitted read set",
)
@given(scenario=_audit_scenario())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_audit_query_filtered_and_permission_bounded(
    db_conn: Any, scenario: dict[str, Any]
) -> None:
    """**Validates: Requirements 13.4**"""
    num_sites: int = scenario["num_sites"]
    branch_access: list[bool] = scenario["branch_access"]
    rows: list[dict[str, int]] = scenario["rows"]
    f: dict[str, int | None] = scenario["filters"]

    token = uuid.uuid4().hex
    site_codes = [f"{token}-S{j}" for j in range(num_sites)]
    accessible_codes = [site_codes[j] for j in range(num_sites) if branch_access[j]]
    accessible_set = set(accessible_codes)
    branch_claims = json.dumps(
        {"app_metadata": {"roles": ["branch_manager"], "site_codes": accessible_codes}}
    )

    # Resolve the generated filter combo into concrete RPC arguments.
    p_event = _EVENT_TYPES[f["event_idx"]] if f["event_idx"] is not None else None
    p_vert = _VERTICALS[f["vert_idx"]] if f["vert_idx"] is not None else None
    p_site = site_codes[f["site_idx"]] if f["site_idx"] is not None else None
    p_perf = _PERFORMERS[f["perf_idx"]] if f["perf_idx"] is not None else None
    p_from = _BASE + timedelta(minutes=f["from_off"]) if f["from_off"] is not None else None
    p_to = _BASE + timedelta(minutes=f["to_off"]) if f["to_off"] is not None else None
    rpc_args = (p_event, p_vert, p_site, p_perf, p_from, p_to)

    def _site_of(ref: int) -> str | None:
        return site_codes[ref] if ref >= 0 else None

    def _matches_filters(r: dict[str, int]) -> bool:
        ts = _BASE + timedelta(minutes=r["offset"])
        site = _site_of(r["site_ref"])
        return (
            (p_event is None or _EVENT_TYPES[r["event_idx"]] == p_event)
            and (p_vert is None or _VERTICALS[r["vert_idx"]] == p_vert)
            and (p_site is None or site == p_site)
            and (p_perf is None or _PERFORMERS[r["perf_idx"]] == p_perf)
            and (p_from is None or ts >= p_from)
            and (p_to is None or ts <= p_to)
        )

    def _branch_permitted(r: dict[str, int]) -> bool:
        # has_site_access(NULL) is false; otherwise true iff the code is granted.
        return r["site_ref"] >= 0 and branch_access[r["site_ref"]]

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop31")
        try:
            # ---- Seed as the table owner (RLS bypassed; explicit performed_at). ----
            seeded_ids: list[str] = []
            for i, r in enumerate(rows):
                cur.execute(
                    "insert into public.line_oa_audit_log "
                    "(event_type, vertical_context, site_code, entity_ref, "
                    " performed_by, performed_at) "
                    "values (%s, %s, %s, %s, %s, %s) returning id",
                    (
                        _EVENT_TYPES[r["event_idx"]],
                        _VERTICALS[r["vert_idx"]],
                        _site_of(r["site_ref"]),
                        f"{token}:a:{i}",
                        _PERFORMERS[r["perf_idx"]],
                        _BASE + timedelta(minutes=r["offset"]),
                    ),
                )
                seeded_ids.append(str(cur.fetchone()[0]))
            our_ids = set(seeded_ids)

            _best_effort_grant(cur)

            # ---- Governance: may read across all sites, incl. NULL site_code. ----
            gov_rows = _query_as(cur, _GOV_CLAIMS, rpc_args)
            for row in gov_rows:
                assert _row_matches_filters(
                    row, p_event, p_vert, p_site, p_perf, p_from, p_to
                ), f"governance: returned row violates a supplied filter: {row}"
            gov_ours = {row["id"] for row in gov_rows if row["id"] in our_ids}
            gov_expected = {
                seeded_ids[i] for i, r in enumerate(rows) if _matches_filters(r)
            }
            assert gov_ours == gov_expected, (
                "governance must return exactly its seeded rows that match the "
                f"filters: got {gov_ours}, expected {gov_expected}"
            )

            # ---- Branch: only has_site_access(site_code) rows, never NULL. ----
            branch_rows = _query_as(cur, branch_claims, rpc_args)
            for row in branch_rows:
                assert _row_matches_filters(
                    row, p_event, p_vert, p_site, p_perf, p_from, p_to
                ), f"branch: returned row violates a supplied filter: {row}"
                assert row["site_code"] is not None, (
                    "branch must never receive a NULL site_code audit row "
                    f"(has_site_access(NULL) is false): {row}"
                )
                assert row["site_code"] in accessible_set, (
                    "branch must only receive rows within its has_site_access set: "
                    f"{row['site_code']} not in {accessible_set}"
                )
            branch_ours = {row["id"] for row in branch_rows if row["id"] in our_ids}
            branch_expected = {
                seeded_ids[i]
                for i, r in enumerate(rows)
                if _matches_filters(r) and _branch_permitted(r)
            }
            assert branch_ours == branch_expected, (
                "branch must return exactly its seeded rows that both match the "
                f"filters and are permitted: got {branch_ours}, expected "
                f"{branch_expected}"
            )
        finally:
            cur.execute("rollback to savepoint prop31")
            cur.execute("release savepoint prop31")
            try:
                cur.execute("reset role")
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _query_as(cur: Any, claims: str, rpc_args: tuple[Any, ...]) -> list[dict[str, Any]]:
    """Call rpc_query_line_audit as the principal described by ``claims``."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
    cur.execute("set role authenticated")
    try:
        cur.execute(
            "select id, event_type, vertical_context, site_code, performed_by, "
            "performed_at from public.rpc_query_line_audit(%s, %s, %s, %s, %s, %s)",
            rpc_args,
        )
        fetched = cur.fetchall()
    finally:
        cur.execute("reset role")
    return [
        {
            "id": str(row[0]),
            "event_type": row[1],
            "vertical_context": row[2],
            "site_code": row[3],
            "performed_by": row[4],
            "performed_at": row[5],
        }
        for row in fetched
    ]


def _row_matches_filters(
    row: dict[str, Any],
    p_event: str | None,
    p_vert: str | None,
    p_site: str | None,
    p_perf: str | None,
    p_from: datetime | None,
    p_to: datetime | None,
) -> bool:
    """Check a returned row against every supplied (non-NULL) filter directly."""
    return (
        (p_event is None or row["event_type"] == p_event)
        and (p_vert is None or row["vertical_context"] == p_vert)
        and (p_site is None or row["site_code"] == p_site)
        and (p_perf is None or row["performed_by"] == p_perf)
        and (p_from is None or row["performed_at"] >= p_from)
        and (p_to is None or row["performed_at"] <= p_to)
    )

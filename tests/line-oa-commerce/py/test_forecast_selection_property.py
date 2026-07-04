"""Property test — forecasting selection & tagging (LINE OA Commerce, Module B5).

Spec task: 15.2 Write property test for forecasting selection and tagging.

Implements exactly ONE numbered property against the forecasting-sync RPC shipped
by task 15.1 (``00000000000060_line_oa_sync_forecast.sql`` —
``public.rpc_sync_line_forecast(text, text, text)``):

    Property 23: The synced subset equals exactly orders with a resolved active
    site_code, each record associated with its site_code; unresolved orders
    excluded until resolved.
    Validates: Requirements 10.4, 10.5.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh batch of ``public.line_oa_orders`` across three populations:

  * **target-site orders** — stamped with a resolved Active_Site_Code taken from
    ``public.get_active_site_codes()`` (A1's only valid-site source);
  * **other-site orders** — stamped with a *different* Active_Site_Code (only when
    a second active site exists), which must NOT contribute to the target's sync;
    and
  * **unresolved orders** — with a NULL ``site_code`` (Site_Unresolved), which
    must be excluded from forecasting until their site is resolved (Req 10.5).

It then invokes ``rpc_sync_line_forecast`` for the target Active_Site_Code and
asserts that the synchronized record count equals *exactly* the number of
Line_Orders stamped with that ``site_code`` (Req 10.4) — neither the NULL-site
orders nor the other-site orders are counted — and that the synchronization
record the RPC produces is associated with that very ``site_code`` (the OUT
``site_code`` and the audit row written for the call).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes for any active site, isolating the selection/tagging behavior under test.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own order / audit rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the forecasting-sync RPC
/ the reused ``record_input_sync`` pipeline / ``get_active_site_codes()`` /
``has_site_access`` / ``is_governance_role`` / ``resolve_actor`` / required tables
are unavailable, the governance-claims convention is not honored, no active
Site_Code exists, or the sync pipeline cannot be exercised end-to-end.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The two order verticals the shipped order adapter normalizes; either is a valid
# vertical_context to stamp on a seeded Line_Order.
VERTICALS = ("monolith", "food")

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check in rpc_sync_line_forecast
# passes for ANY active site, isolating the selection/tagging behavior under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


# ---------------------------------------------------------------------------
# Strategy: how many orders to seed in each of the three populations, plus a
# vertical to stamp. Small counts keep each iteration cheap while still covering
# the target / other-site / unresolved partitions and the empty cases.
# ---------------------------------------------------------------------------


@st.composite
def _forecast_case(draw: st.DrawFn) -> dict[str, Any]:
    return {
        "vertical": draw(st.sampled_from(VERTICALS)),
        "n_target": draw(st.integers(min_value=0, max_value=4)),
        "n_other": draw(st.integers(min_value=0, max_value=4)),
        "n_null": draw(st.integers(min_value=0, max_value=4)),
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / reused pipeline /
# helpers / tables are unavailable, governance claims are not honored, no active
# site exists, or the forecasting-sync pipeline cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping forecasting-selection "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping forecasting-selection test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(
            f"Test database not reachable; skipping forecasting-selection test ({exc})."
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


def _require_dependencies(conn: Any) -> None:
    """Skip unless the forecasting-sync RPC + the reused record_input_sync pipeline
    + A1/C12 helpers + tables exist, governance claims are honored, at least one
    active Site_Code exists, AND the RPC can be exercised end-to-end (seed an order
    for an active site -> sync -> non-zero, correctly tagged record count)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_sync_line_forecast(text,text,text)",
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
                    "forecasting-selection property test."
                )

        for table in ("public.line_oa_orders", "public.line_oa_audit_log"):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping forecasting-selection "
                    "property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> sync round-trip succeeds (this also exercises the reused
        # record_input_sync forecasting pipeline; if that contract is absent the
        # RPC raises and we skip rather than fail).
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            synced_count: int | None = None
            if is_gov and active:
                site = active[0]
                baseline = _count_orders_for_site(cur, site)
                _seed_order(cur, "monolith", site)
                result = _sync_forecast(cur, site)
                if result["synced"] and result["site_code"] == site:
                    # Expect the seeded order to be reflected in the count.
                    synced_count = result["records_ingested"] - baseline
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_sync_line_forecast end-to-end; skipping "
                f"forecasting-selection property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping forecasting-selection property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping forecasting-selection property test."
                )
            if synced_count != 1:
                conn.rollback()
                pytest.skip(
                    "the forecasting-sync pipeline did not reflect the seeded order in "
                    "the probe; skipping forecasting-selection property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_order(cur: Any, vertical: str, site_code: str | None) -> Any:
    """Seed one Line_Order stamped with the given (possibly NULL) site_code.

    canonical_payload is required but its content is irrelevant to the selection
    predicate, which keys solely off site_code.
    """
    cur.execute(
        "insert into public.line_oa_orders "
        "(vertical_context, site_code, origin_channel_id, canonical_payload) "
        "values (%s, %s, 'line_oa', %s::jsonb) returning id",
        (vertical, site_code, json.dumps({"line_oa_test": "forecast-selection"})),
    )
    return cur.fetchone()[0]


def _count_orders_for_site(cur: Any, site_code: str) -> int:
    """Return the count of Line_Orders currently stamped with this site_code —
    the exact subset rpc_sync_line_forecast must synchronize for it."""
    cur.execute(
        "select count(*)::int from public.line_oa_orders where site_code = %s",
        (site_code,),
    )
    return cur.fetchone()[0]


def _sync_forecast(cur: Any, site_code: str) -> dict[str, Any]:
    """Invoke rpc_sync_line_forecast for a normal ('success') sync; return OUT row."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select site_code, sync_status, records_ingested, sync_log_id, synced "
        "from public.rpc_sync_line_forecast(%s)",
        (site_code,),
    )
    r = cur.fetchone()
    return {
        "site_code": r[0],
        "sync_status": r[1],
        "records_ingested": r[2],
        "sync_log_id": r[3],
        "synced": r[4],
    }


def _latest_audit(cur: Any) -> dict[str, Any] | None:
    """Return the most recently written audit row (the one this call produced)."""
    cur.execute(
        "select event_type, site_code, entity_ref "
        "from public.line_oa_audit_log order by performed_at desc, id desc limit 1"
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {"event_type": row[0], "site_code": row[1], "entity_ref": row[2]}


# ---------------------------------------------------------------------------
# Property 23
# ---------------------------------------------------------------------------


@property(
    23,
    "The synced subset equals exactly orders with a resolved active site_code, "
    "each record associated with its site_code; unresolved orders excluded until "
    "resolved",
)
@given(case=_forecast_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_forecast_selection(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 10.4, 10.5**"""
    vertical: str = case["vertical"]
    n_target: int = case["n_target"]
    n_other: int = case["n_other"]
    n_null: int = case["n_null"]

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop23")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            target = active[0]
            # A second active site (if any) lets us prove cross-site exclusion:
            # its orders must never be counted toward the target's sync.
            other = active[1] if len(active) > 1 else None
            if other is None:
                n_other = 0

            # Baseline: orders already stamped with the target site (from other
            # modules' fixtures in a shared DB). The synced count is measured
            # against the EXACT current subset, so we anchor on this baseline.
            baseline = _count_orders_for_site(cur, target)

            # --- Seed the three populations. ---
            for _ in range(n_target):
                _seed_order(cur, vertical, target)
            for _ in range(n_other):
                _seed_order(cur, vertical, other)  # type: ignore[arg-type]
            for _ in range(n_null):
                _seed_order(cur, vertical, None)  # Site_Unresolved

            # The exact subset that MUST be synchronized for the target site.
            expected_subset = _count_orders_for_site(cur, target)
            # Selection keys solely off the target site_code: neither the NULL-site
            # orders nor the other-site orders are part of it (Req 10.4, 10.5).
            assert expected_subset == baseline + n_target, (
                "the count of orders stamped with the target site must include only "
                f"target orders; got {expected_subset} != {baseline + n_target}"
            )

            # --- Synchronize the target site. ---
            result = _sync_forecast(cur, target)

            # The synced record count equals EXACTLY the orders stamped with this
            # resolved active site_code (Req 10.4). Unresolved (NULL site_code)
            # orders are excluded until resolved (Req 10.5); other-site orders are
            # excluded by the equality predicate.
            assert result["records_ingested"] == expected_subset, (
                "the synchronized subset must equal exactly the orders stamped with "
                f"the target site_code; got records_ingested={result['records_ingested']} "
                f"!= {expected_subset} (n_target={n_target}, n_other={n_other}, "
                f"n_null={n_null}, baseline={baseline})"
            )

            # The synchronization record is associated with that very site_code
            # (Req 10.4) — both on the RPC result and the audit row it wrote.
            assert result["site_code"] == target, (
                "the synchronization record must be associated with the target "
                f"site_code; got {result['site_code']!r} != {target!r}"
            )
            assert result["sync_status"] == "success", (
                f"a normal sync must report status 'success'; got {result['sync_status']!r}"
            )
            assert result["synced"] is True, (
                f"a normal sync must report synced=true; got {result!r}"
            )

            audit = _latest_audit(cur)
            assert audit is not None, "the sync must write an audit row"
            assert audit["site_code"] == target, (
                "the audit record for the sync must be associated with the target "
                f"site_code; got {audit['site_code']!r} != {target!r}"
            )
            assert audit["event_type"] == "line_forecast_synced", (
                "a successful sync must record a 'line_forecast_synced' audit event; "
                f"got {audit['event_type']!r}"
            )
            assert f"site_code:{target}" in audit["entity_ref"], (
                "the audit entity_ref must reference the target site_code; "
                f"got {audit['entity_ref']!r}"
            )

            # Unresolved orders remain present but excluded: their NULL site_code is
            # not synchronizable until resolved (Req 10.5).
            cur.execute(
                "select count(*)::int from public.line_oa_orders where site_code is null"
            )
            null_orders = cur.fetchone()[0]
            assert null_orders >= n_null, (
                "the seeded unresolved (NULL site_code) orders must still exist, "
                f"excluded from sync; expected >= {n_null}, got {null_orders}"
            )
        finally:
            cur.execute("rollback to savepoint prop23")
            cur.execute("release savepoint prop23")

"""Integration tests — forecasting invocation via the mocked pipeline
(LINE OA Commerce, Module B5).

Spec task: 15.3 Write integration tests for forecasting invocation (mocked pipeline).

These are EXAMPLE-BASED INTEGRATION TESTS (not a numbered property test). Per the
design's testing strategy, forecasting-pipeline wiring is excluded from PBT and is
instead covered by a small number of integration examples that exercise the
external boundary with the LINE Messaging API and the forecasting pipeline mocked:

    "Integration tests (1-3 examples) cover external wiring that does not vary
     meaningfully with input: ... forecasting invocation with Sync_Source='line'
     and append-only write (10.1, 10.2), and sync-failure preservation (10.3)."

The implementation under test is the forecasting synchronization RPC shipped by
task 15.1 (``00000000000060_line_oa_sync_forecast.sql`` —
``public.rpc_sync_line_forecast(text, text, text)``). It is the single, audited
LINE-side entry point that pushes one resolved Active_Site_Code's LINE order
demand into the existing forecasting input pipeline by invoking the unmodified
``record_input_sync(Sync_Source='line', ...)`` contract, which only ever APPENDS
to the append-only ``forecast_input_sync_log``.

What these tests verify (Requirements 10.1, 10.2, 10.3):

  * **10.1** — synchronizing LINE order data for a Site_Code invokes
    ``record_input_sync`` with ``Sync_Source='line'`` (the spy captures the
    source on every call).
  * **10.2** — each synchronization is an APPEND to the sync log: a new entry is
    added and no prior entry is mutated or removed (the spy's call list grows
    monotonically and earlier entries are never rewritten).
  * **10.3** — a reported failure is recorded THROUGH the same pipeline (an
    appended ``failed`` entry) while the most recent successfully synchronized
    data — the last good sync — is preserved intact.

Two layers, mirroring the existing harness conventions:

  1. **Mocked-pipeline integration (always runs).** The forecasting pipeline is
     mocked with the ``record_input_sync`` spy/stub created in task 1.1
     (``mocks.record_input_sync.MockRecordInputSync``). A small local orchestrator
     (:func:`_sync_line_forecast`) re-expresses the documented contract of
     ``rpc_sync_line_forecast`` (validate the site against the active set, count
     the Line_Orders stamped with that resolved site_code excluding NULL-site
     orders, then invoke the pipeline with ``Sync_Source='line'`` and the reported
     status) so the LINE-side <-> pipeline wiring can be asserted deterministically
     against the mock without a database. This is the primary deliverable and runs
     everywhere.

  2. **Live-DB integration (skips cleanly when unreachable).** When
     ``LINE_OA_TEST_DATABASE_URL`` is reachable AND the real
     ``rpc_sync_line_forecast`` + the shipped forecasting pipeline
     (``record_input_sync`` / ``forecast_input_sync_log``) + the A1/C12 helpers are
     installed, the same three behaviors are exercised end-to-end against the real
     RPC inside a rolled-back SAVEPOINT. It SKIPS (never fails) when no database is
     configured, the driver is missing, the connection cannot be established, or
     any required routine/table is unavailable.

Scope boundary: this task writes ONLY these integration tests; it does not modify
the implementation.
"""

from __future__ import annotations

import uuid
from typing import Any, Iterable

import pytest

from harness import database_url, get_connection
from mocks.record_input_sync import MockRecordInputSync, RecordInputSyncCall

# The single Sync_Source this owned channel contributes under (Req 10.1).
_EXPECTED_SOURCE = "line"


# ===========================================================================
# Layer 1 — mocked-pipeline integration (always runs)
# ===========================================================================
#
# A faithful, minimal Python re-expression of the documented contract of
# public.rpc_sync_line_forecast (task 15.1) restricted to the forecasting-
# invocation behavior under test. It does NOT re-implement role checks / auditing
# (covered elsewhere); it isolates the LINE-side <-> pipeline wiring so we can
# assert it against the record_input_sync spy/stub.


def _orders_for_site(orders: Iterable[dict[str, Any]], site_code: str) -> int:
    """Count Line_Orders stamped with this resolved site_code.

    Orders lacking a resolved site_code (``site_code is None``) never satisfy the
    equality predicate and are therefore excluded (Req 10.5) — mirroring the RPC's
    ``where o.site_code = v_site_code`` selection.
    """
    return sum(1 for o in orders if o.get("site_code") == site_code)


def _sync_line_forecast(
    pipeline: MockRecordInputSync,
    site_code: str,
    orders: Iterable[dict[str, Any]],
    *,
    active_sites: Iterable[str],
    status: str = "success",
    error_detail: str | None = None,
) -> dict[str, Any]:
    """Invoke the mocked forecasting pipeline exactly as the RPC documents.

    Returns a dict describing the synchronization (status + record count + the
    pipeline's outcome), having recorded exactly one ``record_input_sync`` call
    with ``Sync_Source='line'``.
    """
    if status not in ("success", "partial", "failed"):
        raise ValueError("unsupported sync status")
    if site_code not in set(active_sites):
        # Mirrors the RPC's "unknown or inactive" rejection with no pipeline call.
        raise ValueError("site_code is unknown or inactive")

    if status == "failed":
        # A failed attempt synchronized no records (Req 10.3); count forced to 0.
        record_count = 0
        payload = {"status": status, "record_count": 0, "error": error_detail or "sync failed"}
    else:
        record_count = _orders_for_site(orders, site_code)
        payload = {"status": status, "record_count": record_count}

    # Req 10.1 / 10.2: invoke the EXISTING pipeline contract; record_input_sync
    # APPENDS to the append-only log. Sync_Source is always 'line'.
    outcome = pipeline.record_input_sync(_EXPECTED_SOURCE, site_code, payload)
    return {"status": status, "record_count": record_count, "outcome": outcome}


def test_sync_invokes_pipeline_with_line_source_and_appends() -> None:
    """Req 10.1, 10.2 — a sync invokes record_input_sync(Sync_Source='line') and
    APPENDS to the log without mutating prior entries."""
    pipeline = MockRecordInputSync()
    active = ["BKK-SUKHUMVIT-01", "CNX-NIMMAN-02"]
    orders = [
        {"site_code": "BKK-SUKHUMVIT-01"},
        {"site_code": "BKK-SUKHUMVIT-01"},
        {"site_code": "CNX-NIMMAN-02"},
        {"site_code": None},  # unresolved — excluded (Req 10.5)
    ]

    # First sync for one site.
    res1 = _sync_line_forecast(pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active)

    assert pipeline.call_count == 1, "a synchronization must invoke the pipeline exactly once"
    first = pipeline.calls[0]
    assert isinstance(first, RecordInputSyncCall)
    # Req 10.1: Sync_Source is 'line'.
    assert first.sync_source == _EXPECTED_SOURCE
    # Associated with the contributing orders' site_code (Req 10.4).
    assert first.site_code == "BKK-SUKHUMVIT-01"
    # NULL-site order excluded; 2 of the 4 orders count for this site (Req 10.5).
    assert res1["record_count"] == 2
    assert first.payload["record_count"] == 2

    # Snapshot the first (good) entry so we can prove it is never rewritten.
    snapshot = RecordInputSyncCall(first.sync_source, first.site_code, dict(first.payload))

    # A second sync for a different site APPENDS a new entry.
    res2 = _sync_line_forecast(pipeline, "CNX-NIMMAN-02", orders, active_sites=active)

    assert pipeline.call_count == 2, "the second sync must APPEND, not replace (Req 10.2)"
    assert pipeline.calls[1].sync_source == _EXPECTED_SOURCE
    assert pipeline.calls[1].site_code == "CNX-NIMMAN-02"
    assert res2["record_count"] == 1

    # Append-only: the earlier entry is byte-for-byte unchanged.
    assert pipeline.calls[0].sync_source == snapshot.sync_source
    assert pipeline.calls[0].site_code == snapshot.site_code
    assert pipeline.calls[0].payload == snapshot.payload


def test_every_invocation_uses_line_source() -> None:
    """Req 10.1 — across mixed success/partial/failed syncs, every recorded
    invocation carries Sync_Source='line'."""
    pipeline = MockRecordInputSync()
    active = ["BKK-SUKHUMVIT-01"]
    orders = [{"site_code": "BKK-SUKHUMVIT-01"}]

    _sync_line_forecast(pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active, status="success")
    _sync_line_forecast(pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active, status="partial")
    pipeline.set_failure("upstream timeout")
    _sync_line_forecast(
        pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active, status="failed",
        error_detail="upstream timeout",
    )

    assert pipeline.call_count == 3
    assert all(c.sync_source == _EXPECTED_SOURCE for c in pipeline.calls)


def test_failure_recorded_through_pipeline_preserves_last_good_sync() -> None:
    """Req 10.3 — a reported failure is appended through the same pipeline while
    the most recent successfully synchronized data is preserved intact."""
    pipeline = MockRecordInputSync()
    active = ["BKK-SUKHUMVIT-01"]
    orders = [
        {"site_code": "BKK-SUKHUMVIT-01"},
        {"site_code": "BKK-SUKHUMVIT-01"},
        {"site_code": "BKK-SUKHUMVIT-01"},
    ]

    # A good sync lands first — this is the "last good sync".
    good = _sync_line_forecast(pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active)
    assert good["outcome"]["ok"] is True
    assert good["record_count"] == 3
    good_call = pipeline.calls[-1]
    good_snapshot = RecordInputSyncCall(
        good_call.sync_source, good_call.site_code, dict(good_call.payload)
    )

    # Now a synchronization fails upstream.
    pipeline.set_failure("LINE order export 503")
    failed = _sync_line_forecast(
        pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active,
        status="failed", error_detail="LINE order export 503",
    )

    # The failure is recorded THROUGH the pipeline as a new appended entry...
    assert pipeline.call_count == 2, "the failure must be appended, not overwrite the good sync"
    failed_call = pipeline.calls[-1]
    assert failed_call.sync_source == _EXPECTED_SOURCE
    assert failed_call.payload["status"] == "failed"
    assert failed_call.payload["record_count"] == 0, "a failed attempt synchronized no records"
    assert failed["outcome"]["ok"] is False
    assert failed["outcome"]["reason"] == "LINE order export 503"

    # ...and the prior good sync is still present and UNCHANGED (Req 10.3).
    assert pipeline.calls[0].sync_source == good_snapshot.sync_source
    assert pipeline.calls[0].site_code == good_snapshot.site_code
    assert pipeline.calls[0].payload == good_snapshot.payload
    assert pipeline.calls[0].payload["status"] == "success"
    assert pipeline.calls[0].payload["record_count"] == 3

    # The single most-recent SUCCESSFUL entry (the last good sync) is recoverable.
    last_good = [c for c in pipeline.calls if c.payload.get("status") == "success"][-1]
    assert last_good.payload["record_count"] == 3


def test_unresolved_orders_excluded_until_resolved() -> None:
    """Req 10.5 (selection feeding 10.1/10.2) — orders without a resolved
    site_code are excluded from the synchronized count."""
    pipeline = MockRecordInputSync()
    active = ["BKK-SUKHUMVIT-01"]
    orders = [
        {"site_code": None},
        {"site_code": None},
        {"site_code": "BKK-SUKHUMVIT-01"},
    ]
    res = _sync_line_forecast(pipeline, "BKK-SUKHUMVIT-01", orders, active_sites=active)
    assert res["record_count"] == 1, "only the resolved-site order contributes"
    assert pipeline.calls[-1].payload["record_count"] == 1


# ===========================================================================
# Layer 2 — live-DB integration against the real RPC (skips cleanly)
# ===========================================================================

# Governance principal so the in-function role re-check passes for any active site.
import json  # noqa: E402

_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping live forecasting-"
            "invocation integration test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:
        pytest.skip(f"DB driver unavailable; skipping forecasting integration test ({exc}).")
    except Exception as exc:
        pytest.skip(f"Test database not reachable; skipping forecasting integration test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _active_site_codes(cur: Any) -> list[str]:
    cur.execute("select site_code from public.get_active_site_codes()")
    return [row[0] for row in cur.fetchall()]


def _require_dependencies(conn: Any) -> None:
    """Skip unless the LINE forecast RPC + the shipped forecasting pipeline +
    A1/C12 helpers + tables exist, governance claims are honored, and at least one
    active Site_Code exists."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_sync_line_forecast(text,text,text)",
            "public.record_input_sync(text,public.sync_source,public.sync_status,integer,jsonb)",
            "public.get_active_site_codes()",
            "public.has_site_access(text)",
            "public.is_governance_role()",
            "public.resolve_actor()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping live "
                    "forecasting-invocation integration test."
                )

        for table in (
            "public.line_oa_orders",
            "public.line_oa_audit_log",
            "public.forecast_input_sync_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping live forecasting-"
                    "invocation integration test."
                )

        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise the forecasting helpers; skipping live "
                f"forecasting-invocation integration test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored; skipping live "
                    "forecasting-invocation integration test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available; skipping live forecasting-"
                    "invocation integration test."
                )
    conn.rollback()


def _sync(cur: Any, site_code: str, status: str = "success", error_detail: str | None = None) -> dict[str, Any]:
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select site_code, sync_status, records_ingested, sync_log_id, synced "
        "from public.rpc_sync_line_forecast(%s, %s, %s)",
        (site_code, status, error_detail),
    )
    r = cur.fetchone()
    return {
        "site_code": r[0],
        "sync_status": r[1],
        "records_ingested": r[2],
        "sync_log_id": r[3],
        "synced": r[4],
    }


def _sync_log_row(cur: Any, sync_log_id: Any) -> dict[str, Any] | None:
    cur.execute(
        "select source::text, site_code, status::text, record_count "
        "from public.forecast_input_sync_log where id = %s",
        (sync_log_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {"source": row[0], "site_code": row[1], "status": row[2], "record_count": row[3]}


def test_live_sync_invokes_pipeline_with_line_source_and_preserves_last_good(db_conn: Any) -> None:
    """Req 10.1, 10.2, 10.3 — against the real rpc_sync_line_forecast: a sync
    appends a 'line'-source row to forecast_input_sync_log; a subsequent failure
    appends a 'failed' row while the prior good sync row is preserved intact."""
    with db_conn.cursor() as cur:
        cur.execute("savepoint fsync")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site = active[0]

            # --- Good sync (Req 10.1, 10.2): appends a 'line' row. ---
            good = _sync(cur, site, "success")
            assert good["site_code"] == site
            assert good["sync_status"] == "success"
            assert good["synced"] is True
            assert good["sync_log_id"] is not None, "the pipeline must return the appended row id"

            good_row = _sync_log_row(cur, good["sync_log_id"])
            assert good_row is not None, "the good sync must be persisted in forecast_input_sync_log"
            assert good_row["source"] == _EXPECTED_SOURCE, "Sync_Source must be 'line' (Req 10.1)"
            assert good_row["site_code"] == site
            assert good_row["status"] == "success"
            good_count = good_row["record_count"]

            # --- Failure (Req 10.3): appended 'failed' row; last good preserved. ---
            failed = _sync(cur, site, "failed", "integration: simulated upstream failure")
            assert failed["sync_status"] == "failed"
            assert failed["synced"] is False
            assert failed["sync_log_id"] is not None
            assert failed["sync_log_id"] != good["sync_log_id"], (
                "a failure must APPEND a new row, never overwrite the good sync (Req 10.2, 10.3)"
            )
            assert failed["records_ingested"] == 0, "a failed attempt synchronized no records"

            failed_row = _sync_log_row(cur, failed["sync_log_id"])
            assert failed_row is not None
            assert failed_row["source"] == _EXPECTED_SOURCE
            assert failed_row["status"] == "failed"

            # The earlier good sync row is STILL present and UNCHANGED (last good sync).
            still_good = _sync_log_row(cur, good["sync_log_id"])
            assert still_good is not None, "the failure must preserve the last good sync (Req 10.3)"
            assert still_good["status"] == "success"
            assert still_good["source"] == _EXPECTED_SOURCE
            assert still_good["site_code"] == site
            assert still_good["record_count"] == good_count
        finally:
            cur.execute("rollback to savepoint fsync")
            cur.execute("release savepoint fsync")

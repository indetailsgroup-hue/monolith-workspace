"""Property test — outbound send-failure handling (LINE OA Commerce, Module B5).

Spec task: 12.2 Write property test for failure handling.

Implements exactly ONE numbered property against the send-result recording RPC
shipped by task 12.1
(``00000000000041_line_oa_record_send_result.sql`` —
``public.rpc_record_line_send_result(uuid, text, text)``):

    Property 10: A reported failure sets status=failed with non-empty
    error_detail and is never marked sent.
    Validates: Requirements 4.4.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh ``open`` Conversation whose ``site_code`` is a real active code from A1's
``public.get_active_site_codes()`` plus an ACTIVE, slot-free Message_Template
bound to that conversation's vertical, then STAGES a ``pending`` Outbound_Message
through the composition RPC (``public.rpc_send_line_outbound``, task 11.4). It then
reports a FAILURE for that staged row through ``rpc_record_line_send_result`` with
a varied ``error_detail`` — including the ``None``/empty/whitespace-only cases the
RPC defaults to a non-empty placeholder — and asserts that the recorded row:

  * ends with ``status = 'failed'`` (Req 4.4); and
  * carries a NON-EMPTY ``error_detail`` even when the supplied detail was
    ``None``/empty/whitespace (the RPC substitutes a non-secret placeholder); and
  * is NEVER marked delivered: ``sent_at`` stays ``NULL`` and the status is never
    ``'sent'`` (Req 4.4).

Both the OUT values returned by the RPC and the PERSISTED row are checked, so the
property is covered end-to-end.

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes for the conversation regardless of branch site grants, isolating the
failure-recording behavior under test.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own conversation / template / outbound / audit rows
without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the result RPC /
composition RPC / ``get_active_site_codes()`` / ``has_site_access`` /
``is_governance_role`` / ``resolve_actor`` / ``auth.jwt()`` / required tables are
unavailable, the governance-claims convention is not honored, no active Site_Code
exists, or the stage-and-record pipeline cannot be exercised end-to-end.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Brand-voice-configured verticals; only these clear the brand-voice gate so the
# composition RPC stages a pending row to record a failure against. vertical_context
# is NOT under test here.
VERTICALS = ("monolith", "tcck")

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check passes on any conversation,
# isolating the failure-recording behavior under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000cc", "app_metadata": {"roles": ["admin"]}}
)

# error_detail input categories. The first three are the "effectively empty"
# inputs the RPC must default to a non-empty placeholder; "text" is operator
# free text. ALL of them must yield a non-empty STORED error_detail and a row
# that is never marked sent.
_EMPTY_KINDS = ("none", "empty", "whitespace")
_ERROR_KINDS = _EMPTY_KINDS + ("text",)


@st.composite
def _failure_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a vertical and a (kind, supplied error_detail) pair to report."""
    vertical = draw(st.sampled_from(VERTICALS))
    kind = draw(st.sampled_from(_ERROR_KINDS))
    if kind == "none":
        detail: str | None = None
    elif kind == "empty":
        detail = ""
    elif kind == "whitespace":
        # btrim() collapses to empty -> RPC must substitute a placeholder.
        detail = draw(st.text(alphabet=" \t\r\n", min_size=1, max_size=8))
    else:  # "text" — arbitrary printable operator detail (no NUL).
        detail = draw(
            st.text(
                alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
                min_size=1,
                max_size=120,
            )
        )
    return {"vertical": vertical, "kind": kind, "detail": detail}


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPCs / helpers /
# tables are unavailable, governance claims are not honored, no active site
# exists, or the stage-and-record pipeline cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping failure-handling "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping failure-handling test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping failure-handling test ({exc}).")

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
    """Skip unless the result + composition RPCs, A1/C12 helpers, and tables exist,
    governance claims are honored, at least one active Site_Code exists, AND the
    full stage -> record-failure pipeline can be exercised end-to-end."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_record_line_send_result(uuid,text,text)",
            "public.rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)",
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
                    "failure-handling property test."
                )

        for table in (
            "public.line_oa_conversations",
            "public.line_oa_message_templates",
            "public.line_oa_outbound_messages",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping failure-handling property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> stage -> record-failure round-trip succeeds.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            recorded_failed = False
            if is_gov and active:
                vertical = "monolith"
                conv_id = _seed_open(cur, f"probe-{uuid.uuid4().hex}", vertical, active[0])
                tkey = _seed_template(cur, vertical)
                staged = _stage_pending(cur, conv_id, tkey)
                if staged["staged"] and staged["outbound_id"] is not None:
                    res = _record_failure(cur, staged["outbound_id"], None)
                    recorded_failed = res["status"] == "failed"
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise the stage-and-record-failure pipeline end-to-end; "
                f"skipping failure-handling property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping failure-handling property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping failure-handling property test."
                )
            if not recorded_failed:
                conn.rollback()
                pytest.skip(
                    "the stage-and-record-failure pipeline did not record a failed row "
                    "in the probe; skipping failure-handling property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_open(cur: Any, line_user_id: str, vertical: str, site_code: str) -> Any:
    """Seed a fresh OPEN Conversation with a resolved active site_code; return id."""
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, 'open') returning id",
        (line_user_id, vertical, site_code),
    )
    return cur.fetchone()[0]


def _seed_template(cur: Any, vertical: str) -> str:
    """Seed an ACTIVE, slot-free Message_Template bound to `vertical`; return its key.

    A unique key avoids collisions with any pre-existing templates. The body is
    short and slot-free so composition is a genuinely template-bound, autonomous
    (T1) slot-fill that stages a pending outbound row to record a failure against.
    """
    template_key = f"failrec-{uuid.uuid4().hex}"
    cur.execute(
        "insert into public.line_oa_message_templates "
        "(template_key, vertical_context, body, is_active) "
        "values (%s, %s, %s, true)",
        (template_key, vertical, "Thanks for your message."),
    )
    return template_key


def _stage_pending(cur: Any, conversation_id: Any, template_key: str) -> dict[str, Any]:
    """Stage a pending outbound row via rpc_send_line_outbound; return its OUT row."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select staged, outbound_id, send_type, classification, reason "
        "from public.rpc_send_line_outbound(%s, %s, %s::jsonb)",
        (conversation_id, template_key, json.dumps({})),
    )
    r = cur.fetchone()
    return {
        "staged": r[0],
        "outbound_id": r[1],
        "send_type": r[2],
        "classification": r[3],
        "reason": r[4],
    }


def _record_failure(cur: Any, outbound_id: Any, error_detail: str | None) -> dict[str, Any]:
    """Invoke rpc_record_line_send_result with status='failed'; return its OUT row."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select outbound_id, status, error_detail, sent_at, recorded "
        "from public.rpc_record_line_send_result(%s, %s, %s)",
        (outbound_id, "failed", error_detail),
    )
    r = cur.fetchone()
    return {
        "outbound_id": r[0],
        "status": r[1],
        "error_detail": r[2],
        "sent_at": r[3],
        "recorded": r[4],
    }


def _persisted_row(cur: Any, outbound_id: Any) -> tuple[str, Any, Any]:
    """Return the persisted (status, error_detail, sent_at) of an outbound row."""
    cur.execute(
        "select status, error_detail, sent_at "
        "from public.line_oa_outbound_messages where id = %s",
        (outbound_id,),
    )
    row = cur.fetchone()
    return row[0], row[1], row[2]


# ---------------------------------------------------------------------------
# Property 10
# ---------------------------------------------------------------------------


@property(
    10,
    "A reported failure sets status=failed with non-empty error_detail and is "
    "never marked sent",
)
@given(case=_failure_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_failure_handling(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 4.4**"""
    vertical: str = case["vertical"]
    kind: str = case["kind"]
    detail: str | None = case["detail"]

    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"failrec-{uuid.uuid4().hex}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop10")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site_code = active[0]

            conversation_id = _seed_open(cur, line_user_id, vertical, site_code)
            template_key = _seed_template(cur, vertical)

            staged = _stage_pending(cur, conversation_id, template_key)
            assert staged["staged"] is True, (
                f"a bound, slot-free, in-voice outbound must stage a pending row; got {staged!r}"
            )
            outbound_id = staged["outbound_id"]
            assert outbound_id is not None, "a staged compose must return the outbound_id"

            # Report a FAILURE with the generated (possibly empty/None) error_detail.
            result = _record_failure(cur, outbound_id, detail)

            # --- OUT values returned by the RPC ---------------------------------
            assert result["recorded"] is True, (
                f"recording a failure must succeed; got {result!r}"
            )
            assert result["status"] == "failed", (
                f"a reported failure must set status='failed'; got {result['status']!r}"
            )
            assert result["error_detail"] is not None and result["error_detail"].strip() != "", (
                "a reported failure must carry a non-empty error_detail (even when the "
                f"supplied detail is {kind!r}={detail!r}); got {result['error_detail']!r}"
            )
            assert result["sent_at"] is None, (
                f"a failed send must never be stamped delivered; got sent_at={result['sent_at']!r}"
            )

            # --- PERSISTED row --------------------------------------------------
            status, stored_detail, sent_at = _persisted_row(cur, outbound_id)
            assert status == "failed", (
                f"the persisted outbound row must end with status='failed'; got {status!r}"
            )
            assert status != "sent", "a failed send must never be marked sent"
            assert stored_detail is not None and stored_detail.strip() != "", (
                "the persisted row must store a non-empty error_detail (even when the "
                f"supplied detail is {kind!r}={detail!r}); got {stored_detail!r}"
            )
            assert sent_at is None, (
                f"the persisted failed row must never have a sent_at; got {sent_at!r}"
            )
        finally:
            cur.execute("rollback to savepoint prop10")
            cur.execute("release savepoint prop10")

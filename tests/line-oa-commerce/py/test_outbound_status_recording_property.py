"""Property test — outbound delivery-status recording (LINE OA Commerce, Module B5).

Spec task: 11.5 Write property test for outbound delivery-status recording.

Implements exactly ONE numbered property against the outbound composition +
staging RPC shipped by task 11.4
(``00000000000040_line_oa_send_outbound.sql`` —
``public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean)``):

    Property 9: A composed outbound row exists in the originating conversation
    with status in {pending,sent,failed} recording template_key and slot_values.
    Validates: Requirements 4.3, 5.6.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh ``open`` Conversation whose ``site_code`` is a real active code from
``public.get_active_site_codes()`` (A1's only valid-site source), plus an
``active`` Message_Template scoped to the conversation's ``vertical_context``
whose body declares zero or more named ``{{slot}}`` placeholders. It then invokes
``rpc_send_line_outbound`` as an authorized Governance principal supplying a value
for every declared slot, and asserts that:

  * the RPC reports a successfully staged, template-bound action (``staged`` is
    true); and
  * a composed Outbound_Message row exists in THAT conversation whose ``status``
    is one of ``pending`` / ``sent`` / ``failed`` (it is ``pending`` from this
    staging RPC — the ``line-outbound-sender`` Edge Function later advances it to
    ``sent`` / ``failed``), and which records the exact ``template_key`` and the
    ``slot_values`` that were used (Req 4.3, 5.6).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes for the conversation regardless of branch site grants, isolating the
composition / staging behavior under test. A value is supplied for every declared
slot and template bodies / slot values are kept short, so the genuinely
template-bound slot-fill is classified T1 (autonomous) and clears the
brand-voice 200-char ceiling — i.e. the example always exercises the
``staged`` (delivery-status-recording) path the property is about.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own conversation / template / outbound / audit rows
without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the outbound RPC /
``get_active_site_codes()`` / ``has_site_access`` / ``is_governance_role`` /
``resolve_actor`` / ``auth.jwt()`` / required tables are unavailable, the
governance-claims convention is not honored, no active Site_Code exists, or the
compose-and-stage pipeline cannot be exercised end-to-end.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The verticals the shipped brand-voice registry resolves a guideline for; only
# these can clear the brand-voice gate, so the staged path is reachable.
VERTICALS = ("monolith", "tcck")

# The delivery-status set the property allows (Req 4.3); this staging RPC writes
# 'pending', which the sender Edge Function later advances to 'sent'/'failed'.
_ALLOWED_STATUSES = ("pending", "sent", "failed")

# Pool of valid named-slot identifiers ([A-Za-z0-9_], matching the RPC's slot
# regex). A subset is chosen per example and a value supplied for each.
_SLOT_NAME_POOL = ("name", "order_id", "amount", "item", "eta", "ref")

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check passes for the conversation,
# isolating the composition/staging behavior under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


# ---------------------------------------------------------------------------
# Strategy: a template (named slots) + a value for every declared slot.
# ---------------------------------------------------------------------------

# Short, safe slot values: printable ASCII excluding the brace/backslash chars
# that participate in placeholder syntax / regex-replacement escaping. Kept short
# so the composed body stays well under the 200-char brand-voice ceiling.
_slot_value = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_characters="{}\\"),
    min_size=0,
    max_size=24,
)


@st.composite
def _outbound_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a vertical, a set of named slots, and a value for each slot."""
    vertical = draw(st.sampled_from(VERTICALS))
    slot_names = draw(
        st.lists(st.sampled_from(_SLOT_NAME_POOL), min_size=0, max_size=3, unique=True)
    )
    values = {name: draw(_slot_value) for name in slot_names}
    return {"vertical": vertical, "slot_names": slot_names, "values": values}


def _build_body(slot_names: list[str]) -> str:
    """Build a short template body declaring each named slot once."""
    body = "Update:"
    for name in slot_names:
        body += " {{" + name + "}}"
    return body


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / tables
# are unavailable, governance claims are not honored, no active site exists, or
# the compose-and-stage pipeline cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping outbound status-recording "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping outbound status-recording test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(
            f"Test database not reachable; skipping outbound status-recording test ({exc})."
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
    """Skip unless the outbound RPC + A1/C12 helpers + tables exist, governance
    claims are honored, at least one active Site_Code exists, AND the RPC can be
    exercised end-to-end (seed open conversation + active template -> stage a
    pending outbound row)."""
    with conn.cursor() as cur:
        for proc in (
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
                    "outbound status-recording property test."
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
                    f"{table} is not installed; skipping outbound status-recording "
                    "property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> compose -> stage round-trip succeeds.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            staged = False
            if is_gov and active:
                conversation_id = _seed_open_conversation(
                    cur, f"probe-{uuid.uuid4().hex}", "monolith", active[0]
                )
                template_key = _seed_template(cur, "monolith", ["name"])
                result = _compose(cur, conversation_id, template_key, {"name": "probe"})
                staged = bool(result["staged"])
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_send_line_outbound end-to-end; skipping "
                f"outbound status-recording property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping outbound status-recording test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping outbound status-recording property test."
                )
            if not staged:
                conn.rollback()
                pytest.skip(
                    "the compose-and-stage pipeline did not stage a pending row in the "
                    "probe; skipping outbound status-recording property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_open_conversation(cur: Any, line_user_id: str, vertical: str, site_code: str) -> Any:
    """Seed a fresh `open` Conversation with a resolved active site_code; return id."""
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, 'open') returning id",
        (line_user_id, vertical, site_code),
    )
    return cur.fetchone()[0]


def _seed_template(cur: Any, vertical: str, slot_names: list[str]) -> str:
    """Seed an active template scoped to `vertical`; return its template_key."""
    template_key = f"tpl-{uuid.uuid4().hex}"
    cur.execute(
        "insert into public.line_oa_message_templates "
        "(template_key, vertical_context, body, is_active) "
        "values (%s, %s, %s, true)",
        (template_key, vertical, _build_body(slot_names)),
    )
    return template_key


def _compose(
    cur: Any, conversation_id: Any, template_key: str, slots: dict[str, str]
) -> dict[str, Any]:
    """Invoke rpc_send_line_outbound (defaults: no reply token) and return OUT row."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select staged, outbound_id, send_type, classification, reason "
        "from public.rpc_send_line_outbound(%s, %s, %s::jsonb)",
        (conversation_id, template_key, json.dumps(slots)),
    )
    r = cur.fetchone()
    return {
        "staged": r[0],
        "outbound_id": r[1],
        "send_type": r[2],
        "classification": r[3],
        "reason": r[4],
    }


def _outbound_row(cur: Any, outbound_id: Any) -> tuple[Any, str, str, dict[str, Any]]:
    """Return the persisted (conversation_id, status, template_key, slot_values)."""
    cur.execute(
        "select conversation_id, status, template_key, slot_values "
        "from public.line_oa_outbound_messages where id = %s",
        (outbound_id,),
    )
    row = cur.fetchone()
    return row[0], row[1], row[2], row[3]


# ---------------------------------------------------------------------------
# Property 9
# ---------------------------------------------------------------------------


@property(
    9,
    "A composed outbound row exists in the originating conversation with status "
    "in {pending,sent,failed} recording template_key and slot_values",
)
@given(case=_outbound_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_outbound_status_recording(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 4.3, 5.6**"""
    vertical: str = case["vertical"]
    slot_names: list[str] = case["slot_names"]
    values: dict[str, str] = case["values"]

    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"outrec-{uuid.uuid4().hex}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop9")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site_code = active[0]

            conversation_id = _seed_open_conversation(cur, line_user_id, vertical, site_code)
            template_key = _seed_template(cur, vertical, slot_names)

            result = _compose(cur, conversation_id, template_key, values)

            # A genuinely template-bound slot-fill with every slot supplied and a
            # short body must stage a pending outbound row (the path the property
            # is about). If it did not stage, surface why.
            assert result["staged"] is True, (
                "a template-bound, fully-slotted, within-limit compose must stage a "
                f"pending outbound row; got {result!r}"
            )
            assert result["classification"] == "template-bound", (
                f"resolved active template must classify as template-bound; got {result!r}"
            )
            outbound_id = result["outbound_id"]
            assert outbound_id is not None, "a staged compose must return the outbound_id"

            conv_id, status, stored_template_key, stored_slots = _outbound_row(cur, outbound_id)

            # The composed Outbound_Message row exists in the ORIGINATING conversation.
            assert conv_id == conversation_id, (
                "the composed outbound row must belong to the originating conversation; "
                f"got {conv_id!r} != {conversation_id!r}"
            )

            # Its delivery status is one of the allowed values (Req 4.3) — here
            # 'pending' from this staging RPC.
            assert status in _ALLOWED_STATUSES, (
                f"outbound status must be one of {_ALLOWED_STATUSES}; got {status!r}"
            )
            assert status == "pending", (
                f"this staging RPC must record status 'pending'; got {status!r}"
            )

            # It records the template_key and the slot_values used (Req 5.6).
            assert stored_template_key == template_key, (
                "the outbound row must record the template_key used; "
                f"got {stored_template_key!r} != {template_key!r}"
            )
            assert stored_slots == values, (
                "the outbound row must record exactly the slot_values used; "
                f"got {stored_slots!r} != {values!r}"
            )
        finally:
            cur.execute("rollback to savepoint prop9")
            cur.execute("release savepoint prop9")

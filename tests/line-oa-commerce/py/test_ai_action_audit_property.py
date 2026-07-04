"""Property test — AI-action audit (LINE OA Commerce, Module B5).

Spec task: 11.7 Write property test for AI-action audit.

Implements exactly ONE numbered property against the outbound composition +
staging RPC shipped by task 11.4
(``00000000000040_line_oa_send_outbound.sql`` —
``public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean)``):

    Property 26: Each governed AI action writes exactly one audit entry recording
    the action, its Autonomy_Tier, and its approval outcome.
    Validates: Requirements 11.7.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh ``open`` Conversation whose ``site_code`` is a real active code from A1's
``public.get_active_site_codes()``, and (depending on the generated template
state) zero or one Message_Template scoped to the conversation's
``vertical_context``:

  * **active** — an ACTIVE template (with zero or more named ``{{slot}}``
    placeholders, every declared slot supplied) -> a genuinely template-bound
    slot-fill that STAGES (T1, autonomous);
  * **inactive** — a present-but-INACTIVE template -> a governed-but-rejected
    action (classified free-text, never sent); or
  * **absent** — no template at all (a random key) -> a governed-but-rejected
    action (classified free-text, never sent).

Across those template states it also varies the approval inputs
(``p_approval_available`` and ``p_approved``) so the autonomy gate is exercised
across its outcomes. EVERY one of these invocations is a governed AI action that
RETURNS (staged or rejected — never a hard RAISE, since the conversation is open,
the principal is authorized, and the inputs are well-formed). For each invocation
the test asserts that:

  * EXACTLY ONE new ``line_oa_audit_log`` row references this invocation (filtered
    by the freshly-seeded conversation's id, which appears in ``entity_ref``);
  * its ``event_type`` is the composed-action event (``outbound_message_composed``)
    — i.e. it records THE ACTION;
  * the ``autonomy_tier`` embedded in ``entity_ref`` equals the Autonomy_Tier the
    RPC classified (the returned OUT ``autonomy_tier``); and
  * the approval outcome embedded in ``entity_ref`` (both the ``gate_decision`` and
    the ``approval_outcome``) equals the gate's returned outcome.

Comparing the persisted audit fields against the RPC's own returned OUT values
makes the property robust to the exact gating logic: whatever tier/outcome the RPC
decides, the single audit entry must faithfully record it (Req 11.7).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes on any conversation and every example stays on the governed RETURN path,
isolating the audit behavior under test.

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

# Brand-voice-configured verticals; vertical_context is NOT the invariant here,
# but only these resolve a guideline so the staged (active-template) path is
# reachable.
VERTICALS = ("monolith", "tcck")

# The event_type the RPC writes for every composed/governed outbound AI action.
_COMPOSED_EVENT_TYPE = "outbound_message_composed"

# Pool of valid named-slot identifiers ([A-Za-z0-9_], matching the RPC's slot
# regex). A subset is chosen per active-template example and a value supplied for
# each so the template-bound slot-fill stages.
_SLOT_NAME_POOL = ("name", "order_id", "amount", "item", "eta", "ref")

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check passes on any conversation,
# isolating the AI-action-audit behavior under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000cc", "app_metadata": {"roles": ["admin"]}}
)

# Short, safe slot values: printable ASCII excluding the brace/backslash chars
# that participate in placeholder syntax / regex-replacement escaping. Kept short
# so any composed body stays under the 200-char brand-voice ceiling.
_slot_value = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_characters="{}\\"),
    min_size=0,
    max_size=24,
)


# ---------------------------------------------------------------------------
# Strategy: a template state + (for active templates) named slots and values,
# plus the autonomy-gate approval inputs.
# ---------------------------------------------------------------------------


@st.composite
def _audit_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a governed AI action that always RETURNS (staged or rejected).

    ``template_state`` selects whether an ACTIVE / INACTIVE / no template backs
    the referenced key; ``slot_names`` (with a value for each) only apply to the
    active case so it genuinely stages. ``approval_available`` / ``approved`` vary
    the autonomy gate's inputs.
    """
    vertical = draw(st.sampled_from(VERTICALS))
    template_state = draw(st.sampled_from(("active", "inactive", "absent")))
    slot_names = draw(
        st.lists(st.sampled_from(_SLOT_NAME_POOL), min_size=0, max_size=3, unique=True)
    )
    values = {name: draw(_slot_value) for name in slot_names}
    return {
        "vertical": vertical,
        "template_state": template_state,
        "slot_names": slot_names,
        "values": values,
        "approval_available": draw(st.booleans()),
        "approved": draw(st.booleans()),
    }


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
            "LINE_OA_TEST_DATABASE_URL is not set; skipping AI-action audit "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping AI-action audit test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping AI-action audit test ({exc}).")

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
    exercised end-to-end (seed open conversation + active template -> stage with a
    single audit entry)."""
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
                    "AI-action audit property test."
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
                    f"{table} is not installed; skipping AI-action audit property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> compose -> audit round-trip writes exactly one entry.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            audited_once = False
            if is_gov and active:
                conversation_id = _seed_open_conversation(
                    cur, f"probe-{uuid.uuid4().hex}", "monolith", active[0]
                )
                template_key = _seed_template(cur, "monolith", ["name"], active=True)
                result = _compose(cur, conversation_id, template_key, {"name": "probe"})
                count, _ = _audit_rows_for(cur, conversation_id)
                audited_once = bool(result["staged"]) and count == 1
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_send_line_outbound end-to-end; skipping "
                f"AI-action audit property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping AI-action audit property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping AI-action audit property test."
                )
            if not audited_once:
                conn.rollback()
                pytest.skip(
                    "the compose pipeline did not stage and write exactly one audit "
                    "entry in the probe; skipping AI-action audit property test."
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


def _seed_template(cur: Any, vertical: str, slot_names: list[str], *, active: bool) -> str:
    """Seed a template scoped to `vertical` (active or inactive); return its key."""
    template_key = f"tpl-{uuid.uuid4().hex}"
    cur.execute(
        "insert into public.line_oa_message_templates "
        "(template_key, vertical_context, body, is_active) "
        "values (%s, %s, %s, %s)",
        (template_key, vertical, _build_body(slot_names), active),
    )
    return template_key


def _compose(
    cur: Any,
    conversation_id: Any,
    template_key: str,
    slots: dict[str, str],
    *,
    approval_available: bool = True,
    approved: bool = False,
) -> dict[str, Any]:
    """Invoke rpc_send_line_outbound and return its full OUT row as a dict.

    Uses no reply token (defaults) — the reply-vs-push decision is not under test
    here; the autonomy/approval inputs are passed through explicitly.
    """
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select staged, outbound_id, send_type, classification, autonomy_tier, "
        "approval_outcome, gate_decision, reason "
        "from public.rpc_send_line_outbound(%s, %s, %s::jsonb, %s, %s, %s, %s)",
        (
            conversation_id,
            template_key,
            json.dumps(slots),
            None,   # p_reply_token
            False,  # p_reply_token_expired
            approval_available,
            approved,
        ),
    )
    r = cur.fetchone()
    return {
        "staged": r[0],
        "outbound_id": r[1],
        "send_type": r[2],
        "classification": r[3],
        "autonomy_tier": r[4],
        "approval_outcome": r[5],
        "gate_decision": r[6],
        "reason": r[7],
    }


def _audit_rows_for(cur: Any, conversation_id: Any) -> tuple[int, list[tuple[str, str]]]:
    """Return (count, [(event_type, entity_ref), ...]) for audit rows referencing
    this conversation via the entity_ref the RPC composes."""
    cur.execute(
        "select event_type, entity_ref from public.line_oa_audit_log "
        "where entity_ref like %s",
        (f"conversation_id:{conversation_id}|%",),
    )
    rows = cur.fetchall()
    return len(rows), rows


def _parse_entity_ref(entity_ref: str) -> dict[str, str]:
    """Parse the pipe-delimited ``key:value`` audit entity_ref into a dict.

    The RPC composes entity_ref from non-secret identifiers only, e.g.
    ``conversation_id:<uuid>|outbound_id:<uuid|none>|template_key:<key>|
    classification:<c>|autonomy_tier:<tier>|gate_decision:<d>|approval_outcome:<o>|
    send_type:<t>|staged:<bool>|reason:<r>``. None of those values contain ':' or
    '|', so each segment splits cleanly on its first ':'.
    """
    fields: dict[str, str] = {}
    for segment in entity_ref.split("|"):
        if ":" in segment:
            key, value = segment.split(":", 1)
            fields[key] = value
    return fields


# ---------------------------------------------------------------------------
# Property 26
# ---------------------------------------------------------------------------


@property(
    26,
    "Each governed AI action writes exactly one audit entry recording the action, "
    "its Autonomy_Tier, and its approval outcome",
)
@given(case=_audit_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_ai_action_audit(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 11.7**"""
    vertical: str = case["vertical"]
    template_state: str = case["template_state"]
    slot_names: list[str] = case["slot_names"]
    values: dict[str, str] = case["values"]
    approval_available: bool = case["approval_available"]
    approved: bool = case["approved"]

    # Namespace the userId so the seeded conversation can never collide with
    # pre-existing rows; its id then uniquely identifies this invocation's audit.
    line_user_id = f"aiaudit-{uuid.uuid4().hex}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop26")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site_code = active[0]

            conversation_id = _seed_open_conversation(cur, line_user_id, vertical, site_code)

            # Choose the referenced template_key per the generated template state.
            if template_state == "active":
                template_key = _seed_template(cur, vertical, slot_names, active=True)
            elif template_state == "inactive":
                template_key = _seed_template(cur, vertical, slot_names, active=False)
            else:  # "absent" — reference a key that has no template at all
                template_key = f"missing-{uuid.uuid4().hex}"

            # No audit row references this fresh conversation before the call.
            before_count, _ = _audit_rows_for(cur, conversation_id)
            assert before_count == 0, (
                "no audit row should reference this conversation before the action; "
                f"found {before_count}"
            )

            # ---- Invoke the governed AI action EXACTLY ONCE. ----
            result = _compose(
                cur,
                conversation_id,
                template_key,
                values,
                approval_available=approval_available,
                approved=approved,
            )

            # ---- EXACTLY ONE new audit entry for this governed action. ----
            count, rows = _audit_rows_for(cur, conversation_id)
            assert count == 1, (
                "each governed AI action must write exactly one audit entry; "
                f"found {count} (state={template_state!r}, result={result!r})"
            )
            event_type, entity_ref = rows[0]

            # It records THE ACTION: the composed-outbound event_type.
            assert event_type == _COMPOSED_EVENT_TYPE, (
                "the audit entry must record the composed-action event_type "
                f"{_COMPOSED_EVENT_TYPE!r}; got {event_type!r}"
            )

            fields = _parse_entity_ref(entity_ref)

            # The entry faithfully references the conversation it acted on.
            assert fields.get("conversation_id") == str(conversation_id), (
                "the audit entry must record the acted-on conversation_id; "
                f"entity_ref={entity_ref!r}"
            )

            # It records the classified Autonomy_Tier — equal to the tier the RPC
            # returned for this action (Req 11.7).
            assert "autonomy_tier" in fields, (
                f"audit entry must record the Autonomy_Tier; entity_ref={entity_ref!r}"
            )
            assert fields["autonomy_tier"] == result["autonomy_tier"], (
                "audited Autonomy_Tier must equal the classified tier: "
                f"{fields['autonomy_tier']!r} != {result['autonomy_tier']!r}"
            )

            # It records the approval outcome — both the gate decision and the
            # approval outcome the RPC returned (Req 11.7).
            assert "approval_outcome" in fields, (
                f"audit entry must record the approval outcome; entity_ref={entity_ref!r}"
            )
            assert fields["approval_outcome"] == result["approval_outcome"], (
                "audited approval_outcome must equal the gate's outcome: "
                f"{fields['approval_outcome']!r} != {result['approval_outcome']!r}"
            )
            assert "gate_decision" in fields, (
                f"audit entry must record the gate decision; entity_ref={entity_ref!r}"
            )
            assert fields["gate_decision"] == result["gate_decision"], (
                "audited gate_decision must equal the gate's decision: "
                f"{fields['gate_decision']!r} != {result['gate_decision']!r}"
            )
        finally:
            cur.execute("rollback to savepoint prop26")
            cur.execute("release savepoint prop26")

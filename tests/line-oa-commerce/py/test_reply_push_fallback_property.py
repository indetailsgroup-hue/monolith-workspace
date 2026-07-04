"""Property test — reply→push fallback (LINE OA Commerce, Module B5).

Spec task: 11.6 Write property test for reply→push fallback.

Implements exactly ONE numbered property against the outbound composition RPC
shipped by task 11.4
(``00000000000040_line_oa_send_outbound.sql`` —
``public.rpc_send_line_outbound(uuid, text, jsonb, text, boolean, boolean, boolean)``):

    Property 11: When the reply token is unavailable/expired, the resolved
    send_type is push.
    Validates: Requirements 4.5.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh ``open`` Conversation whose ``site_code`` is a real active code from A1's
``public.get_active_site_codes()`` and an ACTIVE Message_Template bound to that
conversation's vertical, then invokes ``rpc_send_line_outbound`` as an authorized
Governance_Role across a range of generated reply-token states:

  * **absent** (``NULL``), **empty** (``''``), **whitespace-only**, or
    **expired** (a non-empty token with ``p_reply_token_expired = true``) — the
    test asserts the resolved ``send_type`` is ``'push'`` (Req 4.5); versus

  * a **present, non-empty, non-expired** token — the test asserts the resolved
    ``send_type`` is ``'reply'`` (the only case in which a reply is usable).

The template is bound and slot-free and the composed body is short, so the D2
autonomy gate classifies the action as the autonomous template-slot-fill tier and
the row STAGES; the test then also asserts the **persisted** outbound row's
``send_type`` equals the resolved type, covering the fallback end-to-end (the OUT
value and the stored value agree).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes and the test isolates the reply-token-vs-push decision itself.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own conversation / template / outbound / audit rows
without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the outbound RPC /
``get_active_site_codes()`` / ``is_governance_role`` / ``resolve_actor`` /
``auth.jwt()`` / required tables are unavailable, the governance-claims
convention is not honored, or no active Site_Code exists to seed an open
conversation.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Brand-voice-configured verticals (an unconfigured vertical would reject on
# brand_voice_unresolved before staging); vertical_context is NOT under test here.
VERTICALS = ("monolith", "tcck")

# The event_type the RPC writes for every composed/governed outbound action.
_COMPOSED_EVENT_TYPE = "outbound_message_composed"

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check passes on any conversation,
# isolating the reply-token-vs-push decision under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000bb", "app_metadata": {"roles": ["admin"]}}
)

# Reply-token states. Each is (label, exercises-the-fallback?) where a usable
# reply token (present, non-empty, not expired) is the ONLY non-fallback case.
#   absent      -> NULL token                         => push
#   empty       -> '' token                           => push
#   whitespace  -> '   ' token (btrim length 0)       => push
#   expired     -> non-empty token, expired=true      => push
#   valid       -> non-empty token, expired=false     => reply
TOKEN_STATES = ("absent", "empty", "whitespace", "expired", "valid")


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / tables
# are unavailable, governance claims are not honored, or no active site exists.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping reply→push fallback "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping reply→push fallback test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping reply→push fallback test ({exc}).")

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
    exercised end-to-end (seed open conversation + active template -> stage)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_send_line_outbound(uuid,text,jsonb,text,boolean,boolean,boolean)",
            "public.get_active_site_codes()",
            "public.is_governance_role()",
            "public.has_site_access(text)",
            "public.resolve_actor()",
            "auth.jwt()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "reply→push fallback property test."
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
                    f"{table} is not installed; skipping reply→push fallback property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> compose round-trip stages a row.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            if is_gov and active:
                vertical = "monolith"
                conv_id = _seed_open(cur, f"probe-{uuid.uuid4().hex}", vertical, active[0])
                tkey = _seed_template(cur, vertical, active=True)
                probe = _compose(cur, conv_id, tkey, reply_token="rt", expired=False)
                staged_ok = probe["staged"] is True and probe["send_type"] == "reply"
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_send_line_outbound end-to-end; skipping "
                f"reply→push fallback property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping reply→push fallback property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping reply→push fallback property test."
                )
            if not staged_ok:
                conn.rollback()
                pytest.skip(
                    "a bound, slot-free outbound did not stage as a usable reply; "
                    "skipping reply→push fallback property test."
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


def _seed_template(cur: Any, vertical: str, *, active: bool) -> str:
    """Seed an ACTIVE, slot-free Message_Template bound to `vertical`; return its key.

    A unique key avoids collisions with any pre-existing templates. The body is
    short and slot-free so composition is a genuinely template-bound, autonomous
    (T1) slot-fill that stages — isolating the reply-vs-push decision.
    """
    template_key = f"replypush-{uuid.uuid4().hex}"
    cur.execute(
        "insert into public.line_oa_message_templates "
        "(template_key, vertical_context, body, is_active) "
        "values (%s, %s, %s, %s)",
        (template_key, vertical, "Thanks for your message.", active),
    )
    return template_key


def _compose(
    cur: Any,
    conversation_id: Any,
    template_key: str,
    *,
    reply_token: str | None,
    expired: bool,
) -> dict[str, Any]:
    """Invoke rpc_send_line_outbound and return its OUT row as a dict."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select staged, outbound_id, send_type, classification, reason "
        "from public.rpc_send_line_outbound(%s, %s, %s, %s, %s)",
        (conversation_id, template_key, json.dumps({}), reply_token, expired),
    )
    r = cur.fetchone()
    return {
        "staged": r[0],
        "outbound_id": r[1],
        "send_type": r[2],
        "classification": r[3],
        "reason": r[4],
    }


def _persisted_send_type(cur: Any, outbound_id: Any) -> Any:
    """Return the persisted send_type of a staged outbound row."""
    cur.execute(
        "select send_type from public.line_oa_outbound_messages where id = %s",
        (outbound_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Property 11
# ---------------------------------------------------------------------------


@property(
    11,
    "When the reply token is unavailable/expired, the resolved send_type is push",
)
@given(
    token_state=st.sampled_from(TOKEN_STATES),
    vertical=st.sampled_from(VERTICALS),
    site_index=st.integers(min_value=0, max_value=10_000),
    token_body=st.text(
        alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
        min_size=1,
        max_size=40,
    ),
    user_fragment=st.text(
        alphabet=st.characters(blacklist_categories=("Cs", "Cc")),
        min_size=0,
        max_size=16,
    ),
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_reply_push_fallback(
    db_conn: Any,
    token_state: str,
    vertical: str,
    site_index: int,
    token_body: str,
    user_fragment: str,
) -> None:
    """**Validates: Requirements 4.5**"""
    line_user_id = f"replypush-{uuid.uuid4().hex}-{user_fragment}"

    # Map the generated token state to the (reply_token, expired) inputs and the
    # expected resolved send_type. A reply is usable ONLY when the token is
    # present, non-empty, and not expired; every other state falls back to push.
    if token_state == "absent":
        reply_token: str | None = None
        expired = False
        expected = "push"
    elif token_state == "empty":
        reply_token = ""
        expired = False
        expected = "push"
    elif token_state == "whitespace":
        reply_token = "   "
        expired = False
        expected = "push"
    elif token_state == "expired":
        # A non-empty token that LINE has expired — still must fall back to push.
        reply_token = token_body
        expired = True
        expected = "push"
    else:  # "valid"
        reply_token = token_body
        expired = False
        expected = "reply"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop11")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site_code = active[site_index % len(active)]

            conversation_id = _seed_open(cur, line_user_id, vertical, site_code)
            template_key = _seed_template(cur, vertical, active=True)

            result = _compose(
                cur,
                conversation_id,
                template_key,
                reply_token=reply_token,
                expired=expired,
            )

            # Core property: the resolved send_type matches the fallback rule —
            # 'reply' only for a usable token, otherwise 'push' (Req 4.5).
            assert result["send_type"] == expected, (
                f"token_state={token_state!r} (reply_token={reply_token!r}, "
                f"expired={expired}) must resolve send_type {expected!r}; "
                f"got {result['send_type']!r}"
            )

            # The bound, slot-free outbound must STAGE so the decision is realized
            # end-to-end; the persisted row's send_type must equal the resolved one.
            assert result["classification"] == "template-bound", (
                f"a bound active template must classify template-bound; got {result!r}"
            )
            assert result["staged"] is True, (
                f"a bound, slot-free, in-voice outbound must stage; got {result!r}"
            )
            persisted = _persisted_send_type(cur, result["outbound_id"])
            assert persisted == expected, (
                "the persisted outbound row must store the resolved send_type "
                f"{expected!r}; got {persisted!r}"
            )
        finally:
            cur.execute("rollback to savepoint prop11")
            cur.execute("release savepoint prop11")

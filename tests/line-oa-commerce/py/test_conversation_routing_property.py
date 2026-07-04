"""Property test — conversation routing (LINE OA Commerce, Module B5).

Spec task: 8.5 Write property test for conversation routing.

Implements exactly ONE numbered property against the inbound ingestion RPC
shipped by task 8.1
(``00000000000022_line_oa_ingest_webhook.sql`` —
``public.rpc_ingest_line_webhook(text, text, text)``) together with the
conversations live partial-unique index from task 2.2
(``UNIQUE (line_user_id, vertical_context) WHERE status <> 'closed'``):

    Property 6: Each inbound attaches to exactly one non-closed conversation; a
    new site_unresolved one is created if none open; closed conversations never
    reopen.
    Validates: Requirements 3.1, 3.2, 3.3, 3.8.

For every generated ``(user, vertical, scenario, inbound texts)`` the test
provisions a real channel — a Supabase Vault secret holding the plaintext
``Channel_Secret`` plus a ``line_oa_channels`` row referencing it — exactly as
``rpc_ingest_line_webhook`` resolves at runtime, then exercises one of three
routing scenarios for the SAME ``(line_user_id, vertical_context)`` key:

  * ``none``   — no pre-existing conversation. The first inbound MUST create a
                 NEW conversation in ``site_unresolved`` with a NULL site_code
                 (Req 3.1, 3.2, 3.3).
  * ``open``   — a pre-existing non-closed conversation. Every inbound MUST
                 attach to that SAME conversation; no new conversation is
                 created (Req 3.1).
  * ``closed`` — a pre-existing CLOSED conversation. The inbound MUST NOT reopen
                 it; instead a distinct NEW ``site_unresolved`` conversation is
                 created and the closed one stays closed (Req 3.8).

Across all scenarios, after delivering one or more inbound events (each with a
distinct ``webhookEventId``) the test asserts the invariant that holds for every
inbound: it attaches to EXACTLY ONE non-closed conversation, and that there is
exactly one live (``status <> 'closed'``) conversation for the key, and every
inbound is bound to it.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own channel/secret/conversation without leaking
state. Every generated id is namespaced with a fresh UUID so it can never
collide with pre-existing rows in a shared test database.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when
no database is configured, the driver is missing, the connection cannot be
established, or the ingestion RPC / its dependencies / Vault are not present.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------
# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so the generated
# text round-trips identically through Python's UTF-8 encoder and Postgres'
# convert_to(..., 'UTF8'); the raw body we pass must hash to the exact same HMAC
# the DB helper computes.
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

# A non-empty Channel_Secret (Vault rejects empty secrets).
secret_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)

# A Vertical_Context value; must survive the helper's btrim() guard.
vertical_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=32).filter(
    lambda s: len(s.strip()) > 0
)

# Arbitrary inbound message text carried inside each event payload.
message_text_strategy = st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=128)

# Which routing scenario to exercise for the (user, vertical) key.
scenario_strategy = st.sampled_from(("none", "open", "closed"))

# Number of distinct inbound events to deliver (each attaches to the live conv).
inbound_count_strategy = st.integers(min_value=1, max_value=4)


def _expected_signature(secret: str, body: str) -> str:
    """base64( HMAC-SHA256(key=secret, msg=body) ) — mirrors the DB helper."""
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def _build_body(webhook_event_id: str, line_user_id: str, text: str) -> str:
    """Serialize ONE valid LINE webhook delivery carrying a single message event.

    The returned string is the EXACT raw body bytes that are both signed and
    forwarded to the RPC (no re-encoding between signing and the call).
    """
    payload = {
        "destination": f"U{uuid.uuid4().hex}",
        "events": [
            {
                "type": "message",
                "webhookEventId": webhook_event_id,
                "timestamp": 1462629479859,
                "source": {"type": "user", "userId": line_user_id},
                "message": {"type": "text", "id": uuid.uuid4().hex, "text": text},
            }
        ],
    }
    # ensure_ascii=False keeps non-ASCII characters as their literal UTF-8 form so
    # the bytes we hash equal the bytes Postgres hashes from the same text value.
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / Vault is
# unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping conversation-routing "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping conversation-routing test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping conversation-routing test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the ingest RPC + its dependencies + Vault are present."""
    with conn.cursor() as cur:
        for sig in (
            "public.rpc_ingest_line_webhook(text,text,text)",
            "public.line_oa_verify_signature(text,text,text)",
            "public.line_oa_resolve_channel(text)",
            "public.line_oa_resolve_customer_identity(text,text)",
            "public.resolve_actor()",
        ):
            cur.execute("select to_regprocedure(%s)", (sig,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{sig} is not installed; skipping conversation-routing property test."
                )

        cur.execute(
            """
            select 1
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'vault' and p.proname = 'create_secret'
            """
        )
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "Supabase Vault (vault.create_secret) is not available; "
                "skipping conversation-routing property test."
            )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ingest(cur: Any, channel: str, body: str, signature: str) -> dict[str, Any]:
    """Invoke the ingest RPC, returning its OUT record as a dict."""
    cur.execute(
        """
        select accepted, reason, events_processed, events_duplicate, events_skipped
        from public.rpc_ingest_line_webhook(%s, %s, %s)
        """,
        (body, signature, channel),
    )
    row = cur.fetchone()
    return {
        "accepted": row[0],
        "reason": row[1],
        "events_processed": row[2],
        "events_duplicate": row[3],
        "events_skipped": row[4],
    }


def _inbound_conversation_id(cur: Any, webhook_event_id: str) -> Any:
    cur.execute(
        "select conversation_id from public.line_oa_inbound_messages where webhook_event_id = %s",
        (webhook_event_id,),
    )
    row = cur.fetchone()
    return row[0] if row is not None else None


def _conversation(cur: Any, conversation_id: Any) -> dict[str, Any] | None:
    cur.execute(
        """
        select id, line_user_id, vertical_context, site_code, status
        from public.line_oa_conversations
        where id = %s
        """,
        (conversation_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "id": row[0],
        "line_user_id": row[1],
        "vertical_context": row[2],
        "site_code": row[3],
        "status": row[4],
    }


def _live_conversation_ids(cur: Any, line_user_id: str, vertical_context: str) -> list[Any]:
    cur.execute(
        """
        select id from public.line_oa_conversations
        where line_user_id = %s and vertical_context = %s and status <> 'closed'
        """,
        (line_user_id, vertical_context),
    )
    return [r[0] for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Property 6
# ---------------------------------------------------------------------------


@property(
    6,
    "Each inbound attaches to exactly one non-closed conversation; a new site_unresolved "
    "one is created if none open; closed conversations never reopen",
)
@given(
    secret=secret_strategy,
    vertical=vertical_strategy,
    scenario=scenario_strategy,
    inbound_count=inbound_count_strategy,
    base_text=message_text_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_conversation_routing(
    db_conn: Any,
    secret: str,
    vertical: str,
    scenario: str,
    inbound_count: int,
    base_text: str,
) -> None:
    """**Validates: Requirements 3.1, 3.2, 3.3, 3.8**"""
    channel_identifier = f"line-oa-route-{uuid.uuid4()}"
    secret_name = f"line_oa_route_secret_{uuid.uuid4().hex}"
    line_user_id = f"U-route-{uuid.uuid4().hex}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop6")
        try:
            # Provision the Vault secret + channel row the RPC resolves at runtime.
            cur.execute("select vault.create_secret(%s, %s)", (secret, secret_name))
            secret_ref = cur.fetchone()[0]
            cur.execute(
                """
                insert into public.line_oa_channels
                    (channel_identifier, vertical_context,
                     channel_secret_ref, channel_access_token_ref, is_active)
                values (%s, %s, %s, %s, true)
                """,
                (channel_identifier, vertical, str(secret_ref), f"token_ref_{uuid.uuid4().hex}"),
            )

            # ---- Set up the pre-existing conversation state for the scenario. ----
            preexisting_open_id: Any = None
            preexisting_closed_id: Any = None
            if scenario == "open":
                # A live (non-closed) conversation already exists for the key.
                cur.execute(
                    """
                    insert into public.line_oa_conversations
                        (line_user_id, vertical_context, site_code, status, last_activity_at)
                    values (%s, %s, null, 'open', timezone('utc', now()))
                    returning id
                    """,
                    (line_user_id, vertical),
                )
                preexisting_open_id = cur.fetchone()[0]
            elif scenario == "closed":
                # A previously auto-closed conversation exists for the key. It must
                # never be reopened by a subsequent inbound (Req 3.8).
                cur.execute(
                    """
                    insert into public.line_oa_conversations
                        (line_user_id, vertical_context, site_code, status, last_activity_at)
                    values (%s, %s, %s, 'closed',
                            timezone('utc', now()) - interval '48 hours')
                    returning id
                    """,
                    (line_user_id, vertical, f"SITE-{uuid.uuid4().hex[:8]}"),
                )
                preexisting_closed_id = cur.fetchone()[0]

            # ---- Deliver the inbound events (each with a distinct event id). ----
            event_ids: list[str] = []
            attached_ids: list[Any] = []
            for i in range(inbound_count):
                webhook_event_id = f"evt-{uuid.uuid4().hex}"
                event_ids.append(webhook_event_id)
                body = _build_body(webhook_event_id, line_user_id, f"{base_text}#{i}")
                signature = _expected_signature(secret, body)

                result = _ingest(cur, channel_identifier, body, signature)
                assert result["accepted"] is True, "a verified delivery must be accepted"
                assert result["reason"] == "accepted"
                assert result["events_processed"] == 1, (
                    "each distinct inbound event must be processed exactly once"
                )

                # INVARIANT (every inbound): it attaches to exactly one conversation,
                # and that conversation is non-closed (Req 3.1).
                conv_id = _inbound_conversation_id(cur, webhook_event_id)
                assert conv_id is not None, "the inbound must be attached to a conversation"
                conv = _conversation(cur, conv_id)
                assert conv is not None
                assert conv["line_user_id"] == line_user_id
                assert conv["vertical_context"] == vertical
                assert conv["status"] != "closed", (
                    "an inbound must never attach to a closed conversation"
                )
                attached_ids.append(conv_id)

            # ---- Exactly one live conversation, and every inbound is bound to it. ----
            live = _live_conversation_ids(cur, line_user_id, vertical)
            assert len(live) == 1, (
                "exactly one non-closed conversation must exist for (user, vertical)"
            )
            live_id = live[0]
            assert set(attached_ids) == {live_id}, (
                "every inbound must attach to the single live conversation"
            )

            live_conv = _conversation(cur, live_id)
            assert live_conv is not None

            # ---- Scenario-specific assertions. ----
            if scenario == "none":
                # No conversation existed: a NEW site_unresolved one with NULL
                # site_code was created (Req 3.2, 3.3).
                assert live_conv["status"] == "site_unresolved", (
                    "a conversation created with none open must start site_unresolved"
                )
                assert live_conv["site_code"] is None, (
                    "a newly created conversation must have a NULL site_code"
                )
            elif scenario == "open":
                # The inbound attached to the SAME pre-existing live conversation;
                # no new conversation was created (Req 3.1).
                assert live_id == preexisting_open_id, (
                    "the inbound must attach to the existing non-closed conversation"
                )
            elif scenario == "closed":
                # The closed conversation was NOT reopened: a distinct new
                # site_unresolved conversation was created (Req 3.8).
                assert live_id != preexisting_closed_id, (
                    "a closed conversation must never be reopened"
                )
                assert live_conv["status"] == "site_unresolved", (
                    "the new conversation after a closed one must start site_unresolved"
                )
                assert live_conv["site_code"] is None, (
                    "the new conversation must have a NULL site_code"
                )
                closed_conv = _conversation(cur, preexisting_closed_id)
                assert closed_conv is not None
                assert closed_conv["status"] == "closed", (
                    "the pre-existing closed conversation must remain closed"
                )
        finally:
            cur.execute("rollback to savepoint prop6")
            cur.execute("release savepoint prop6")

"""Property test — idempotent processing (LINE OA Commerce, Module B5).

Spec task: 8.3 Write property test for idempotent processing.

Implements exactly ONE numbered property against the inbound ingestion RPC
shipped by task 8.1
(``00000000000022_line_oa_ingest_webhook.sql`` —
``public.rpc_ingest_line_webhook(text, text, text)``) together with the
``UNIQUE (webhook_event_id)`` idempotency anchor from task 2.2:

    Property 4: N>=1 deliveries (incl. redelivery after partial failure) yield
    the single-delivery state; at most one Conversation/Inbound/Outbound/Line_Order
    per webhook_event_id.
    Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 8.7.

For every generated ``(user, vertical, message text, N)`` the test:

  * provisions a real channel — a Supabase Vault secret holding the plaintext
    ``Channel_Secret`` plus a ``line_oa_channels`` row referencing it — exactly
    as ``rpc_ingest_line_webhook`` resolves at runtime;
  * builds ONE valid LINE webhook body carrying a single event with a stable
    ``webhookEventId`` and ``source.userId`` and signs it with
    ``base64(HMAC-SHA256(secret, raw_body))``;
  * delivers that identical signed body to ``rpc_ingest_line_webhook`` N >= 1
    times (the first delivery plus N-1 redeliveries, modelling redelivery after
    a partial failure);
  * asserts the FIRST delivery is accepted and processes exactly one event
    (``events_processed == 1``), and that EVERY redelivery is accepted but is a
    pure duplicate-ack with NO side effects (``events_processed == 0`` and
    ``events_duplicate == 1``) (Req 2.1-2.4);
  * asserts the resulting persisted state equals the single-delivery state:
    exactly one Inbound_Message for that ``webhook_event_id`` (Req 2.5, 8.7),
    exactly one non-closed Conversation for ``(line_user_id, vertical_context)``
    (Req 2.1), zero Outbound_Messages in that conversation and zero Line_Orders
    for that ``webhook_event_id`` (ingestion stages no send / creates no order),
    and exactly one ``webhook_inbound_received`` audit receipt for the event
    (redelivery adds no further rows or receipts).

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
# convert_to(..., 'UTF8') (Postgres text cannot store NUL bytes) — the raw body
# we pass must hash to the exact same HMAC the DB helper computes.
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

# A non-empty Channel_Secret (Vault rejects empty secrets).
secret_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)

# A Vertical_Context value; must survive the helper's btrim() guard.
vertical_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=32).filter(
    lambda s: len(s.strip()) > 0
)

# Arbitrary inbound message text carried inside the event payload.
message_text_strategy = st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=128)

# Number of deliveries: N >= 1 (one first delivery + N-1 redeliveries).
deliveries_strategy = st.integers(min_value=1, max_value=6)


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
            "LINE_OA_TEST_DATABASE_URL is not set; skipping idempotent-processing "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping idempotent-processing test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping idempotent-processing test ({exc}).")

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
                    f"{sig} is not installed; skipping idempotent-processing property test."
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
                "skipping idempotent-processing property test."
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


def _inbound_count(cur: Any, webhook_event_id: str) -> int:
    cur.execute(
        "select count(*) from public.line_oa_inbound_messages where webhook_event_id = %s",
        (webhook_event_id,),
    )
    return cur.fetchone()[0]


def _live_conversation_ids(cur: Any, line_user_id: str, vertical_context: str) -> list[Any]:
    cur.execute(
        """
        select id from public.line_oa_conversations
        where line_user_id = %s and vertical_context = %s and status <> 'closed'
        """,
        (line_user_id, vertical_context),
    )
    return [r[0] for r in cur.fetchall()]


def _outbound_count_for_conversation(cur: Any, conversation_id: Any) -> int:
    cur.execute(
        "select count(*) from public.line_oa_outbound_messages where conversation_id = %s",
        (conversation_id,),
    )
    return cur.fetchone()[0]


def _order_count(cur: Any, webhook_event_id: str) -> int:
    cur.execute(
        "select count(*) from public.line_oa_orders where webhook_event_id = %s",
        (webhook_event_id,),
    )
    return cur.fetchone()[0]


def _receipt_count(cur: Any, webhook_event_id: str) -> int:
    cur.execute(
        """
        select count(*) from public.line_oa_audit_log
        where event_type = 'webhook_inbound_received'
          and entity_ref like %s
        """,
        (f"webhook_event_id:{webhook_event_id}|%",),
    )
    return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# Property 4
# ---------------------------------------------------------------------------


@property(
    4,
    "N>=1 deliveries (incl. redelivery after partial failure) yield the single-delivery "
    "state; at most one Conversation/Inbound/Outbound/Line_Order per webhook_event_id",
)
@given(
    secret=secret_strategy,
    vertical=vertical_strategy,
    message_text=message_text_strategy,
    deliveries=deliveries_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_idempotent_processing(
    db_conn: Any,
    secret: str,
    vertical: str,
    message_text: str,
    deliveries: int,
) -> None:
    """**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 8.7**"""
    channel_identifier = f"line-oa-idemp-{uuid.uuid4()}"
    secret_name = f"line_oa_idemp_secret_{uuid.uuid4().hex}"
    webhook_event_id = f"evt-{uuid.uuid4().hex}"
    line_user_id = f"U-idemp-{uuid.uuid4().hex}"

    body = _build_body(webhook_event_id, line_user_id, message_text)
    signature = _expected_signature(secret, body)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop4")
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

            # ---- First delivery: accepted, exactly one event processed (Req 2.1). ----
            first = _ingest(cur, channel_identifier, body, signature)
            assert first["accepted"] is True, "a verified first-time delivery must be accepted"
            assert first["reason"] == "accepted"
            assert first["events_processed"] == 1, (
                "the first delivery must process exactly one event"
            )
            assert first["events_duplicate"] == 0, (
                "the first delivery has no duplicates"
            )

            # Capture the single-delivery state.
            assert _inbound_count(cur, webhook_event_id) == 1
            live = _live_conversation_ids(cur, line_user_id, vertical)
            assert len(live) == 1, (
                "exactly one live conversation must exist for (user, vertical)"
            )
            conversation_id = live[0]
            assert _outbound_count_for_conversation(cur, conversation_id) == 0, (
                "ingestion stages no outbound message"
            )
            assert _order_count(cur, webhook_event_id) == 0, (
                "ingestion creates no Line_Order"
            )
            assert _receipt_count(cur, webhook_event_id) == 1, (
                "the first delivery writes exactly one inbound receipt"
            )

            # ---- Redeliveries: pure duplicate-ack, NO side effects (Req 2.2-2.4). ----
            for i in range(deliveries - 1):
                redo = _ingest(cur, channel_identifier, body, signature)
                assert redo["accepted"] is True, (
                    f"redelivery #{i + 1} of a verified body is still accepted"
                )
                assert redo["reason"] == "accepted"
                assert redo["events_processed"] == 0, (
                    f"redelivery #{i + 1} must produce no new side effects"
                )
                assert redo["events_duplicate"] == 1, (
                    f"redelivery #{i + 1} must be recognized as a duplicate"
                )

            # ---- Convergence: N deliveries == single-delivery state (Req 2.5, 8.7). ----
            assert _inbound_count(cur, webhook_event_id) == 1, (
                "at most one Inbound_Message may exist per webhook_event_id"
            )
            live_after = _live_conversation_ids(cur, line_user_id, vertical)
            assert live_after == [conversation_id], (
                "redelivery must not create an additional conversation"
            )
            assert _outbound_count_for_conversation(cur, conversation_id) == 0, (
                "redelivery must not stage any outbound message"
            )
            assert _order_count(cur, webhook_event_id) == 0, (
                "redelivery must not create any Line_Order"
            )
            assert _receipt_count(cur, webhook_event_id) == 1, (
                "redelivery must not write additional audit receipts"
            )
        finally:
            cur.execute("rollback to savepoint prop4")
            cur.execute("release savepoint prop4")

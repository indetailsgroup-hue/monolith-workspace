"""Property test — strict consistency on persistence failure (LINE OA Commerce, B5).

Spec task: 8.4 Write property test for strict consistency.

Implements exactly ONE numbered property against the inbound ingestion RPC
shipped by task 8.1
(``00000000000022_line_oa_ingest_webhook.sql`` —
``public.rpc_ingest_line_webhook(text, text, text)``):

    Property 5: A persistence failure produces zero external side effects — no
    LINE call, no notification, no pending/sent outbound row.
    Validates: Requirement 2.6.

Strict consistency means ingestion is all-or-nothing: it performs NO outbound
HTTP by design (outbound is the separate staged ``pending -> sent/failed`` path),
and every inbound write happens inside the caller's single transaction. If any
part of that persistence fails, the whole unit must roll back, leaving zero
partial side effects.

To exercise a *genuine* persistence failure we inject one at the exact point the
RPC writes the Inbound_Message. The RPC creates (or routes to) a Conversation
*before* it inserts the Inbound_Message, so a failure at the inbound write is the
strongest test of the all-or-nothing guarantee: if atomicity holds, the
just-created Conversation is rolled back too and no orphan remains.

For every generated ``(secret, vertical, message text)`` the test:

  * provisions a real channel — a Supabase Vault secret holding the plaintext
    ``Channel_Secret`` plus a ``line_oa_channels`` row referencing it — exactly
    as ``rpc_ingest_line_webhook`` resolves at runtime;
  * snapshots the row counts of every state-bearing ``line_oa_*`` table and
    confirms the event's keys are absent up front;
  * installs a transient ``BEFORE INSERT`` trigger on
    ``line_oa_inbound_messages`` that raises a non-``unique_violation`` error,
    modelling a persistence failure that the RPC does not (and must not) swallow;
  * delivers ONE valid, correctly signed webhook body to the RPC and asserts the
    call FAILS (the injected error propagates out, aborting ingestion);
  * asserts the end state has zero side effects: no Inbound_Message and no live
    Conversation for the event's keys, no Line_Order for the ``webhook_event_id``,
    no ``pending``/``sent`` (or any) Outbound_Message was staged, no audit receipt
    was written, and the global counts of all state-bearing tables are unchanged
    — verifying the all-or-nothing transactional guarantee (Req 2.6).

Each generated example runs inside nested SAVEPOINTs that are rolled back, so the
test provisions and tears down its own channel/secret/trigger without leaking
state. Every generated id is namespaced with a fresh UUID so it can never collide
with pre-existing rows in a shared test database.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when no
database is configured, the driver is missing, the connection cannot be
established, the ingestion RPC / its dependencies / Vault are not present, or the
test role cannot create the failure-injection trigger.
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

# State-bearing tables whose global counts must be unchanged by a failed ingest.
_SIDE_EFFECT_TABLES = (
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_orders",
    "line_oa_audit_log",
)


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
# Connection fixture — skip cleanly when the DB / driver / RPC / Vault / trigger
# privilege is unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping strict-consistency "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping strict-consistency test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping strict-consistency test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the ingest RPC + deps + Vault + trigger privilege exist."""
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
                    f"{sig} is not installed; skipping strict-consistency property test."
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
                "skipping strict-consistency property test."
            )

        # The failure is injected via a transient trigger on the inbound table; if
        # the test role cannot create triggers there, skip rather than error.
        cur.execute(
            "select has_table_privilege(current_user, "
            "'public.line_oa_inbound_messages', 'TRIGGER')"
        )
        if not cur.fetchone()[0]:
            conn.rollback()
            pytest.skip(
                "Test role lacks TRIGGER privilege on public.line_oa_inbound_messages; "
                "cannot inject a persistence failure — skipping strict-consistency test."
            )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _global_counts(cur: Any) -> dict[str, int]:
    out: dict[str, int] = {}
    for table in _SIDE_EFFECT_TABLES:
        cur.execute(f"select count(*) from public.{table}")
        out[table] = cur.fetchone()[0]
    return out


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


def _any_conversation_ids(cur: Any, line_user_id: str, vertical_context: str) -> list[Any]:
    cur.execute(
        """
        select id from public.line_oa_conversations
        where line_user_id = %s and vertical_context = %s
        """,
        (line_user_id, vertical_context),
    )
    return [r[0] for r in cur.fetchall()]


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


def _staged_outbound_count(cur: Any) -> int:
    """Count any pending/sent outbound rows — ingestion must never stage a send."""
    cur.execute(
        "select count(*) from public.line_oa_outbound_messages "
        "where status in ('pending', 'sent')"
    )
    return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# Property 5
# ---------------------------------------------------------------------------


@property(
    5,
    "A persistence failure produces zero external side effects — no LINE call, "
    "no notification, no pending/sent outbound row",
)
@given(
    secret=secret_strategy,
    vertical=vertical_strategy,
    message_text=message_text_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_strict_consistency_on_persistence_failure(
    db_conn: Any,
    secret: str,
    vertical: str,
    message_text: str,
) -> None:
    """**Validates: Requirement 2.6**"""
    channel_identifier = f"line-oa-strict-{uuid.uuid4()}"
    secret_name = f"line_oa_strict_secret_{uuid.uuid4().hex}"
    webhook_event_id = f"evt-{uuid.uuid4().hex}"
    line_user_id = f"U-strict-{uuid.uuid4().hex}"
    suffix = uuid.uuid4().hex
    fail_fn = f"line_oa_prop5_fail_{suffix}"
    fail_trg = f"line_oa_prop5_fail_trg_{suffix}"
    marker = f"injected persistence failure (line-oa Property 5 strict consistency) {suffix}"

    body = _build_body(webhook_event_id, line_user_id, message_text)
    signature = _expected_signature(secret, body)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop5_outer")
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

            # The event's keys must be absent before we start.
            assert _inbound_count(cur, webhook_event_id) == 0
            assert _any_conversation_ids(cur, line_user_id, vertical) == []

            # Snapshot the global state-bearing counts to prove all-or-nothing.
            before = _global_counts(cur)
            staged_before = _staged_outbound_count(cur)

            # Inject a persistence failure at the Inbound_Message write. A plain
            # RAISE is SQLSTATE P0001 (raise_exception) — NOT unique_violation — so
            # the RPC's per-event handler does not swallow it; it propagates out and
            # aborts the whole ingest. The conversation is created BEFORE this insert,
            # so a correct all-or-nothing transaction rolls that back too.
            cur.execute(
                f"""
                create function public.{fail_fn}() returns trigger
                language plpgsql as $f$
                begin
                  raise exception '{marker}';
                end;
                $f$;
                """
            )
            cur.execute(
                f"""
                create trigger {fail_trg}
                before insert on public.line_oa_inbound_messages
                for each row execute function public.{fail_fn}();
                """
            )

            # ---- Deliver a valid, signed webhook; ingestion MUST fail. ----
            cur.execute("savepoint prop5_inner")
            raised_msg: str | None = None
            try:
                cur.execute(
                    """
                    select accepted, reason, events_processed, events_duplicate, events_skipped
                    from public.rpc_ingest_line_webhook(%s, %s, %s)
                    """,
                    (body, signature, channel_identifier),
                )
                cur.fetchone()
            except Exception as exc:  # the injected persistence failure propagates
                raised_msg = str(exc)
                # Recover the aborted subtransaction so we can inspect the end state.
                cur.execute("rollback to savepoint prop5_inner")

            assert raised_msg is not None, (
                "a persistence failure during ingestion must abort the call, not be swallowed"
            )
            assert marker in raised_msg, (
                "the ingest must have failed because of the injected persistence error, "
                f"got: {raised_msg!r}"
            )

            # ---- Zero side effects: the all-or-nothing guarantee (Req 2.6). ----
            assert _inbound_count(cur, webhook_event_id) == 0, (
                "a failed ingest must persist no Inbound_Message"
            )
            assert _any_conversation_ids(cur, line_user_id, vertical) == [], (
                "a failed ingest must leave no orphan Conversation (the conversation "
                "is created before the inbound write, yet must roll back with it)"
            )
            assert _live_conversation_ids(cur, line_user_id, vertical) == [], (
                "a failed ingest must leave no live Conversation"
            )
            assert _order_count(cur, webhook_event_id) == 0, (
                "a failed ingest must create no Line_Order"
            )
            assert _receipt_count(cur, webhook_event_id) == 0, (
                "a failed ingest must write no audit receipt for the event"
            )

            # No outbound was staged (ingestion stages no send, and a failed unit
            # certainly must not) — so no LINE call / notification can ever occur.
            assert _staged_outbound_count(cur) == staged_before, (
                "a failed ingest must not stage any pending/sent Outbound_Message"
            )

            # Global counts of every state-bearing table are unchanged.
            after = _global_counts(cur)
            assert after == before, (
                f"a persistence failure must leave zero partial side effects: "
                f"{before} -> {after}"
            )
        finally:
            cur.execute("rollback to savepoint prop5_outer")
            cur.execute("release savepoint prop5_outer")

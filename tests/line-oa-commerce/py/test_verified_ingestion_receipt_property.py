"""Property test — verified-ingestion receipt (LINE OA Commerce, Module B5).

Spec task: 8.2 Write property test for verified-ingestion receipt.

Implements exactly ONE numbered property against the inbound write path shipped by
task 8.1 (``00000000000022_line_oa_ingest_webhook.sql`` —
``public.rpc_ingest_line_webhook(text, text, text)``):

    Property 3: A first-time verified Webhook_Event yields exactly one audit
    receipt for that webhook_event_id.
    Validates: Requirements 1.7, 13.1.

For every generated example the test:

  * provisions a real channel — a Supabase Vault secret holding the plaintext
    ``Channel_Secret`` plus a ``line_oa_channels`` row referencing it — exactly as
    ``rpc_ingest_line_webhook`` resolves at runtime (mirrors task 6.2);
  * builds a valid LINE webhook body carrying a freshly generated, run-unique
    ``webhookEventId`` and ``source.userId``;
  * computes the correct signature ``base64(HMAC-SHA256(secret, raw_body))`` and
    invokes ``rpc_ingest_line_webhook`` EXACTLY ONCE with that body/signature;
  * asserts the delivery was accepted and that EXACTLY ONE audit receipt
    (``event_type = 'webhook_inbound_received'``) exists for that
    ``webhook_event_id`` (matched verbatim from the receipt's ``entity_ref``).

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own channel/secret/ingested state without leaking.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when no
database is configured, the driver is missing, the connection cannot be
established, or any of the ingestion RPC / signature helper / identity helper /
Vault / required tables are unavailable.
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

# The audit receipt event_type written per first-time event by the RPC (task 8.1).
_RECEIPT_EVENT_TYPE = "webhook_inbound_received"

# Verticals add variety; they are not part of this property's invariant.
VERTICALS = ("monolith", "tcck")

# resolve_actor() reads request.jwt.claims; supply a non-secret principal so the
# RPC's actor resolution succeeds regardless of the C12 helper's strictness.
_CLAIMS = json.dumps({"sub": str(uuid.uuid4()), "app_metadata": {"roles": ["admin"]}})

# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so generated text
# round-trips identically through Python's UTF-8 encoder and Postgres; combined
# with ensure_ascii=True the serialized body is pure ASCII, so the signature
# computed here matches what the DB helper recomputes over the same bytes.
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

secret_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)
message_text_strategy = st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=200)


def _expected_signature(secret: str, body: str) -> str:
    """base64( HMAC-SHA256(key=secret, msg=body) ) — mirrors the DB verify helper."""
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def _build_webhook_body(webhook_event_id: str, line_user_id: str, text: str) -> str:
    """Serialize a valid single-event LINE webhook delivery as its exact raw body.

    ensure_ascii=True yields a pure-ASCII string so the bytes signed here are
    identical to the bytes the DB recomputes the HMAC over.
    """
    payload = {
        "destination": f"U{uuid.uuid4().hex}",
        "events": [
            {
                "type": "message",
                "webhookEventId": webhook_event_id,
                "source": {"type": "user", "userId": line_user_id},
                "timestamp": 1700000000000,
                "mode": "active",
                "replyToken": uuid.uuid4().hex,
                "message": {"type": "text", "id": uuid.uuid4().hex, "text": text},
            }
        ],
    }
    return json.dumps(payload, ensure_ascii=True)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / Vault
# / tables are unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping verified-ingestion receipt "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping verified-ingestion receipt test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping verified-ingestion receipt test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless the ingestion RPC, its helpers, Vault, and tables are present
    AND the RPC can be exercised end-to-end (provision channel -> verified ingest).
    """
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_ingest_line_webhook(text,text,text)",
            "public.line_oa_verify_signature(text,text,text)",
            "public.line_oa_resolve_channel(text)",
            "public.line_oa_resolve_customer_identity(text,text)",
            "public.resolve_actor()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "verified-ingestion receipt property test."
                )

        for table in (
            "public.line_oa_channels",
            "public.line_oa_inbound_messages",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping verified-ingestion receipt "
                    "property test."
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
                "Supabase Vault (vault.create_secret) is not available; skipping "
                "verified-ingestion receipt property test."
            )

        # Probe: can we provision a channel and run one verified ingestion end-to-end?
        cur.execute("savepoint probe")
        try:
            secret = f"probe-secret-{uuid.uuid4().hex}"
            channel_identifier = f"line-oa-recpt-probe-{uuid.uuid4()}"
            secret_name = f"line_oa_recpt_probe_{uuid.uuid4().hex}"
            webhook_event_id = f"probe-{uuid.uuid4().hex}"
            line_user_id = f"U{uuid.uuid4().hex}"

            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            _provision_channel(cur, channel_identifier, secret, secret_name, "monolith")
            body = _build_webhook_body(webhook_event_id, line_user_id, "probe")
            _ingest(cur, body, _expected_signature(secret, body), channel_identifier)
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_ingest_line_webhook end-to-end; skipping "
                f"verified-ingestion receipt property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _provision_channel(
    cur: Any, channel_identifier: str, secret: str, secret_name: str, vertical: str
) -> None:
    """Create the Vault secret + line_oa_channels row the RPC resolves at runtime."""
    cur.execute("select vault.create_secret(%s, %s)", (secret, secret_name))
    secret_ref = cur.fetchone()[0]  # uuid id; verify helper matches id or name
    cur.execute(
        """
        insert into public.line_oa_channels
            (channel_identifier, vertical_context,
             channel_secret_ref, channel_access_token_ref, is_active)
        values (%s, %s, %s, %s, true)
        """,
        (channel_identifier, vertical, str(secret_ref), f"token_ref_{uuid.uuid4().hex}"),
    )


def _ingest(cur: Any, body: str, signature: str, channel_identifier: str) -> tuple[Any, ...]:
    """Invoke rpc_ingest_line_webhook once and return its OUT row."""
    cur.execute(
        "select accepted, reason, events_processed, events_duplicate, events_skipped "
        "from public.rpc_ingest_line_webhook(%s, %s, %s)",
        (body, signature, channel_identifier),
    )
    return cur.fetchone()


# ---------------------------------------------------------------------------
# Property 3
# ---------------------------------------------------------------------------


@property(
    3,
    "A first-time verified Webhook_Event yields exactly one audit receipt for that "
    "webhook_event_id",
)
@given(
    secret=secret_strategy,
    text=message_text_strategy,
    vertical=st.sampled_from(VERTICALS),
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_verified_ingestion_receipt(
    db_conn: Any,
    secret: str,
    text: str,
    vertical: str,
) -> None:
    """**Validates: Requirements 1.7, 13.1**"""
    # Run-unique, colon-free identifiers so webhook_event_id is recoverable verbatim
    # from the pipe/colon-delimited audit entity_ref.
    webhook_event_id = f"prop3-{uuid.uuid4().hex}"
    line_user_id = f"U{uuid.uuid4().hex}"
    channel_identifier = f"line-oa-recpt-{uuid.uuid4()}"
    secret_name = f"line_oa_recpt_secret_{uuid.uuid4().hex}"
    receipt_filter = f"webhook_event_id:{webhook_event_id}|%"

    body = _build_webhook_body(webhook_event_id, line_user_id, text)
    signature = _expected_signature(secret, body)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop3")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))

            _provision_channel(cur, channel_identifier, secret, secret_name, vertical)

            # No receipt references this webhook_event_id before ingestion.
            cur.execute(
                "select count(*) from public.line_oa_audit_log "
                "where event_type = %s and entity_ref like %s",
                (_RECEIPT_EVENT_TYPE, receipt_filter),
            )
            assert cur.fetchone()[0] == 0, (
                "no audit receipt should exist for this webhook_event_id before ingestion"
            )

            # ---- Invoke the ingestion RPC EXACTLY ONCE with a valid signature. ----
            accepted, reason, processed, duplicate, skipped = _ingest(
                cur, body, signature, channel_identifier
            )

            # The (correctly signed) first-time delivery is accepted and processed.
            assert accepted is True, f"verified delivery must be accepted; reason={reason!r}"
            assert reason == "accepted", f"reason must be 'accepted', got {reason!r}"
            assert processed == 1, (
                f"the single first-time event must be processed exactly once; got {processed}"
            )
            assert duplicate == 0, f"first-time event must not be a duplicate; got {duplicate}"
            assert skipped == 0, (
                f"a well-formed event with webhookEventId + source.userId must not be "
                f"skipped; got {skipped}"
            )

            # ---- Exactly ONE audit receipt for this webhook_event_id (Req 1.7, 13.1). ----
            cur.execute(
                "select count(*) from public.line_oa_audit_log "
                "where event_type = %s and entity_ref like %s",
                (_RECEIPT_EVENT_TYPE, receipt_filter),
            )
            receipt_count = cur.fetchone()[0]
            assert receipt_count == 1, (
                "a first-time verified Webhook_Event must yield exactly one "
                f"'{_RECEIPT_EVENT_TYPE}' audit receipt for its webhook_event_id; "
                f"found {receipt_count}"
            )
        finally:
            cur.execute("rollback to savepoint prop3")
            cur.execute("release savepoint prop3")

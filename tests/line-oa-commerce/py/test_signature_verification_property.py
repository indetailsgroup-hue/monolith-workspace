"""Property test — signature verification (LINE OA Commerce, Module B5).

Spec task: 6.2 Write property test for signature verification.

Implements exactly ONE numbered property against the database-layer signature
helper shipped by task 6.1
(``00000000000010_line_oa_signature_verification.sql`` —
``public.line_oa_verify_signature(text, text, text)``):

    Property 1: HMAC-SHA256(secret, body) verifies; missing/tampered/wrong-secret
    signatures fail and produce no persisted state or side effects.
    Validates: Requirements 1.2, 1.3, 1.4.

For every generated ``(secret, body)`` pair the test:

  * provisions a real channel — a Supabase Vault secret holding the plaintext
    ``Channel_Secret`` plus a ``line_oa_channels`` row referencing it — exactly
    as ``rpc_ingest_line_webhook`` would resolve at runtime;
  * computes the correct signature ``base64(HMAC-SHA256(secret, body))`` and
    asserts ``line_oa_verify_signature`` returns TRUE (Req 1.2 round-trip);
  * asserts a tampered body, a wrong-secret signature, a malformed signature,
    and missing/empty/NULL signatures all return FALSE (Req 1.3, 1.4);
  * asserts verification is side-effect free: the row counts of every
    state-bearing ``line_oa_*`` table (conversations, inbound, outbound, orders,
    audit log) are identical before and after the verification calls.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own channel/secret without leaking state.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when
no database is configured, the driver is missing, the connection cannot be
established, or the verification helper / Vault are not present.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------
# Exclude surrogates (Cs) and control chars (Cc, which includes NUL) so the
# generated text round-trips identically through Python's UTF-8 encoder and
# Postgres' convert_to(..., 'UTF8'); Postgres text cannot store NUL bytes.
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

# A non-empty Channel_Secret (Vault rejects empty secrets).
secret_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)
# An arbitrary raw request body, possibly empty.
body_strategy = st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=256)

# State-bearing tables that signature verification must never touch.
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


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / helper / Vault
# is unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping signature-verification "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping signature-verification test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping signature-verification test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the verify helper and Supabase Vault are present."""
    with conn.cursor() as cur:
        cur.execute("select to_regprocedure('public.line_oa_verify_signature(text,text,text)')")
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.line_oa_verify_signature(text,text,text) is not installed; "
                "skipping signature-verification property test."
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
                "skipping signature-verification property test."
            )
    conn.rollback()


def _counts(cur: Any) -> dict[str, int]:
    out: dict[str, int] = {}
    for table in _SIDE_EFFECT_TABLES:
        cur.execute(f"select count(*) from public.{table}")
        out[table] = cur.fetchone()[0]
    return out


def _verify(cur: Any, channel: str, body: str, signature: Any) -> bool:
    cur.execute(
        "select public.line_oa_verify_signature(%s, %s, %s)",
        (channel, body, signature),
    )
    return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# Property 1
# ---------------------------------------------------------------------------


@property(
    1,
    "HMAC-SHA256(secret, body) verifies; missing/tampered/wrong-secret signatures "
    "fail and produce no persisted state or side effects",
)
@given(
    secret=secret_strategy,
    body=body_strategy,
    other_secret=secret_strategy,
    other_body=body_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_signature_verification(
    db_conn: Any,
    secret: str,
    body: str,
    other_secret: str,
    other_body: str,
) -> None:
    """**Validates: Requirements 1.2, 1.3, 1.4**"""
    # Guarantee the "tampered" / "wrong secret" inputs genuinely differ.
    if other_body == body:
        other_body = body + "\u00b6tamper"
    if other_secret == secret:
        other_secret = secret + "\u00b6wrong"

    channel_identifier = f"line-oa-sigtest-{uuid.uuid4()}"
    secret_name = f"line_oa_sigtest_secret_{uuid.uuid4().hex}"

    correct_sig = _expected_signature(secret, body)
    wrong_secret_sig = _expected_signature(other_secret, body)

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop1")
        try:
            # Provision the Vault secret + channel row the verifier resolves.
            cur.execute("select vault.create_secret(%s, %s)", (secret, secret_name))
            secret_ref = cur.fetchone()[0]  # uuid id; line_oa_verify_signature matches id or name
            cur.execute(
                """
                insert into public.line_oa_channels
                    (channel_identifier, vertical_context,
                     channel_secret_ref, channel_access_token_ref, is_active)
                values (%s, %s, %s, %s, true)
                """,
                (channel_identifier, "monolith", str(secret_ref), f"token_ref_{uuid.uuid4().hex}"),
            )

            before = _counts(cur)

            # Req 1.2 — the correct base64 HMAC-SHA256 signature verifies.
            assert _verify(cur, channel_identifier, body, correct_sig) is True, (
                "correct HMAC-SHA256 signature should verify"
            )

            # Req 1.4 — a tampered body with the original signature fails.
            assert _verify(cur, channel_identifier, other_body, correct_sig) is False, (
                "signature must not verify against a tampered body"
            )

            # Req 1.4 — a signature computed with the wrong secret fails.
            assert _verify(cur, channel_identifier, body, wrong_secret_sig) is False, (
                "signature computed with the wrong secret must not verify"
            )

            # Req 1.4 — a malformed (non-base64) signature is "no match", not an error.
            assert _verify(cur, channel_identifier, body, "!!!not-base64!!!") is False, (
                "malformed signature must be rejected without raising"
            )

            # Req 1.3 — missing / empty / whitespace / NULL signatures fail.
            assert _verify(cur, channel_identifier, body, "") is False, (
                "empty signature must be rejected"
            )
            assert _verify(cur, channel_identifier, body, "   ") is False, (
                "whitespace-only signature must be rejected"
            )
            assert _verify(cur, channel_identifier, body, None) is False, (
                "NULL signature must be rejected"
            )

            # No persisted state / side effects from verification (property tail).
            after = _counts(cur)
            assert after == before, (
                f"signature verification must not change persisted state: {before} -> {after}"
            )
        finally:
            cur.execute("rollback to savepoint prop1")
            cur.execute("release savepoint prop1")

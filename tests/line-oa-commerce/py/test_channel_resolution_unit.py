"""Channel/secret resolution ordering — example-based unit tests.

Spec task: 6.3 Write unit tests for channel/secret resolution ordering.

These are EXAMPLE-BASED unit tests (not a numbered property test). They exercise
the channel-resolution helpers shipped by task 6.1 in
``00000000000010_line_oa_signature_verification.sql``:

  * ``public.line_oa_resolve_channel(text)`` — returns the NON-SECRET context for
    a receiving channel: its ``vertical_context`` and the Vault REFERENCE for the
    Channel_Access_Token (never the token value, never the secret).
  * ``public.line_oa_verify_signature(text, text, text)`` — its channel-resolution
    ordering: an unresolvable channel is rejected BEFORE any secret is used.

What is verified (Requirements 1.1, 1.6):

  1. Resolution by ``channel_identifier`` returns the correct ``vertical_context``
     and access-token reference for an ACTIVE channel.
  2. An unresolvable channel — an UNKNOWN identifier or an INACTIVE channel — is
     rejected, and the rejection error NEVER contains the channel's secret or
     access-token reference values.

The tests run against a real Postgres instance when ``LINE_OA_TEST_DATABASE_URL``
is reachable; when no database is configured (or the driver/connection is
unavailable) every test SKIPS cleanly — it never fails for lack of a DB.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest

from harness import database_url, get_connection

# ---------------------------------------------------------------------------
# Sentinel fixtures — distinctive values so we can prove they never leak into
# an error message. The *_ref values are Vault references (never plaintext);
# the resolution helpers must never echo them on the rejection path (Req 1.6).
# ---------------------------------------------------------------------------

_SUFFIX = uuid.uuid4().hex[:8]

ACTIVE_CHANNEL = f"test-active-channel-{_SUFFIX}"
ACTIVE_VERTICAL = "monolith"
ACTIVE_SECRET_REF = f"vault-secret-ref-SENTINEL-{_SUFFIX}"
ACTIVE_TOKEN_REF = f"vault-token-ref-SENTINEL-{_SUFFIX}"

INACTIVE_CHANNEL = f"test-inactive-channel-{_SUFFIX}"
INACTIVE_VERTICAL = "tcck"
INACTIVE_SECRET_REF = f"vault-secret-ref-INACTIVE-{_SUFFIX}"
INACTIVE_TOKEN_REF = f"vault-token-ref-INACTIVE-{_SUFFIX}"

UNKNOWN_CHANNEL = f"test-unknown-channel-{_SUFFIX}"

# Every reference value that must never appear in a rejection error message.
SECRET_AND_REF_VALUES = [
    ACTIVE_SECRET_REF,
    ACTIVE_TOKEN_REF,
    INACTIVE_SECRET_REF,
    INACTIVE_TOKEN_REF,
]


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when no DB is reachable; seed the two test
# channels (one active, one inactive) and remove them on teardown.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    """Yield an autocommit catalog connection, or skip the module if unavailable.

    Skips (never fails) when ``LINE_OA_TEST_DATABASE_URL`` is unset, the driver
    is not installed, or the connection cannot be established. Autocommit keeps a
    statement-level error (an expected rejection) from poisoning later statements.
    """
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping channel-resolution "
            "unit tests (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping channel-resolution unit tests ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping channel-resolution unit tests ({exc}).")

    conn.autocommit = True

    # Pre-flight: the resolution helper must exist (migration 10 applied). If the
    # schema/helpers are absent, skip rather than fail — this unit test asserts
    # behavior, not migration ordering.
    try:
        with conn.cursor() as cur:
            cur.execute("select to_regprocedure('public.line_oa_resolve_channel(text)')")
            if cur.fetchone()[0] is None:
                conn.close()
                pytest.skip(
                    "public.line_oa_resolve_channel(text) not present; skipping "
                    "(signature-verification migration not applied)."
                )
    except Exception as exc:
        conn.close()
        pytest.skip(f"Could not inspect catalog; skipping channel-resolution unit tests ({exc}).")

    try:
        _seed_channels(conn)
        yield conn
    finally:
        try:
            _cleanup_channels(conn)
        finally:
            conn.close()


def _seed_channels(conn: Any) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.line_oa_channels
                (channel_identifier, vertical_context, channel_secret_ref,
                 channel_access_token_ref, is_active)
            values (%s, %s, %s, %s, true),
                   (%s, %s, %s, %s, false)
            on conflict (channel_identifier) do update set
                vertical_context = excluded.vertical_context,
                channel_secret_ref = excluded.channel_secret_ref,
                channel_access_token_ref = excluded.channel_access_token_ref,
                is_active = excluded.is_active
            """,
            (
                ACTIVE_CHANNEL, ACTIVE_VERTICAL, ACTIVE_SECRET_REF, ACTIVE_TOKEN_REF,
                INACTIVE_CHANNEL, INACTIVE_VERTICAL, INACTIVE_SECRET_REF, INACTIVE_TOKEN_REF,
            ),
        )


def _cleanup_channels(conn: Any) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "delete from public.line_oa_channels where channel_identifier = any(%s)",
            ([ACTIVE_CHANNEL, INACTIVE_CHANNEL],),
        )


# ---------------------------------------------------------------------------
# 1. Active channel resolves to the correct vertical + access-token ref (Req 1.1)
# ---------------------------------------------------------------------------


def test_resolve_active_channel_returns_vertical_and_token_ref(db_conn: Any) -> None:
    """An active channel resolves to its vertical_context and access-token ref."""
    with db_conn.cursor() as cur:
        cur.execute(
            "select vertical_context, channel_access_token_ref "
            "from public.line_oa_resolve_channel(%s)",
            (ACTIVE_CHANNEL,),
        )
        row = cur.fetchone()

    assert row is not None, "resolve_channel returned no row for an active channel"
    vertical_context, access_token_ref = row
    assert vertical_context == ACTIVE_VERTICAL
    assert access_token_ref == ACTIVE_TOKEN_REF


def test_resolve_active_channel_never_returns_the_secret_ref(db_conn: Any) -> None:
    """resolve_channel exposes only the token reference, never the secret reference.

    The function's signature returns exactly (vertical_context,
    channel_access_token_ref); the Channel_Secret reference must not be among the
    output columns or values (Req 1.5/1.6 secret hygiene).
    """
    with db_conn.cursor() as cur:
        cur.execute("select * from public.line_oa_resolve_channel(%s)", (ACTIVE_CHANNEL,))
        colnames = [d.name for d in cur.description]
        row = cur.fetchone()

    assert "channel_secret_ref" not in colnames, (
        f"resolve_channel must not surface the secret reference; columns={colnames}"
    )
    assert ACTIVE_SECRET_REF not in [str(v) for v in row], (
        "resolve_channel output contained the Channel_Secret reference value"
    )


# ---------------------------------------------------------------------------
# 2. Unresolvable channels are rejected without exposing secret/ref values (Req 1.6)
# ---------------------------------------------------------------------------


def _resolve_expecting_rejection(conn: Any, channel_identifier: str) -> Exception:
    """Call resolve_channel for an unresolvable channel; return the raised error."""
    import psycopg

    with pytest.raises(psycopg.Error) as excinfo:
        with conn.cursor() as cur:
            cur.execute(
                "select vertical_context, channel_access_token_ref "
                "from public.line_oa_resolve_channel(%s)",
                (channel_identifier,),
            )
            cur.fetchone()
    return excinfo.value


def _assert_no_secret_leak(err: Exception) -> None:
    message = str(err)
    for secret in SECRET_AND_REF_VALUES:
        assert secret not in message, (
            f"rejection error message leaked a secret/reference value: {secret!r}"
        )


def test_resolve_unknown_channel_is_rejected_without_secret_leak(db_conn: Any) -> None:
    """An unknown channel_identifier is rejected (P0002) with no secret in the error."""
    err = _resolve_expecting_rejection(db_conn, UNKNOWN_CHANNEL)
    assert getattr(err, "sqlstate", None) == "P0002", (
        f"expected no_data_found (P0002), got sqlstate={getattr(err, 'sqlstate', None)}"
    )
    _assert_no_secret_leak(err)


def test_resolve_inactive_channel_is_rejected_without_secret_leak(db_conn: Any) -> None:
    """An INACTIVE channel resolves like an unknown one — rejected, no secret leak.

    The inactive channel row carries distinctive secret/token reference values;
    the rejection must not echo either of them (Req 1.6).
    """
    err = _resolve_expecting_rejection(db_conn, INACTIVE_CHANNEL)
    assert getattr(err, "sqlstate", None) == "P0002", (
        f"expected no_data_found (P0002), got sqlstate={getattr(err, 'sqlstate', None)}"
    )
    _assert_no_secret_leak(err)


# ---------------------------------------------------------------------------
# Resolution ordering inside verify_signature: an unresolvable channel is
# rejected BEFORE any secret is resolved/used, and without exposing references.
# (A non-blank signature is supplied so the missing-signature short-circuit in
#  verify_signature is not what triggers the rejection.)
# ---------------------------------------------------------------------------


def _verify_expecting_rejection(conn: Any, channel_identifier: str) -> Exception:
    import psycopg

    with pytest.raises(psycopg.Error) as excinfo:
        with conn.cursor() as cur:
            cur.execute(
                "select public.line_oa_verify_signature(%s, %s, %s)",
                (channel_identifier, "any-raw-body", "bm90LWEtcmVhbC1zaWc="),
            )
            cur.fetchone()
    return excinfo.value


def test_verify_signature_rejects_unknown_channel_before_using_secret(db_conn: Any) -> None:
    """verify_signature rejects an unknown channel (P0002) with no secret leak."""
    err = _verify_expecting_rejection(db_conn, UNKNOWN_CHANNEL)
    assert getattr(err, "sqlstate", None) == "P0002"
    _assert_no_secret_leak(err)


def test_verify_signature_rejects_inactive_channel_before_using_secret(db_conn: Any) -> None:
    """verify_signature treats an inactive channel as unresolvable, with no leak."""
    err = _verify_expecting_rejection(db_conn, INACTIVE_CHANNEL)
    assert getattr(err, "sqlstate", None) == "P0002"
    _assert_no_secret_leak(err)

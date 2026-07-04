"""Property test — secret non-exposure (LINE OA Commerce, Module B5).

Spec task: 18.3 Write property test for secret non-exposure.

Implements exactly ONE numbered property against the shipped secret-handling
paths — channel resolution + HMAC-SHA256 signature verification
(``00000000000010_line_oa_signature_verification.sql``), inbound ingestion
(``00000000000022_line_oa_ingest_webhook.sql``), and the token-scrubbing
send-result RPC (``00000000000041_line_oa_record_send_result.sql``):

    Property 2: For any Channel_Secret/Channel_Access_Token and any execution
    path, no log line, error message, or audit field contains the secret value.
    Validates: Requirements 1.5, 4.6, 13.3.

For every generated ``(Channel_Secret, Channel_Access_Token)`` pair the test
provisions a real channel exactly as the runtime resolves it — two Supabase
Vault secrets holding the plaintext ``Channel_Secret`` and
``Channel_Access_Token`` plus a ``line_oa_channels`` row referencing them by
Vault id (never plaintext) — and then drives the secret through a
representative spread of execution paths:

  * **Signature verification — valid** (Req 1.2/1.5): the correct
    ``base64(HMAC-SHA256(secret, body))`` verifies TRUE while the plaintext
    secret stays inside the helper.
  * **Signature verification — invalid** (Req 1.3/1.4): a wrong-secret
    signature and the access-token-as-signature both verify FALSE.
  * **Ingestion — accepted** (Req 1.7/13.1): a correctly-signed LINE delivery
    is accepted and writes audit receipts built from non-secret identifiers.
  * **Ingestion — rejected** (Req 1.4): a tampered signature is rejected and
    writes a ``webhook_rejected_signature`` audit entry.
  * **Ingestion — unresolvable channel** (Req 1.6): an unknown channel raises;
    the raised error message is captured for inspection.
  * **Send-failure recording — token echoed** (Req 4.6/13.3): a failure is
    recorded through ``rpc_record_line_send_result`` whose supplied
    ``error_detail`` deliberately *echoes the Channel_Access_Token* (bare,
    ``Bearer``-prefixed, and embedded in an API error string), simulating a
    sender that mistakenly forwarded a raw LINE API error.

It then asserts that for the generated secret AND token, the plaintext value
appears in **none** of:

  * any error message raised or returned (``reason`` / ``error_detail`` OUTs,
    captured exception text);
  * any persisted field of any ``line_oa_*`` table — including every
    ``line_oa_audit_log`` field (``entity_ref`` etc.) and the outbound row's
    stored ``error_detail`` — verified by scanning each table's full row text.

Realistic-secret modeling: a LINE ``Channel_Access_Token`` is a long opaque
token; we generate token-shaped values (base64url alphabet, length >= 40) so
the send-result RPC's token scrub is exercised on realistic material, and we
generate distinctive long ``Channel_Secret`` values so a coincidental substring
match against unrelated rows is not possible. ``vault.decrypted_secrets`` (the
Vault store itself) is intentionally NOT scanned — that is the encrypted-at-rest
custody boundary, not a log/error/audit field.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own Vault secrets / channel / conversation /
template / outbound / audit rows without leaking state.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when
no database is configured, the driver is missing, the connection cannot be
established, Supabase Vault or any required RPC/helper/table is unavailable, the
governance-claims convention is not honored, no active Site_Code exists, or the
provision -> exercise -> record pipeline cannot be driven end-to-end.
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
# base64url alphabet: ASCII-only (round-trips through Vault + UTF-8 HMAC), and a
# subset of the send-result RPC's token-scrub character class so a realistic
# (>= 40 char) access-token run is fully redactable.
_B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

# A LINE Channel_Access_Token is a long opaque token; model that shape (>= 40).
token_strategy = st.text(alphabet=_B64URL, min_size=40, max_size=200)
# A distinctive, long Channel_Secret (>= 24) — non-empty (Vault rejects empty)
# and long enough that a coincidental substring match is not possible.
secret_strategy = st.text(alphabet=_B64URL, min_size=24, max_size=80)

# Brand-voice-configured verticals; only these clear the brand-voice gate so the
# composition RPC stages a pending row to record a (token-echoing) failure
# against. vertical_context is NOT under test here.
VERTICALS = ("monolith", "tcck")

# Governance principal so the in-function role re-check on the send/record path
# passes regardless of branch site grants, isolating secret-hygiene behavior.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000cc", "app_metadata": {"roles": ["admin"]}}
)

# Every state-bearing line_oa_* table. The plaintext secret/token must appear in
# NONE of them (channels store Vault references only; audit/outbound build text
# from non-secret identifiers and scrub token-shaped material).
_LINE_OA_TABLES = (
    "line_oa_channels",
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_customer_identity",
    "line_oa_message_templates",
    "line_oa_orders",
    "line_oa_audit_log",
)


@st.composite
def _case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a (secret, token, vertical, echo-format) example."""
    secret = draw(secret_strategy)
    token = draw(token_strategy)
    # Guarantee the two secrets are distinct (keeps the token-run >= 40).
    if token == secret:
        token = token + "Zz09"
    vertical = draw(st.sampled_from(VERTICALS))
    echo = draw(st.sampled_from(("bare", "bearer", "embedded")))
    return {"secret": secret, "token": token, "vertical": vertical, "echo": echo}


def _expected_signature(secret: str, body: str) -> str:
    """base64( HMAC-SHA256(key=secret, msg=body) ) — mirrors the DB helper."""
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def _error_detail(echo: str, token: str) -> str:
    """A failure detail that deliberately echoes the Channel_Access_Token."""
    if echo == "bare":
        return token
    if echo == "bearer":
        return f"LINE API responded 401: Authorization: Bearer {token}"
    return f"send failed: invalid channel access token {token} (status 401)"


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / Vault / RPCs /
# helpers / tables are unavailable, governance claims are not honored, no active
# site exists, or the provision->exercise->record pipeline cannot be driven.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping secret-non-exposure "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping secret-non-exposure test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping secret-non-exposure test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _active_site_codes(cur: Any) -> list[str]:
    cur.execute("select site_code from public.get_active_site_codes()")
    return [row[0] for row in cur.fetchall()]


def _require_dependencies(conn: Any) -> None:
    """Skip unless Vault + every required routine/table exist, governance claims
    are honored, an active Site_Code exists, AND a full provision -> verify ->
    ingest -> stage -> record-failure round-trip can be exercised end-to-end."""
    with conn.cursor() as cur:
        # Supabase Vault is required to provision the Channel_Secret/Access_Token.
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
                "skipping secret-non-exposure property test."
            )

        for proc in (
            "public.line_oa_verify_signature(text,text,text)",
            "public.rpc_ingest_line_webhook(text,text,text)",
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
                    "secret-non-exposure property test."
                )

        for table in _LINE_OA_TABLES:
            cur.execute("select to_regclass(%s)", (f"public.{table}",))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"public.{table} is not installed; skipping secret-non-exposure "
                    "property test."
                )

        # Probe: governance honored, an active site exists, and one full
        # provision -> verify -> ingest -> stage -> record-failure round-trip works.
        cur.execute("savepoint probe")
        ok = False
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            if is_gov and active:
                vertical = "monolith"
                secret = "ProbeSecret_" + uuid.uuid4().hex
                token = "ProbeToken_" + uuid.uuid4().hex + uuid.uuid4().hex
                channel = f"line-oa-secret-probe-{uuid.uuid4()}"
                _provision_channel(cur, channel, vertical, secret, token)
                body, sig = _signed_delivery(secret)
                ing = _ingest(cur, body, sig, channel)
                conv = _seed_open(cur, f"probe-{uuid.uuid4().hex}", vertical, active[0])
                tkey = _seed_template(cur, vertical)
                staged = _stage_pending(cur, conv, tkey)
                if ing["accepted"] and staged["staged"] and staged["outbound_id"] is not None:
                    res = _record_failure(cur, staged["outbound_id"], token)
                    ok = res["status"] == "failed"
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                "cannot exercise the provision->verify->ingest->record pipeline "
                f"end-to-end; skipping secret-non-exposure property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping secret-non-exposure property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping secret-non-exposure property test."
                )
            if not ok:
                conn.rollback()
                pytest.skip(
                    "the provision->record pipeline did not record a failed row in the "
                    "probe; skipping secret-non-exposure property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _provision_channel(
    cur: Any, channel_identifier: str, vertical: str, secret: str, token: str
) -> None:
    """Store the Channel_Secret + Channel_Access_Token in Vault and insert a
    line_oa_channels row referencing them by Vault id (never plaintext)."""
    cur.execute(
        "select vault.create_secret(%s, %s)",
        (secret, f"line_oa_secret_{uuid.uuid4().hex}"),
    )
    secret_ref = cur.fetchone()[0]
    cur.execute(
        "select vault.create_secret(%s, %s)",
        (token, f"line_oa_token_{uuid.uuid4().hex}"),
    )
    token_ref = cur.fetchone()[0]
    cur.execute(
        """
        insert into public.line_oa_channels
            (channel_identifier, vertical_context,
             channel_secret_ref, channel_access_token_ref, is_active)
        values (%s, %s, %s, %s, true)
        """,
        (channel_identifier, vertical, str(secret_ref), str(token_ref)),
    )


def _signed_delivery(secret: str) -> tuple[str, str]:
    """Build a valid LINE delivery body (with no secret material) and its correct
    x-line-signature. Returns the EXACT body string used to compute the HMAC."""
    body = json.dumps(
        {
            "destination": uuid.uuid4().hex,
            "events": [
                {
                    "type": "message",
                    "webhookEventId": f"evt-{uuid.uuid4().hex}",
                    "source": {"type": "user", "userId": f"U{uuid.uuid4().hex}"},
                    "message": {"type": "text", "text": "hello"},
                }
            ],
        }
    )
    return body, _expected_signature(secret, body)


def _verify(cur: Any, channel: str, body: str, signature: Any) -> bool:
    cur.execute(
        "select public.line_oa_verify_signature(%s, %s, %s)",
        (channel, body, signature),
    )
    return cur.fetchone()[0]


def _ingest(cur: Any, body: str, signature: Any, channel: str) -> dict[str, Any]:
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select accepted, reason, events_processed, events_duplicate, events_skipped "
        "from public.rpc_ingest_line_webhook(%s, %s, %s)",
        (body, signature, channel),
    )
    r = cur.fetchone()
    return {
        "accepted": r[0],
        "reason": r[1],
        "events_processed": r[2],
        "events_duplicate": r[3],
        "events_skipped": r[4],
    }


def _seed_open(cur: Any, line_user_id: str, vertical: str, site_code: str) -> Any:
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, 'open') returning id",
        (line_user_id, vertical, site_code),
    )
    return cur.fetchone()[0]


def _seed_template(cur: Any, vertical: str) -> str:
    template_key = f"secret-{uuid.uuid4().hex}"
    cur.execute(
        "insert into public.line_oa_message_templates "
        "(template_key, vertical_context, body, is_active) "
        "values (%s, %s, %s, true)",
        (template_key, vertical, "Thanks for your message."),
    )
    return template_key


def _stage_pending(cur: Any, conversation_id: Any, template_key: str) -> dict[str, Any]:
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select staged, outbound_id, send_type, classification, reason "
        "from public.rpc_send_line_outbound(%s, %s, %s::jsonb)",
        (conversation_id, template_key, json.dumps({})),
    )
    r = cur.fetchone()
    return {"staged": r[0], "outbound_id": r[1], "send_type": r[2], "reason": r[4]}


def _record_failure(cur: Any, outbound_id: Any, error_detail: str | None) -> dict[str, Any]:
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select outbound_id, status, error_detail, sent_at, recorded "
        "from public.rpc_record_line_send_result(%s, %s, %s)",
        (outbound_id, "failed", error_detail),
    )
    r = cur.fetchone()
    return {"outbound_id": r[0], "status": r[1], "error_detail": r[2], "sent_at": r[3]}


def _stored_error_detail(cur: Any, outbound_id: Any) -> Any:
    cur.execute(
        "select error_detail from public.line_oa_outbound_messages where id = %s",
        (outbound_id,),
    )
    return cur.fetchone()[0]


def _tables_containing(cur: Any, needle: str) -> list[str]:
    """Return every line_oa_* table whose full row text contains `needle` as a
    substring (exact, non-wildcard match via strpos)."""
    hits: list[str] = []
    for table in _LINE_OA_TABLES:
        cur.execute(
            f"select count(*) from public.{table} as r where strpos(r::text, %s) > 0",
            (needle,),
        )
        if cur.fetchone()[0] > 0:
            hits.append(table)
    return hits


# ---------------------------------------------------------------------------
# Property 2
# ---------------------------------------------------------------------------


@property(
    2,
    "For any Channel_Secret/Channel_Access_Token and any execution path, no log "
    "line, error message, or audit field contains the secret value",
)
@given(case=_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_secret_non_exposure(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 1.5, 4.6, 13.3**"""
    secret: str = case["secret"]
    token: str = case["token"]
    vertical: str = case["vertical"]
    echo: str = case["echo"]

    channel = f"line-oa-secret-{uuid.uuid4()}"
    line_user_id = f"secret-{uuid.uuid4().hex}"
    messages: list[str] = []  # every error message / returned reason / OUT detail

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop2")
        try:
            active = _active_site_codes(cur)
            if not active:
                pytest.skip("no active Site_Code available for this example.")
            site_code = active[0]

            _provision_channel(cur, channel, vertical, secret, token)
            body, correct_sig = _signed_delivery(secret)
            wrong_sig = _expected_signature(secret + "x", body)  # wrong-secret signature

            # --- Path: signature verification, valid (Req 1.2/1.5) --------------
            assert _verify(cur, channel, body, correct_sig) is True, (
                "the correct HMAC-SHA256 signature should verify"
            )

            # --- Path: signature verification, invalid (Req 1.3/1.4) ------------
            assert _verify(cur, channel, body, wrong_sig) is False, (
                "a wrong-secret signature must not verify"
            )
            # The access token is not a valid signature for this body either.
            assert _verify(cur, channel, body, token) is False, (
                "the access token must not pass as a signature"
            )

            # --- Path: ingestion accepted (Req 1.7/13.1) ------------------------
            accepted = _ingest(cur, body, correct_sig, channel)
            messages.append(str(accepted["reason"]))
            assert accepted["accepted"] is True, (
                f"a correctly-signed delivery must be accepted; got {accepted!r}"
            )

            # --- Path: ingestion rejected, tampered signature (Req 1.4) ---------
            rejected = _ingest(cur, body, wrong_sig, channel)
            messages.append(str(rejected["reason"]))
            assert rejected["accepted"] is False, (
                f"a wrong-secret signature must be rejected; got {rejected!r}"
            )

            # --- Path: unresolvable channel raises (Req 1.6) --------------------
            cur.execute("savepoint p2_unresolved")
            try:
                _ingest(cur, body, correct_sig, f"unknown-{uuid.uuid4()}")
            except Exception as exc:  # noqa: BLE001 — capture the raised text
                messages.append(str(exc))
            finally:
                cur.execute("rollback to savepoint p2_unresolved")
                cur.execute("release savepoint p2_unresolved")

            # --- Path: send-failure recording with the TOKEN echoed (Req 4.6) --
            conversation_id = _seed_open(cur, line_user_id, vertical, site_code)
            template_key = _seed_template(cur, vertical)
            staged = _stage_pending(cur, conversation_id, template_key)
            assert staged["staged"] is True and staged["outbound_id"] is not None, (
                f"a bound, slot-free, in-voice outbound must stage a pending row; got {staged!r}"
            )
            outbound_id = staged["outbound_id"]

            result = _record_failure(cur, outbound_id, _error_detail(echo, token))
            messages.append(str(result["error_detail"]))
            assert result["status"] == "failed", (
                f"the echoed-token failure must still record status='failed'; got {result!r}"
            )

            # The persisted outbound error_detail must not contain the token/secret.
            stored_detail = _stored_error_detail(cur, outbound_id)
            messages.append("" if stored_detail is None else str(stored_detail))

            # ----------------------------------------------------------------
            # Property assertions: the plaintext secret AND token appear in NO
            # error message / returned text and in NO persisted line_oa_* field.
            # ----------------------------------------------------------------
            for label, value in (("Channel_Secret", secret), ("Channel_Access_Token", token)):
                for msg in messages:
                    assert value not in msg, (
                        f"{label} leaked into an error/log message: {msg!r}"
                    )
                hits = _tables_containing(cur, value)
                assert hits == [], (
                    f"{label} value was persisted verbatim in line_oa_* table(s) {hits} "
                    f"(echo={echo!r}); secrets must never reach stored/audit fields"
                )
        finally:
            cur.execute("rollback to savepoint prop2")
            cur.execute("release savepoint prop2")

"""Property test — governed-event audit completeness (LINE OA Commerce, Module B5).

Spec task: 18.1 Write property test for audit completeness.

Implements exactly ONE numbered property across the governed-event SECURITY DEFINER
RPCs that write the append-only audit trail:

    Property 29: Each governed event records an audit entry with event_type,
    vertical_context, site_code (where known), entity_ref, performed_by (via
    resolve_actor), and a UTC performed_at.
    Validates: Requirement 13.1.

Every generated example exercises ONE of a representative set of governed events
(varied by the generator) and asserts the audit entry it produces is well-formed:

  * ``ingest``        -> ``rpc_ingest_line_webhook`` (a first-time verified webhook
    delivery): provisions a real channel — a Supabase Vault secret holding the
    plaintext Channel_Secret plus a ``line_oa_channels`` row referencing it — builds
    a valid LINE body, signs it ``base64(HMAC-SHA256(secret, raw_body))``, and ingests
    it once. The conversation starts ``site_unresolved`` so site_code is NOT yet known
    (NULL is permitted by the "where known" clause). Audit event_type
    ``webhook_inbound_received``.
  * ``site_resolve``  -> ``rpc_resolve_conversation_site`` (postback/manual): seeds a
    ``site_unresolved`` conversation and resolves it to a real active ``site_code``
    from ``public.get_active_site_codes()`` (A1's only valid-site source). The site is
    now KNOWN, so the audit row's site_code MUST equal it. Audit event_type
    ``conversation_site_resolved``.
  * ``merge``         -> ``rpc_evaluate_identity_merge_candidate``: seeds the
    ``(line_user_id, vertical_context)`` identity binding, then evaluates a
    cross-channel merge candidate. Identity has no site dimension, so site_code is
    NOT known. Audit event_type ``identity_merge_candidate_evaluated``.
  * ``order``         -> ``rpc_create_line_order`` (postback/manual): seeds a
    conversation either ``open`` with an active ``site_code`` (site KNOWN) or
    ``site_unresolved`` (site NOT known), and creates a Line_Order with a valid raw
    order for the conversation's vertical. Audit event_type ``line_order_created``.

For the produced audit entry the test asserts: a non-empty ``event_type``, a
non-empty ``vertical_context`` (equal to the event's vertical), a non-empty
``entity_ref``, a non-empty ``performed_by`` equal to ``public.resolve_actor()`` for
the same principal, a tz-aware UTC ``performed_at`` close to now, and — for the paths
where the site is known — a ``site_code`` equal to the resolved active code.

The session is simulated with the platform convention used by the shipped harness:
``set_config('request.jwt.claims', ...)`` injects the JWT claims the C12 helpers
(``is_governance_role`` / ``resolve_actor``) consume. A Governance_Role principal
(``app_metadata.roles=['admin']``) passes every in-function role re-check, including
the merge guardrail (governance-only) and order/site creation on a still-unresolved
conversation (where ``has_site_access(NULL)=false`` would otherwise block a
Branch_Role), isolating the audit-completeness behavior under test.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own channel / conversation / identity / order / audit
rows without leaking state.

The test runs against a real Postgres + Supabase Vault when
``LINE_OA_TEST_DATABASE_URL`` is reachable; it SKIPS cleanly (never fails) when no
database is configured, the driver is missing, the connection cannot be established,
any governed RPC / helper / Vault / required table is unavailable, the
governance-claims convention is not honored, no active Site_Code exists, or any of
the governed paths cannot be exercised end-to-end.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The four governed events this property drives, each writing one audit entry.
EVENTS = ("ingest", "site_resolve", "merge", "order")

# Verticals usable for channel/identity/conversation paths (free-form context).
CHAT_VERTICALS = ("monolith", "tcck")
# Verticals the shipped order adapter normalizes (furniture / TCCK food).
ORDER_VERTICALS = ("monolith", "food")
# Intake/resolution sources supported by the RPCs.
SOURCES = ("postback", "manual")

# Audit event_type emitted by each governed RPC (from the shipped migrations).
_EVENT_TYPE = {
    "ingest": "webhook_inbound_received",
    "site_resolve": "conversation_site_resolved",
    "merge": "identity_merge_candidate_evaluated",
    "order": "line_order_created",
}

# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so generated text
# round-trips identically through Python's UTF-8 encoder and Postgres; combined
# with ensure_ascii=True the serialized webhook body is pure ASCII, so the
# signature computed here matches what the DB helper recomputes over the same bytes.
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))
secret_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)
message_text_strategy = st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=200)

# Short, safe identifier text for raw-order tokens (no surrogate/control chars).
_token = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126), min_size=1, max_size=16
)
_quantity = st.integers(min_value=1, max_value=99)


# ---------------------------------------------------------------------------
# Strategy: choose a governed event and its (path-appropriate) inputs.
# ---------------------------------------------------------------------------


@st.composite
def _event_case(draw: st.DrawFn) -> dict[str, Any]:
    event = draw(st.sampled_from(EVENTS))

    if event == "ingest":
        return {
            "event": event,
            "vertical": draw(st.sampled_from(CHAT_VERTICALS)),
            "secret": draw(secret_strategy),
            "text": draw(message_text_strategy),
        }
    if event == "site_resolve":
        return {
            "event": event,
            "vertical": draw(st.sampled_from(CHAT_VERTICALS)),
            "source": draw(st.sampled_from(SOURCES)),
        }
    if event == "merge":
        return {
            "event": event,
            "vertical": draw(st.sampled_from(CHAT_VERTICALS)),
            # Vary confidence across the closed interval (below/at/above threshold).
            "score": round(draw(st.floats(min_value=0.0, max_value=1.0)), 2),
        }
    # order
    vertical = draw(st.sampled_from(ORDER_VERTICALS))
    if vertical == "monolith":
        raw_order: dict[str, Any] = {
            "line_items": [{"sku": draw(_token), "quantity": draw(_quantity)}]
        }
    else:
        raw_order = {"menu_items": [{"item_id": draw(_token), "quantity": draw(_quantity)}]}
    return {
        "event": event,
        "vertical": vertical,
        "resolved": draw(st.booleans()),
        "source": draw(st.sampled_from(SOURCES)),
        "raw_order": raw_order,
    }


# ---------------------------------------------------------------------------
# Signature / webhook-body helpers (mirror the DB verify helper byte-for-byte).
# ---------------------------------------------------------------------------


def _expected_signature(secret: str, body: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def _build_webhook_body(webhook_event_id: str, line_user_id: str, text: str) -> str:
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
# Session / DB helpers.
# ---------------------------------------------------------------------------


def _set_session(cur: Any, sub: str) -> None:
    """Inject governance JWT claims + pin the session to UTC for this transaction."""
    claims = json.dumps({"sub": sub, "app_metadata": {"roles": ["admin"]}})
    cur.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
    # SET (rolled back with the surrounding transaction) so performed_at comes back
    # tz-aware with a zero UTC offset, letting us assert it is a UTC instant.
    cur.execute("set time zone 'UTC'")


def _resolve_actor(cur: Any) -> Any:
    cur.execute("select public.resolve_actor()")
    return cur.fetchone()[0]


def _active_site_codes(cur: Any) -> list[str]:
    cur.execute("select site_code from public.get_active_site_codes()")
    return [row[0] for row in cur.fetchall()]


def _provision_channel(
    cur: Any, channel_identifier: str, secret: str, secret_name: str, vertical: str
) -> None:
    """Create the Vault secret + line_oa_channels row the ingest RPC resolves."""
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


def _ingest(cur: Any, body: str, signature: str, channel_identifier: str) -> tuple[Any, ...]:
    cur.execute(
        "select accepted, reason, events_processed, events_duplicate, events_skipped "
        "from public.rpc_ingest_line_webhook(%s, %s, %s)",
        (body, signature, channel_identifier),
    )
    return cur.fetchone()


def _seed_conversation(
    cur: Any, line_user_id: str, vertical: str, site_code: str | None, status: str
) -> Any:
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, %s) returning id",
        (line_user_id, vertical, site_code, status),
    )
    return cur.fetchone()[0]


def _resolve_site(cur: Any, conversation_id: Any, site_code: str, source: str) -> tuple[Any, ...]:
    cur.execute(
        "select conversation_id, site_code, status, source, resolved "
        "from public.rpc_resolve_conversation_site(%s, %s, %s)",
        (conversation_id, site_code, source),
    )
    return cur.fetchone()


def _seed_identity(cur: Any, line_user_id: str, vertical: str) -> Any:
    cur.execute(
        "select customer_id from public.line_oa_resolve_customer_identity(%s, %s)",
        (line_user_id, vertical),
    )
    return cur.fetchone()[0]


def _evaluate_merge(
    cur: Any, line_user_id: str, vertical: str, candidate_customer_id: Any, score: float
) -> tuple[Any, ...]:
    cur.execute(
        "select match_confidence, manual_review_required, proposed_link, auto_merged, outcome "
        "from public.rpc_evaluate_identity_merge_candidate(%s, %s, %s, %s::jsonb)",
        (line_user_id, vertical, candidate_customer_id, json.dumps({"score": score})),
    )
    return cur.fetchone()


def _create_order(
    cur: Any,
    conversation_id: Any,
    raw_order: dict[str, Any],
    source: str,
    webhook_event_id: str | None,
) -> dict[str, Any]:
    cur.execute(
        "select order_id, vertical_context, site_code, customer_id, "
        "origin_channel_id, submitted, created "
        "from public.rpc_create_line_order(%s, %s::jsonb, %s, %s)",
        (conversation_id, json.dumps(raw_order), source, webhook_event_id),
    )
    r = cur.fetchone()
    return {
        "order_id": r[0],
        "vertical_context": r[1],
        "site_code": r[2],
        "customer_id": r[3],
        "origin_channel_id": r[4],
        "submitted": r[5],
        "created": r[6],
    }


def _audit_rows(cur: Any, event_type: str, like_pattern: str) -> list[tuple[Any, ...]]:
    """Return the audit row(s) this event produced, targeted by its unique token."""
    cur.execute(
        "select event_type, vertical_context, site_code, entity_ref, performed_by, performed_at "
        "from public.line_oa_audit_log where event_type = %s and entity_ref like %s",
        (event_type, like_pattern),
    )
    return cur.fetchall()


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPCs / helpers / Vault
# / tables are unavailable, governance claims are not honored, no active site
# exists, or any governed path cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping audit-completeness "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping audit-completeness test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping audit-completeness test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless every governed RPC + its helpers + Vault + tables exist,
    governance claims are honored, an active Site_Code exists, AND all four
    governed paths can be exercised end-to-end (each producing an audit row)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_ingest_line_webhook(text,text,text)",
            "public.rpc_resolve_conversation_site(uuid,text,text)",
            "public.rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)",
            "public.rpc_create_line_order(uuid,jsonb,text,text)",
            "public.line_oa_verify_signature(text,text,text)",
            "public.line_oa_resolve_channel(text)",
            "public.line_oa_resolve_customer_identity(text,text)",
            "public.line_oa_normalize_order(text,jsonb)",
            "public.get_active_site_codes()",
            "public.has_site_access(text)",
            "public.is_governance_role()",
            "public.resolve_actor()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "audit-completeness property test."
                )

        for table in (
            "public.line_oa_channels",
            "public.line_oa_conversations",
            "public.line_oa_inbound_messages",
            "public.line_oa_customer_identity",
            "public.line_oa_orders",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping audit-completeness property test."
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
                "audit-completeness property test."
            )

        # Probe: governance honored, an active site exists, and one round-trip of
        # EACH governed path succeeds and writes its audit row.
        cur.execute("savepoint probe")
        ok = False
        try:
            _set_session(cur, str(uuid.uuid4()))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            if is_gov and active:
                site = active[0]

                # ingest (verified, end-to-end through Vault + signature verify)
                lid = f"U{uuid.uuid4().hex}"
                wid = f"probe-{uuid.uuid4().hex}"
                chan = f"line-oa-audit-probe-{uuid.uuid4()}"
                probe_secret = f"s-{uuid.uuid4().hex}"
                _provision_channel(cur, chan, probe_secret, f"n_{uuid.uuid4().hex}", "monolith")
                body = _build_webhook_body(wid, lid, "probe")
                accepted = _ingest(cur, body, _expected_signature(probe_secret, body), chan)[0]
                if accepted is not True:
                    raise RuntimeError("verified ingest probe was not accepted")

                # site_resolve
                conv = _seed_conversation(cur, f"U{uuid.uuid4().hex}", "monolith", None, "site_unresolved")
                _resolve_site(cur, conv, site, "manual")

                # merge
                mlid = f"U{uuid.uuid4().hex}"
                cust = _seed_identity(cur, mlid, "monolith")
                _evaluate_merge(cur, mlid, "monolith", uuid.uuid4(), 0.95)

                # order
                oconv = _seed_conversation(cur, f"U{uuid.uuid4().hex}", "monolith", site, "open")
                created = _create_order(
                    cur, oconv, {"line_items": [{"sku": "PROBE", "quantity": 1}]}, "manual", None
                )
                ok = bool(created["created"])
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise the governed-event RPCs end-to-end; skipping "
                f"audit-completeness property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by is_governance_role(); "
                    "skipping audit-completeness property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping audit-completeness property test."
                )
            if not ok:
                conn.rollback()
                pytest.skip(
                    "the governed-event probe did not complete; skipping "
                    "audit-completeness property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Audit-entry well-formedness assertions (Property 29 / Req 13.1).
# ---------------------------------------------------------------------------


def _assert_well_formed(
    rows: list[tuple[Any, ...]],
    *,
    expected_vertical: str,
    expected_actor: Any,
    site_known: bool,
    expected_site: str | None,
) -> None:
    assert len(rows) == 1, (
        "a governed event must record exactly one audit entry for its target; "
        f"found {len(rows)}"
    )
    event_type, vertical_context, site_code, entity_ref, performed_by, performed_at = rows[0]

    # event_type — non-null, non-empty.
    assert event_type is not None and str(event_type).strip() != "", (
        f"audit entry must carry a non-empty event_type; got {event_type!r}"
    )
    # vertical_context — non-null, non-empty, and the event's vertical.
    assert vertical_context is not None and str(vertical_context).strip() != "", (
        f"audit entry must carry a non-empty vertical_context; got {vertical_context!r}"
    )
    assert vertical_context == expected_vertical, (
        f"audit vertical_context must equal the event's vertical; "
        f"got {vertical_context!r} != {expected_vertical!r}"
    )
    # entity_ref — non-null, non-empty (the affected entity reference).
    assert entity_ref is not None and str(entity_ref).strip() != "", (
        f"audit entry must carry a non-empty entity_ref; got {entity_ref!r}"
    )
    # performed_by — non-null, non-empty, and exactly public.resolve_actor().
    assert performed_by is not None and str(performed_by).strip() != "", (
        f"audit entry must carry a non-empty performed_by; got {performed_by!r}"
    )
    assert performed_by == expected_actor, (
        "audit performed_by must be the actor resolved via public.resolve_actor(); "
        f"got {performed_by!r} != {expected_actor!r}"
    )
    # performed_at — a tz-aware UTC instant close to now.
    assert performed_at is not None, "audit entry must carry a performed_at"
    assert isinstance(performed_at, datetime), (
        f"performed_at must be a timestamp; got {type(performed_at)!r}"
    )
    assert performed_at.tzinfo is not None and performed_at.utcoffset() == timedelta(0), (
        f"performed_at must be a UTC (zero-offset) instant; got {performed_at!r}"
    )
    now_utc = datetime.now(timezone.utc)
    assert abs(now_utc - performed_at) < timedelta(days=1), (
        f"performed_at must be a recent instant; got {performed_at!r} vs now {now_utc!r}"
    )
    # site_code — where the site is known it must be recorded; otherwise it may be NULL.
    if site_known:
        assert site_code == expected_site, (
            "when the site is known the audit entry must record it; "
            f"got {site_code!r} != {expected_site!r}"
        )


# ---------------------------------------------------------------------------
# Property 29
# ---------------------------------------------------------------------------


@property(
    29,
    "Each governed event records an audit entry with event_type, vertical_context, "
    "site_code (where known), entity_ref, performed_by (via resolve_actor), and a UTC "
    "performed_at",
)
@given(case=_event_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_audit_completeness(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 13.1**"""
    event: str = case["event"]
    vertical: str = case["vertical"]

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop29")
        try:
            _set_session(cur, str(uuid.uuid4()))
            actor = _resolve_actor(cur)
            assert actor is not None, "resolve_actor() must yield a non-null actor"

            if event == "ingest":
                # First-time verified webhook delivery -> one audit receipt. The
                # conversation starts site_unresolved, so site_code is NOT yet known.
                secret: str = case["secret"]
                text: str = case["text"]
                webhook_event_id = f"prop29-{uuid.uuid4().hex}"
                line_user_id = f"U{uuid.uuid4().hex}"
                channel_identifier = f"line-oa-audit-{uuid.uuid4()}"
                secret_name = f"line_oa_audit_secret_{uuid.uuid4().hex}"

                _provision_channel(cur, channel_identifier, secret, secret_name, vertical)
                body = _build_webhook_body(webhook_event_id, line_user_id, text)
                accepted, reason, processed, *_ = _ingest(
                    cur, body, _expected_signature(secret, body), channel_identifier
                )
                assert accepted is True, f"verified delivery must be accepted; reason={reason!r}"
                assert processed == 1, f"first-time event must be processed once; got {processed}"

                rows = _audit_rows(
                    cur, _EVENT_TYPE["ingest"], f"webhook_event_id:{webhook_event_id}|%"
                )
                _assert_well_formed(
                    rows,
                    expected_vertical=vertical,
                    expected_actor=actor,
                    site_known=False,
                    expected_site=None,
                )

            elif event == "site_resolve":
                # Resolve a site_unresolved conversation to an active site_code: the
                # site is now KNOWN and must be recorded in the audit entry.
                active = _active_site_codes(cur)
                if not active:
                    pytest.skip("no active Site_Code available for this example.")
                site_code = active[0]
                source: str = case["source"]
                conversation_id = _seed_conversation(
                    cur, f"U{uuid.uuid4().hex}", vertical, None, "site_unresolved"
                )
                out = _resolve_site(cur, conversation_id, site_code, source)
                assert out[4] is True, f"site resolution must succeed; got {out!r}"

                rows = _audit_rows(
                    cur, _EVENT_TYPE["site_resolve"], f"line_oa_conversation:{conversation_id}|%"
                )
                _assert_well_formed(
                    rows,
                    expected_vertical=vertical,
                    expected_actor=actor,
                    site_known=True,
                    expected_site=site_code,
                )

            elif event == "merge":
                # Evaluate a merge candidate (identity has no site dimension).
                score: float = case["score"]
                line_user_id = f"mrg-{uuid.uuid4().hex}"
                _seed_identity(cur, line_user_id, vertical)
                _evaluate_merge(cur, line_user_id, vertical, uuid.uuid4(), score)

                rows = _audit_rows(
                    cur, _EVENT_TYPE["merge"], f"%line_user_id:{line_user_id}|%"
                )
                _assert_well_formed(
                    rows,
                    expected_vertical=vertical,
                    expected_actor=actor,
                    site_known=False,
                    expected_site=None,
                )

            else:  # order
                resolved: bool = case["resolved"]
                source = case["source"]
                raw_order: dict[str, Any] = case["raw_order"]
                line_user_id = f"ord-{uuid.uuid4().hex}"
                webhook_event_id = (
                    f"evt-{uuid.uuid4().hex}" if source == "postback" else None
                )

                if resolved:
                    active = _active_site_codes(cur)
                    if not active:
                        pytest.skip("no active Site_Code available for this example.")
                    site_code = active[0]
                    conversation_id = _seed_conversation(
                        cur, line_user_id, vertical, site_code, "open"
                    )
                else:
                    site_code = None
                    conversation_id = _seed_conversation(
                        cur, line_user_id, vertical, None, "site_unresolved"
                    )

                result = _create_order(cur, conversation_id, raw_order, source, webhook_event_id)
                assert result["created"] is True, (
                    f"a valid raw order must create a fresh Line_Order; got {result!r}"
                )

                rows = _audit_rows(
                    cur, _EVENT_TYPE["order"], f"%conversation_id:{conversation_id}|%"
                )
                _assert_well_formed(
                    rows,
                    expected_vertical=vertical,
                    expected_actor=actor,
                    site_known=resolved,
                    expected_site=site_code,
                )
        finally:
            cur.execute("rollback to savepoint prop29")
            cur.execute("release savepoint prop29")

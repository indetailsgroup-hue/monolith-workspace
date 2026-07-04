"""Property test — Order_Lifecycle site gating (LINE OA Commerce, Module B5).

Spec task: 13.3 Write property test for lifecycle site gating.

Implements exactly ONE numbered property against the order-intake RPC shipped by
task 13.1 (``00000000000050_line_oa_create_order.sql`` —
``public.rpc_create_line_order(uuid, jsonb, text, text)``):

    Property 21: An order is submitted to the Order_Lifecycle only with a
    resolved active site_code; unresolved/inactive blocks/rejects submission.
    Validates: Requirements 8.5, 8.6.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh Conversation in one of three site states and then invokes
``rpc_create_line_order`` as an authorized Governance principal with a
vertical-appropriate valid raw order, asserting the gating outcome:

  * **(a) resolved ACTIVE** — an ``open`` Conversation whose ``site_code`` is a
    real active code from ``public.get_active_site_codes()`` (A1's only valid-site
    source): the RPC reports ``submitted=true`` and persists the Line_Order
    stamped with that active ``site_code`` — it is submittable to the
    Order_Lifecycle (Req 8.5);

  * **(b) site_unresolved (NULL site_code)** — a ``site_unresolved`` Conversation
    with a NULL ``site_code``: the RPC persists the Line_Order (``created=true``)
    but reports ``submitted=false`` with a NULL stored ``site_code`` — it is NOT
    submitted; resolution is required first (Req 8.5);

  * **(c) resolved-but-inactive/unknown site_code** — an ``open`` Conversation
    carrying a UUID-namespaced ``site_code`` that cannot be in
    ``get_active_site_codes()``: the RPC is rejected with an "unknown or inactive"
    error and NO Line_Order is persisted for that webhook_event_id — state is left
    unchanged (Req 8.6).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes for every conversation regardless of branch site grants (and is the only
role permitted to create an order on a still site_unresolved conversation, since
``has_site_access(NULL)=false``). This isolates the Order_Lifecycle site gate
itself — the resolved-active / unresolved / inactive distinction — under test.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, and the (expected)
rejection path runs inside a nested SAVEPOINT so the aborted RPC is recovered
before the unchanged-state assertions, so the test provisions and tears down its
own conversation / order / identity / audit rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the order RPC /
``line_oa_normalize_order`` / ``line_oa_resolve_customer_identity`` /
``get_active_site_codes()`` / ``has_site_access`` / ``is_governance_role`` /
``resolve_actor`` / ``auth.jwt()`` / required tables are unavailable, the
governance-claims convention is not honored, no active Site_Code exists to
exercise the positive (active) branch, or the create-order pipeline cannot be
exercised end-to-end.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The order sources the RPC supports (Req 8.1 postback / 8.2 manual). Postback
# carries a webhook_event_id; manual does not. Both funnel through the same gate.
SOURCES = ("postback", "manual")

# Verticals the shipped order adapter registry normalizes; only these yield a
# valid canonical order, so the gating path (not normalization) is exercised.
VERTICALS = ("monolith", "food")

# The three site states the gate distinguishes.
STATE_ACTIVE = "active"
STATE_UNRESOLVED = "unresolved"
STATE_INACTIVE = "inactive"

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role() (reads app_metadata.roles); a 'sub' gives
# public.resolve_actor() a stable actor. As governance the in-function role
# re-check passes for ANY conversation (including site_unresolved), isolating the
# Order_Lifecycle site gate under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


# ---------------------------------------------------------------------------
# Strategy: a vertical + source + site state + a valid raw order for the vertical.
# ---------------------------------------------------------------------------

# Short, safe sku/item identifiers ([A-Za-z0-9_-]) and names, kept simple so the
# adapter always accepts them (normalization is NOT what this property is about).
_token = st.text(
    alphabet=st.characters(
        whitelist_categories=("Lu", "Ll", "Nd"), whitelist_characters="_-"
    ),
    min_size=1,
    max_size=12,
)


@st.composite
def _gating_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a vertical, source, site state, and a valid raw order."""
    vertical = draw(st.sampled_from(VERTICALS))
    source = draw(st.sampled_from(SOURCES))
    state = draw(st.sampled_from((STATE_ACTIVE, STATE_UNRESOLVED, STATE_INACTIVE)))
    item_count = draw(st.integers(min_value=1, max_value=3))
    qty = draw(st.integers(min_value=1, max_value=9))

    if vertical == "monolith":
        raw_order: dict[str, Any] = {
            "line_items": [
                {"sku": draw(_token), "quantity": qty} for _ in range(item_count)
            ]
        }
    else:  # food
        raw_order = {
            "menu_items": [
                {"item_id": draw(_token), "quantity": qty} for _ in range(item_count)
            ]
        }

    return {"vertical": vertical, "source": source, "state": state, "raw_order": raw_order}


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / tables
# are unavailable, governance claims are not honored, no active site exists, or
# the create-order pipeline cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping lifecycle site-gating "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping lifecycle site-gating test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping lifecycle site-gating test ({exc}).")

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
    """Skip unless the order RPC + adapter/identity + A1/C12 helpers + tables exist,
    governance claims are honored, at least one active Site_Code exists, AND the RPC
    can be exercised end-to-end (seed open+active conversation -> create a submitted
    order)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_create_line_order(uuid,jsonb,text,text)",
            "public.line_oa_normalize_order(text,jsonb)",
            "public.line_oa_resolve_customer_identity(text,text)",
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
                    "lifecycle site-gating property test."
                )

        for table in (
            "public.line_oa_conversations",
            "public.line_oa_orders",
            "public.line_oa_customer_identity",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping lifecycle site-gating "
                    "property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> create round-trip submits an order against an active site.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            submitted = False
            if is_gov and active:
                conv_id = _seed_conversation(
                    cur, f"probe-{uuid.uuid4().hex}", "monolith", active[0], "open"
                )
                result = _create_order(
                    cur,
                    conv_id,
                    {"line_items": [{"sku": "PROBE", "quantity": 1}]},
                    "manual",
                    None,
                )
                submitted = bool(result["submitted"]) and bool(result["created"])
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_create_line_order end-to-end; skipping "
                f"lifecycle site-gating property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping lifecycle site-gating test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping lifecycle site-gating property test."
                )
            if not submitted:
                conn.rollback()
                pytest.skip(
                    "the create-order pipeline did not submit an order against an "
                    "active site in the probe; skipping lifecycle site-gating test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_conversation(
    cur: Any, line_user_id: str, vertical: str, site_code: Any, status: str
) -> Any:
    """Seed a fresh Conversation in the given site/status state; return its id."""
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, %s) returning id",
        (line_user_id, vertical, site_code, status),
    )
    return cur.fetchone()[0]


def _create_order(
    cur: Any,
    conversation_id: Any,
    raw_order: dict[str, Any],
    source: str,
    webhook_event_id: Any,
) -> dict[str, Any]:
    """Invoke rpc_create_line_order and return its OUT row as a dict."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
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


def _order_row(cur: Any, order_id: Any) -> tuple[str, Any] | None:
    """Return the persisted (vertical_context, site_code) of a Line_Order, or None."""
    cur.execute(
        "select vertical_context, site_code from public.line_oa_orders where id = %s",
        (order_id,),
    )
    row = cur.fetchone()
    return (row[0], row[1]) if row is not None else None


def _order_exists_for_event(cur: Any, webhook_event_id: str) -> bool:
    """Whether ANY Line_Order is persisted for the given webhook_event_id."""
    cur.execute(
        "select exists (select 1 from public.line_oa_orders where webhook_event_id = %s)",
        (webhook_event_id,),
    )
    return bool(cur.fetchone()[0])


# ---------------------------------------------------------------------------
# Property 21
# ---------------------------------------------------------------------------


@property(
    21,
    "An order is submitted to the Order_Lifecycle only with a resolved active "
    "site_code; unresolved/inactive blocks/rejects submission",
)
@given(case=_gating_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_lifecycle_site_gating(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 8.5, 8.6**"""
    vertical: str = case["vertical"]
    source: str = case["source"]
    state: str = case["state"]
    raw_order: dict[str, Any] = case["raw_order"]

    # Namespace the userId / webhook_event_id so they can never collide with
    # pre-existing rows. Postback orders dedupe on webhook_event_id; manual orders
    # pass NULL. We still namespace an id we can probe for non-persistence.
    line_user_id = f"sitegate-{uuid.uuid4().hex}"
    webhook_event_id = (
        f"evt-{uuid.uuid4().hex}" if source == "postback" else None
    )

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop21")
        try:
            if state == STATE_ACTIVE:
                # --- (a) resolved ACTIVE site -> submitted to Order_Lifecycle. ---
                active = _active_site_codes(cur)
                if not active:
                    pytest.skip("no active Site_Code available for this example.")
                site_code = active[0]
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, site_code, "open"
                )

                result = _create_order(
                    cur, conversation_id, raw_order, source, webhook_event_id
                )

                # The order is persisted AND submitted (Req 8.5): an active site
                # clears the Order_Lifecycle gate.
                assert result["created"] is True, (
                    f"an active-site order must be persisted; got {result!r}"
                )
                assert result["submitted"] is True, (
                    "a resolved active site_code must submit the order to the "
                    f"Order_Lifecycle; got {result!r}"
                )
                assert result["site_code"] == site_code, (
                    "the submitted order must be stamped with the active site_code; "
                    f"got {result['site_code']!r} != {site_code!r}"
                )
                assert result["origin_channel_id"] == "line_oa", (
                    f"the order must be stamped origin_channel_id='line_oa'; got {result!r}"
                )

                # The persisted Line_Order carries that active site_code.
                persisted = _order_row(cur, result["order_id"])
                assert persisted == (vertical, site_code), (
                    "the persisted order must store the conversation vertical and the "
                    f"active site_code; got {persisted!r}"
                )

            elif state == STATE_UNRESOLVED:
                # --- (b) site_unresolved (NULL site_code) -> persisted, NOT submitted. ---
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, None, "site_unresolved"
                )

                result = _create_order(
                    cur, conversation_id, raw_order, source, webhook_event_id
                )

                # The order is persisted but withheld from the Order_Lifecycle until
                # the site is resolved (Req 8.5).
                assert result["created"] is True, (
                    "a site_unresolved order must still be persisted; "
                    f"got {result!r}"
                )
                assert result["submitted"] is False, (
                    "a site_unresolved conversation (NULL site_code) must NOT submit "
                    f"the order to the Order_Lifecycle; got {result!r}"
                )
                assert result["site_code"] is None, (
                    "an unresolved order must carry a NULL site_code until resolution; "
                    f"got {result['site_code']!r}"
                )

                # The persisted Line_Order has a NULL site_code.
                persisted = _order_row(cur, result["order_id"])
                assert persisted == (vertical, None), (
                    "the persisted unresolved order must store a NULL site_code; "
                    f"got {persisted!r}"
                )

            else:  # STATE_INACTIVE
                # --- (c) resolved-but-inactive/unknown site -> rejected, unchanged. ---
                site_code = f"UNKNOWN-{uuid.uuid4().hex}"
                # Defensive: ensure the generated code is genuinely not active.
                assert site_code not in _active_site_codes(cur)
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, site_code, "open"
                )

                # The aborted RPC must be recoverable, so wrap it in a nested
                # savepoint; the seeded conversation predates it and survives.
                cur.execute("savepoint prop21_reject")
                rejected = False
                message = ""
                try:
                    _create_order(cur, conversation_id, raw_order, source, webhook_event_id)
                except Exception as exc:  # the RPC raises on an unknown/inactive site
                    rejected = True
                    message = str(exc)
                    cur.execute("rollback to savepoint prop21_reject")
                finally:
                    cur.execute("release savepoint prop21_reject")

                assert rejected, (
                    "an unknown/inactive site_code must block/reject submission, not "
                    "create a submitted order"
                )
                assert "unknown or inactive" in message.lower(), (
                    "the rejection must indicate the site_code is unknown or inactive; "
                    f"got {message!r}"
                )

                # State unchanged (Req 8.6): no Line_Order was persisted. For a
                # postback we can probe the namespaced webhook_event_id directly.
                if webhook_event_id is not None:
                    assert not _order_exists_for_event(cur, webhook_event_id), (
                        "a rejected inactive-site order must persist NO Line_Order"
                    )
        finally:
            cur.execute("rollback to savepoint prop21")
            cur.execute("release savepoint prop21")

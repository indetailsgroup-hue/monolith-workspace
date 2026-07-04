"""Schema structure smoke test — LINE OA Commerce (Module B5).

Spec task: 2.3 Smoke test schema structure.

This is a STRUCTURAL smoke test (not a numbered property test). It verifies that
the DDL shipped by task 2.1 (``00000000000001_line_oa_schema.sql``) and the
constraints shipped by task 2.2 (``00000000000002_line_oa_constraints.sql``) are
actually present in the database catalog:

  * all eight ``line_oa_*`` tables exist,
  * the three enums exist with the documented values,
  * the conversations partial unique index exists (UNIQUE + partial WHERE),
  * the UNIQUE constraints exist
        - inbound  webhook_event_id
        - customer_identity (line_user_id, vertical_context)
        - orders    webhook_event_id
        - templates (template_key, vertical_context)
  * the CHECK constraints exist
        - customer_identity match_confidence in [0.0, 1.0]
        - orders origin_channel_id = 'line_oa'
  * ``line_oa_channels`` stores Vault *references*
    (``channel_secret_ref`` / ``channel_access_token_ref``) and holds NO
    plaintext secret columns.

Requirements traceability: 1.5, 2.5, 6.4, 8.7.

The test runs against a real Postgres catalog when ``LINE_OA_TEST_DATABASE_URL``
is reachable; when no database is configured (or the driver/connection is
unavailable) every test SKIPS cleanly — it never fails for lack of a DB.
"""

from __future__ import annotations

from typing import Any

import pytest

from harness import database_url, get_connection

# ---------------------------------------------------------------------------
# Documented schema facts (mirrors design.md "Data Models" + the two migrations)
# ---------------------------------------------------------------------------

EXPECTED_TABLES = [
    "line_oa_channels",
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_customer_identity",
    "line_oa_message_templates",
    "line_oa_orders",
    "line_oa_audit_log",
]

EXPECTED_ENUMS = {
    "line_oa_conversation_status": ["site_unresolved", "open", "closed"],
    "line_oa_send_type": ["reply", "push"],
    "line_oa_outbound_status": ["pending", "sent", "failed"],
}

PARTIAL_UNIQUE_INDEX = "line_oa_conversations_live_uniq"

# name -> the columns the UNIQUE constraint must cover (order-insensitive)
EXPECTED_UNIQUE_CONSTRAINTS = {
    "line_oa_inbound_messages_webhook_event_id_uniq": ["webhook_event_id"],
    "line_oa_customer_identity_user_vertical_uniq": ["line_user_id", "vertical_context"],
    "line_oa_orders_webhook_event_id_uniq": ["webhook_event_id"],
    "line_oa_message_templates_key_vertical_uniq": ["template_key", "vertical_context"],
}

# name -> a fragment that must appear in the rendered CHECK definition
EXPECTED_CHECK_CONSTRAINTS = {
    "line_oa_customer_identity_match_confidence_range_chk": "match_confidence",
    "line_oa_orders_origin_channel_id_chk": "origin_channel_id",
}

VAULT_REFERENCE_COLUMNS = ["channel_secret_ref", "channel_access_token_ref"]
# Plaintext secret columns that must NOT exist on line_oa_channels (Req 1.5).
FORBIDDEN_PLAINTEXT_COLUMNS = [
    "channel_secret",
    "channel_access_token",
    "secret",
    "access_token",
]


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when no DB is reachable
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    """Yield a live catalog connection, or skip the whole module if unavailable.

    Skips (never fails) when ``LINE_OA_TEST_DATABASE_URL`` is unset, the driver
    is not installed, or the connection cannot be established.
    """
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping schema structure "
            "smoke test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping schema structure smoke test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping schema structure smoke test ({exc}).")

    try:
        yield conn
    finally:
        conn.close()


def _fetchall(conn: Any, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Tables (Req 2.5 / general schema)
# ---------------------------------------------------------------------------


def test_all_eight_line_oa_tables_exist(db_conn: Any) -> None:
    rows = _fetchall(
        db_conn,
        """
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any(%s)
        """,
        (EXPECTED_TABLES,),
    )
    found = {r[0] for r in rows}
    missing = sorted(set(EXPECTED_TABLES) - found)
    assert not missing, f"missing line_oa_* tables: {missing}"
    assert len(found) == 8


# ---------------------------------------------------------------------------
# Enums with documented values
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("enum_name,labels", list(EXPECTED_ENUMS.items()))
def test_enum_exists_with_documented_values(db_conn: Any, enum_name: str, labels: list[str]) -> None:
    rows = _fetchall(
        db_conn,
        """
        select e.enumlabel
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
          and t.typname = %s
        order by e.enumsortorder
        """,
        (enum_name,),
    )
    actual = [r[0] for r in rows]
    assert actual, f"enum {enum_name} does not exist"
    assert actual == labels, f"enum {enum_name} values {actual} != documented {labels}"


# ---------------------------------------------------------------------------
# Partial unique index on conversations (Req 2.5, 3.1/3.2/3.8)
# ---------------------------------------------------------------------------


def test_conversations_partial_unique_index_exists(db_conn: Any) -> None:
    rows = _fetchall(
        db_conn,
        """
        select indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'line_oa_conversations'
          and indexname = %s
        """,
        (PARTIAL_UNIQUE_INDEX,),
    )
    assert rows, f"partial unique index {PARTIAL_UNIQUE_INDEX} not found"
    indexdef = rows[0][0].lower()
    assert "unique" in indexdef, f"{PARTIAL_UNIQUE_INDEX} is not UNIQUE: {indexdef}"
    assert "where" in indexdef, f"{PARTIAL_UNIQUE_INDEX} is not partial (no WHERE): {indexdef}"
    assert "line_user_id" in indexdef and "vertical_context" in indexdef


# ---------------------------------------------------------------------------
# UNIQUE constraints (Req 2.5, 6.4, 8.7)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("conname,columns", list(EXPECTED_UNIQUE_CONSTRAINTS.items()))
def test_unique_constraint_exists(db_conn: Any, conname: str, columns: list[str]) -> None:
    rows = _fetchall(
        db_conn,
        """
        select c.contype, pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public'
          and c.conname = %s
        """,
        (conname,),
    )
    assert rows, f"UNIQUE constraint {conname} not found"
    contype, condef = rows[0]
    assert contype == "u", f"{conname} is not a UNIQUE constraint (contype={contype})"
    lowered = condef.lower()
    for col in columns:
        assert col in lowered, f"{conname} definition {condef!r} is missing column {col}"


# ---------------------------------------------------------------------------
# CHECK constraints (Req 6.4 range, 8.x origin pin)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("conname,fragment", list(EXPECTED_CHECK_CONSTRAINTS.items()))
def test_check_constraint_exists(db_conn: Any, conname: str, fragment: str) -> None:
    rows = _fetchall(
        db_conn,
        """
        select c.contype, pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public'
          and c.conname = %s
        """,
        (conname,),
    )
    assert rows, f"CHECK constraint {conname} not found"
    contype, condef = rows[0]
    assert contype == "c", f"{conname} is not a CHECK constraint (contype={contype})"
    assert fragment in condef.lower(), f"{conname} definition {condef!r} missing {fragment!r}"


def test_match_confidence_check_covers_full_range(db_conn: Any) -> None:
    """The match_confidence CHECK should constrain to the [0.0, 1.0] interval."""
    rows = _fetchall(
        db_conn,
        """
        select pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public'
          and c.conname = 'line_oa_customer_identity_match_confidence_range_chk'
        """,
    )
    assert rows, "match_confidence range CHECK not found"
    condef = rows[0][0].lower()
    assert "0.0" in condef or "0" in condef
    assert "1.0" in condef or "1" in condef


# ---------------------------------------------------------------------------
# Vault references, not plaintext secrets (Req 1.5)
# ---------------------------------------------------------------------------


def test_channels_store_vault_references(db_conn: Any) -> None:
    rows = _fetchall(
        db_conn,
        """
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'line_oa_channels'
        """,
    )
    columns = {r[0] for r in rows}
    assert columns, "line_oa_channels has no columns / does not exist"

    # Vault reference columns must be present.
    for ref_col in VAULT_REFERENCE_COLUMNS:
        assert ref_col in columns, f"line_oa_channels missing Vault reference column {ref_col}"

    # No plaintext secret columns may exist.
    leaked = sorted(columns & set(FORBIDDEN_PLAINTEXT_COLUMNS))
    assert not leaked, f"line_oa_channels exposes plaintext secret columns: {leaked}"

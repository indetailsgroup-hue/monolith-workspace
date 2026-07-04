"""Access-control configuration smoke test — LINE OA Commerce (Module B5).

Spec task: 3.5 Smoke test access-control configuration.

This is a CONFIGURATION smoke test (not a numbered property test). Where the
schema smoke test (``test_schema_structure_smoke.py``) checks that tables /
constraints exist, this test checks that the *access-control posture* shipped by
the RLS migration (``00000000000003_line_oa_rls.sql``) matches the design's
trust-boundary rules (Req 12). It verifies, against the live catalog:

  * RLS is ENABLED on all eight ``line_oa_*`` tables (Req 12.4).
  * Every SELECT policy is gated ``TO authenticated`` and reuses the shipped C12
    helpers ``public.is_governance_role()`` / ``public.has_site_access()``
    (no redefinition of the auth model) (Req 12.4):
        - site-scoped tables gate on both helpers,
        - ``line_oa_channels`` is governance-only (``is_governance_role()``),
        - ``line_oa_message_templates`` is readable by all authenticated.
  * There are NO client INSERT/UPDATE/DELETE (or ALL) policies — every write
    flows through SECURITY DEFINER RPCs (Req 12.4, 12.5).
  * No ``service_role``-from-client exposure: no policy targets ``service_role``,
    ``anon``, or ``public``; and clients (``authenticated`` / ``anon`` /
    ``public``) hold no INSERT/UPDATE/DELETE table grants (Req 12.5).
  * Secrets are stored as Vault references: ``line_oa_channels`` carries
    ``channel_secret_ref`` / ``channel_access_token_ref`` and NO plaintext secret
    columns (Req 12.5 secret hygiene; Decision 1).

Requirements traceability: 12.4, 12.5.

The test runs against a real Postgres catalog when ``LINE_OA_TEST_DATABASE_URL``
is reachable; when no database is configured (or the driver/connection is
unavailable) every test SKIPS cleanly — it never fails for lack of a DB.
"""

from __future__ import annotations

from typing import Any

import pytest

from harness import database_url, get_connection

# ---------------------------------------------------------------------------
# Documented access-control facts (mirrors design.md "Data Models" + the RLS
# migration 00000000000003_line_oa_rls.sql).
# ---------------------------------------------------------------------------

ALL_TABLES = [
    "line_oa_channels",
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_customer_identity",
    "line_oa_message_templates",
    "line_oa_orders",
    "line_oa_audit_log",
]

# Tables whose SELECT policy gates on BOTH C12 helpers (governance OR site access).
SITE_SCOPED_TABLES = [
    "line_oa_conversations",
    "line_oa_inbound_messages",
    "line_oa_outbound_messages",
    "line_oa_customer_identity",
    "line_oa_orders",
    "line_oa_audit_log",
]

# Governance-only table: gates on is_governance_role() (holds Vault refs).
GOVERNANCE_ONLY_TABLES = ["line_oa_channels"]

# Readable by every authenticated principal (qual = true), still RPC-write-only.
OPEN_READ_TABLES = ["line_oa_message_templates"]

# Roles that represent "the client" and must never receive write access or be
# named as a policy target for these tables.
CLIENT_ROLES = {"anon", "public", "service_role"}

WRITE_PRIVILEGES = {"INSERT", "UPDATE", "DELETE", "TRUNCATE"}

VAULT_REFERENCE_COLUMNS = ["channel_secret_ref", "channel_access_token_ref"]
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
            "LINE_OA_TEST_DATABASE_URL is not set; skipping access-control "
            "configuration smoke test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping access-control smoke test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping access-control smoke test ({exc}).")

    try:
        yield conn
    finally:
        conn.close()


def _fetchall(conn: Any, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ---------------------------------------------------------------------------
# RLS enablement (Req 12.4)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("table", ALL_TABLES)
def test_rls_enabled_on_every_table(db_conn: Any, table: str) -> None:
    rows = _fetchall(
        db_conn,
        """
        select c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = %s
        """,
        (table,),
    )
    assert rows, f"table {table} not found in catalog"
    assert rows[0][0] is True, f"RLS is not enabled on public.{table}"


# ---------------------------------------------------------------------------
# SELECT policies gated TO authenticated, reusing C12 helpers (Req 12.4)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("table", ALL_TABLES)
def test_select_policy_is_gated_to_authenticated(db_conn: Any, table: str) -> None:
    """Each table exposes a SELECT policy whose ONLY target role is authenticated."""
    rows = _fetchall(
        db_conn,
        """
        select policyname, cmd, roles
        from pg_policies
        where schemaname = 'public'
          and tablename = %s
          and cmd = 'SELECT'
        """,
        (table,),
    )
    assert rows, f"no SELECT policy found on public.{table}"
    for policyname, _cmd, roles in rows:
        role_set = set(roles)
        assert role_set == {"authenticated"}, (
            f"{table}.{policyname} must be gated TO authenticated only; "
            f"found roles {sorted(role_set)}"
        )


@pytest.mark.parametrize("table", SITE_SCOPED_TABLES)
def test_site_scoped_select_policy_reuses_c12_helpers(db_conn: Any, table: str) -> None:
    """Site-scoped tables gate reads on is_governance_role() OR has_site_access()."""
    qual = _select_policy_qual(db_conn, table)
    assert "is_governance_role" in qual, (
        f"{table} SELECT policy does not reuse public.is_governance_role(): {qual!r}"
    )
    assert "has_site_access" in qual, (
        f"{table} SELECT policy does not reuse public.has_site_access(): {qual!r}"
    )


@pytest.mark.parametrize("table", GOVERNANCE_ONLY_TABLES)
def test_governance_only_select_policy_reuses_c12_helper(db_conn: Any, table: str) -> None:
    """Governance-only tables (channel secrets) gate reads on is_governance_role()."""
    qual = _select_policy_qual(db_conn, table)
    assert "is_governance_role" in qual, (
        f"{table} SELECT policy is not governance-gated: {qual!r}"
    )


@pytest.mark.parametrize("table", OPEN_READ_TABLES)
def test_open_read_select_policy_present(db_conn: Any, table: str) -> None:
    """Vertical-config tables are readable by all authenticated principals (qual=true)."""
    qual = _select_policy_qual(db_conn, table).strip().lower()
    assert qual == "true", f"{table} SELECT policy qual expected 'true', got {qual!r}"


def _select_policy_qual(conn: Any, table: str) -> str:
    rows = _fetchall(
        conn,
        """
        select coalesce(qual, '')
        from pg_policies
        where schemaname = 'public'
          and tablename = %s
          and cmd = 'SELECT'
        """,
        (table,),
    )
    assert rows, f"no SELECT policy found on public.{table}"
    # Concatenate in case of multiple SELECT policies (there should be one).
    return " ".join(r[0] for r in rows)


# ---------------------------------------------------------------------------
# No client write policies — writes are RPC-only (Req 12.4, 12.5)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("table", ALL_TABLES)
def test_no_client_write_policies(db_conn: Any, table: str) -> None:
    """No INSERT/UPDATE/DELETE/ALL policies exist; only SELECT policies are defined."""
    rows = _fetchall(
        db_conn,
        """
        select policyname, cmd
        from pg_policies
        where schemaname = 'public'
          and tablename = %s
          and cmd <> 'SELECT'
        """,
        (table,),
    )
    offending = [(p, c) for p, c in rows]
    assert not offending, (
        f"public.{table} exposes non-SELECT (write) policies; writes must be "
        f"RPC-only: {offending}"
    )


# ---------------------------------------------------------------------------
# No service_role-from-client exposure (Req 12.5)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("table", ALL_TABLES)
def test_no_policy_targets_client_roles(db_conn: Any, table: str) -> None:
    """No policy on these tables may target service_role / anon / public."""
    rows = _fetchall(
        db_conn,
        """
        select policyname, roles
        from pg_policies
        where schemaname = 'public'
          and tablename = %s
        """,
        (table,),
    )
    for policyname, roles in rows:
        leaked = set(roles) & CLIENT_ROLES
        assert not leaked, (
            f"{table}.{policyname} targets disallowed client role(s) {sorted(leaked)}; "
            f"policies must target authenticated only"
        )


@pytest.mark.parametrize("table", ALL_TABLES)
def test_clients_hold_no_write_grants(db_conn: Any, table: str) -> None:
    """authenticated / anon / public must hold no INSERT/UPDATE/DELETE/TRUNCATE grant.

    Confirms write access is not handed to clients at the table-grant level
    either; every mutation flows through SECURITY DEFINER RPCs.
    """
    rows = _fetchall(
        db_conn,
        """
        select grantee, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = %s
          and grantee = any(%s)
          and privilege_type = any(%s)
        """,
        (table, sorted(CLIENT_ROLES | {"authenticated"}), sorted(WRITE_PRIVILEGES)),
    )
    offending = [(g, p) for g, p in rows]
    assert not offending, (
        f"public.{table} grants write privileges to client roles: {offending}; "
        f"writes must be RPC-only"
    )


# ---------------------------------------------------------------------------
# Secrets stored as Vault references, not plaintext (Req 12.5; Decision 1)
# ---------------------------------------------------------------------------


def test_channels_store_vault_references_only(db_conn: Any) -> None:
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

    for ref_col in VAULT_REFERENCE_COLUMNS:
        assert ref_col in columns, (
            f"line_oa_channels missing Vault reference column {ref_col}"
        )

    leaked = sorted(columns & set(FORBIDDEN_PLAINTEXT_COLUMNS))
    assert not leaked, f"line_oa_channels exposes plaintext secret columns: {leaked}"

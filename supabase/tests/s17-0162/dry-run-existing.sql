\set ON_ERROR_STOP on
\pset pager off
\echo 'S17 0162 dry-run: existing pre-0162 schema mode'

begin;
\ir preflight-existing.sql
\ir ../../migrations/0162_factory_server_identity_released_only.sql
\ir assertions.sql
rollback;

\echo 'S17_0162_DRY_RUN_PASS mode=existing-pre0162 transaction=rolled_back'

\set ON_ERROR_STOP on
\pset pager off
\echo 'S17 0162 dry-run: disposable bootstrap mode'

begin;
\ir bootstrap-pre0162.sql
\ir ../../migrations/0155_factory_state_server.sql
\ir ../../migrations/0156_factory_unfreeze.sql
\ir ../../migrations/0157_factory_jobs_list.sql
\ir ../../migrations/0161_factory_packet_store.sql
\ir preflight-existing.sql
\ir ../../migrations/0162_factory_server_identity_released_only.sql
\ir assertions.sql
rollback;

\echo 'S17_0162_DRY_RUN_PASS mode=bootstrap transaction=rolled_back'

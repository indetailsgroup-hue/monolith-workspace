\set ON_ERROR_STOP on
begin;
\i 'C:/Users/thai3/determined-williams (2)/MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust/supabase/migrations/0193_line_outbound_claim_and_record.sql'
\i 'C:/Users/thai3/determined-williams (2)/MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust/supabase/migrations/0194_line_outbound_retry_and_claim_fencing.sql'
\i 'C:/Users/thai3/determined-williams (2)/MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust/supabase/migrations/0195_line_outbound_timezone_safe_backoff.sql'
\i 'C:/Users/thai3/determined-williams (2)/MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust/supabase/migrations/0196_line_outbound_timezone_safe_sent_at.sql'
\i 'C:/Users/thai3/determined-williams (2)/MONOLITH Repair Intelligence/.worktrees/repair-intelligence-phase0-trust/supabase/tests/line_outbound_claim_record.sql'
-- the suite ends with its own ROLLBACK; nothing is committed

set -o pipefail
mkdir -p tap
for suite in line_outbound_claim_record line_oa_client_write_revoke line_oa_client_write_revoke_fail_closed; do
  if [[ "$suite" == "line_outbound_claim_record" || "$suite" == "line_oa_client_write_revoke" \
        || "$suite" == "line_oa_client_write_revoke_fail_closed" ]]; then
    # These suites own only ROLLBACK; open their transaction in the same
    # psql session so fixtures, audit rows, throwaway roles and grants
    # can never autocommit. The fail-closed suite re-runs 0198 via \ir.
    psql "postgresql://postgres@127.0.0.1:55447/postgres" -tA -v ON_ERROR_STOP=1 \
      -c "begin;" -f "supabase/tests/${suite}.sql" | tee "tap/${suite}.tap"
  else
    psql "postgresql://postgres@127.0.0.1:55447/postgres" -tA -v ON_ERROR_STOP=1 \
      -f "supabase/tests/${suite}.sql" | tee "tap/${suite}.tap"
  fi
  if grep -qE '^not ok' "tap/${suite}.tap"; then
    echo "::error::pgTAP failure in ${suite}.sql"; exit 1
  fi
  if ! grep -qE '^ok ' "tap/${suite}.tap"; then
    echo "::error::no pgTAP assertions ran in ${suite}.sql (empty suite)"; exit 1
  fi
  echo "${suite}: all ok ($(grep -cE '^ok ' "tap/${suite}.tap") assertions)"
done

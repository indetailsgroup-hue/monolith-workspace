#!/usr/bin/env bash

# Build a deterministic, fresh-database migration set for CI.
#
# The repository contains an historical 20260828 bootstrap migration whose
# first three sections must run before 0172, while its remaining sections must
# run after 0172.  Older workflows split that file by hard-coded line numbers,
# which broke as soon as the table definition moved.  This script splits on the
# stable SQL section marker instead and is shared by every fresh-DB workflow.

set -euo pipefail
export LC_ALL=C

mode="${1:---bootstrap-only}"
migration_dir="${2:-supabase/migrations}"

case "$mode" in
  --bootstrap-only|--merge-duplicates) ;;
  *)
    echo "usage: $0 [--bootstrap-only|--merge-duplicates] [migration-dir]" >&2
    exit 2
    ;;
esac

if [[ ! -d "$migration_dir" ]]; then
  echo "[prepare-migrations] migration directory not found: $migration_dir" >&2
  exit 1
fi

migration_dir="$(cd "$migration_dir" && pwd)"
bootstrap="$migration_dir/20260828_multi_tenant_schema.sql"
target="$migration_dir/0172_jobs_quotations_invoices.sql"
legacy_stub="$migration_dir/00000000000063_organizations_org_members_stub.sql"
risk_tier_base="$migration_dir/0195_etax_risk_tier_notify.sql"
risk_tier_pgnet_patch="$migration_dir/01952_b_etax_risk_tier_notify_pgnet.sql"
risk_tier_merge_marker='CI canonical dependency-order merge: 01952_b_etax_risk_tier_notify_pgnet.sql'
section_marker='^-- 4\. ADD org_id TO EXISTING TABLES$'

invalid_filenames=""
for file in "$migration_dir"/*.sql; do
  filename="$(basename "$file")"
  version="${filename%%_*}"
  if [[ ! "$version" =~ ^[0-9]+$ ]]; then
    invalid_filenames+="${filename}"$'\n'
  fi
done

if [[ -n "$invalid_filenames" ]]; then
  echo "[prepare-migrations] invalid migration filenames; expected <numeric-version>_<name>.sql:" >&2
  printf '%s' "$invalid_filenames" >&2
  exit 1
fi

if [[ ! -f "$target" ]]; then
  echo "[prepare-migrations] canonical 0172 migration not found: $target" >&2
  exit 1
fi

if [[ -f "$bootstrap" ]]; then
  marker_count="$(grep -Ec "$section_marker" "$bootstrap" || true)"
  if [[ "$marker_count" != "1" ]]; then
    echo "[prepare-migrations] expected exactly one section-4 marker in $bootstrap; found $marker_count" >&2
    exit 1
  fi

  pre_file="$(mktemp "$migration_dir/.mts-pre.XXXXXX")"
  post_file="$(mktemp "$migration_dir/.mts-post.XXXXXX")"
  merged_file="$(mktemp "$migration_dir/.0172-merged.XXXXXX")"
  cleanup() {
    rm -f "$pre_file" "$post_file" "$merged_file"
  }
  trap cleanup EXIT

  awk -v marker="$section_marker" -v pre="$pre_file" -v post="$post_file" '
    $0 ~ marker { destination = post }
    { print > (destination == post ? post : pre) }
  ' "$bootstrap"

  if ! grep -q 'CREATE TABLE IF NOT EXISTS public.org_invitations' "$pre_file"; then
    echo "[prepare-migrations] bootstrap preamble did not contain org_invitations" >&2
    exit 1
  fi
  if ! grep -q 'ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS org_id' "$post_file"; then
    echo "[prepare-migrations] bootstrap postamble did not contain jobs org_id migration" >&2
    exit 1
  fi

  {
    echo '-- ============================================================'
    echo '-- CI canonical bootstrap: 20260828_multi_tenant_schema sections 1-3'
    echo '-- ============================================================'
    cat "$pre_file"
    echo
    echo '-- ============================================================'
    echo '-- Original: 0172_jobs_quotations_invoices.sql'
    echo '-- ============================================================'
    cat "$target"
    echo
    echo '-- ============================================================'
    echo '-- CI canonical bootstrap: 20260828_multi_tenant_schema sections 4+'
    echo '-- ============================================================'
    cat "$post_file"
  } > "$merged_file"

  mv "$merged_file" "$target"
  rm "$bootstrap"

  # The legacy stub has a deliberately incomplete org_members shape. If it is
  # left ahead of the canonical bootstrap, CREATE TABLE IF NOT EXISTS prevents
  # the real member_id/joined_at/unique constraints from ever being created.
  # 0172 now contains the complete organization schema before any 0173 policy,
  # so the stub must not participate in a fresh-database CI run.
  rm -f "$legacy_stub"

  for filename in \
    20260828_audit_log_usage_metering.sql \
    20260828_notifications_super_admin.sql \
    20260828_platform_fts.sql \
    20260828_platform_search.sql \
    20260828_search_bookmarks_autocomplete.sql; do
    source_file="$migration_dir/$filename"
    if [[ ! -f "$source_file" ]]; then
      echo "[prepare-migrations] required bootstrap migration missing: $source_file" >&2
      exit 1
    fi
    {
      echo
      echo '-- ============================================================'
      echo "-- CI canonical bootstrap: $filename"
      echo '-- ============================================================'
      cat "$source_file"
    } >> "$target"
    rm "$source_file"
  done

  echo "[prepare-migrations] normalized 20260828 bootstrap into $(basename "$target")"
else
  echo "[prepare-migrations] 20260828 bootstrap already normalized; skipping"
  if grep -q 'CREATE TABLE IF NOT EXISTS public.org_members' "$target"; then
    rm -f "$legacy_stub"
  fi
fi

# 01952 was intended as an "0195b" patch and explicitly depends on 0195, but
# Supabase reads migration filenames lexicographically.  A longer numeric
# prefix beginning with 0195 sorts before "0195_" (digits sort before the
# underscore), so the standalone patch can never run after its prerequisite.
# Fold it into the end of 0195 in the rendered bundle and retain an explicit
# provenance marker.  Both versions are still preserved in the source tree.
if [[ -f "$risk_tier_pgnet_patch" ]]; then
  if [[ ! -f "$risk_tier_base" ]]; then
    echo "[prepare-migrations] 01952 dependency target missing: $risk_tier_base" >&2
    exit 1
  fi
  if grep -Fq "$risk_tier_merge_marker" "$risk_tier_base"; then
    echo "[prepare-migrations] 01952 dependency patch already merged; removing duplicate source"
  else
    {
      echo
      echo '-- ============================================================'
      echo "-- $risk_tier_merge_marker"
      echo '-- Must remain after 0195 because the patch depends on its objects.'
      echo '-- ============================================================'
      cat "$risk_tier_pgnet_patch"
    } >> "$risk_tier_base"
    echo "[prepare-migrations] merged 01952 dependency patch after $(basename "$risk_tier_base")"
  fi
  rm "$risk_tier_pgnet_patch"
elif [[ -f "$risk_tier_base" ]] \
  && grep -Fq "$risk_tier_merge_marker" "$risk_tier_base"; then
  echo "[prepare-migrations] 01952 dependency patch already normalized; skipping"
fi

if [[ "$mode" == "--merge-duplicates" ]]; then
  cd "$migration_dir"
  duplicate_prefixes="$({
    for file in *.sql; do
      prefix="${file%%_*}"
      [[ "$prefix" =~ ^[0-9]+$ ]] && printf '%s\n' "$prefix"
    done
  } | sort | uniq -d)"

  if [[ -n "$duplicate_prefixes" ]]; then
    while IFS= read -r prefix; do
      files=( "${prefix}_"*.sql )
      target_file="${files[0]}"
      echo "[prepare-migrations] prefix $prefix -> $target_file"
      for source_file in "${files[@]:1}"; do
        {
          echo
          echo '-- ============================================================'
          echo "-- CI duplicate-version merge: $source_file"
          echo '-- ============================================================'
          cat "$source_file"
        } >> "$target_file"
        rm "$source_file"
        echo "[prepare-migrations]   appended $source_file"
      done
    done <<< "$duplicate_prefixes"
  fi

  remaining_duplicates="$({
    for file in *.sql; do
      prefix="${file%%_*}"
      [[ "$prefix" =~ ^[0-9]+$ ]] && printf '%s\n' "$prefix"
    done
  } | sort | uniq -d)"
  if [[ -n "$remaining_duplicates" ]]; then
    echo "[prepare-migrations] duplicate numeric versions remain:" >&2
    echo "$remaining_duplicates" >&2
    exit 1
  fi
  echo "[prepare-migrations] duplicate numeric migration versions: 0"
fi

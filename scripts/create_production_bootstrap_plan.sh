#!/usr/bin/env bash

# Render the repository's historical migrations into the exact deterministic
# order used for a clean Supabase database. This script only writes to the
# caller-provided output directory; it never connects to a database.

set -euo pipefail
export LC_ALL=C

if [[ $# -ne 1 ]]; then
  echo "usage: $0 OUTPUT_DIR" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
output_dir="$1"

if [[ -e "$output_dir" ]]; then
  echo "[bootstrap-plan] output already exists: $output_dir" >&2
  exit 1
fi

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staged_supabase="$output_dir/supabase"
staged_migrations="$staged_supabase/migrations"

cp -R "$project_root/supabase" "$staged_supabase"

input_count="$(find "$staged_migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
input_duplicate_versions="$({
  for file in "$staged_migrations"/*.sql; do
    filename="$(basename "$file")"
    version="${filename%%_*}"
    [[ "$version" =~ ^[0-9]+$ ]] && printf '%s\n' "$version"
  done
} | sort | uniq -d | wc -l | tr -d ' ')"

duplicate_map="$output_dir/duplicate-version-map.tsv"
printf 'version\tsource_file_count\tsource_files\n' > "$duplicate_map"
duplicate_versions="$({
  for file in "$staged_migrations"/*.sql; do
    filename="$(basename "$file")"
    version="${filename%%_*}"
    [[ "$version" =~ ^[0-9]+$ ]] && printf '%s\n' "$version"
  done
} | sort | uniq -d)"

if [[ -n "$duplicate_versions" ]]; then
  while IFS= read -r version; do
    files=( "$staged_migrations/${version}_"*.sql )
    joined=""
    for file in "${files[@]}"; do
      filename="$(basename "$file")"
      joined="${joined:+$joined,}$filename"
    done
    printf '%s\t%s\t%s\n' "$version" "${#files[@]}" "$joined" \
      >> "$duplicate_map"
  done <<< "$duplicate_versions"
fi

semantic_map="$output_dir/semantic-version-map.tsv"
printf 'target_version\ttarget_file\tsource_version\tsource_file\treason\n' > "$semantic_map"
semantic_merge_count=0
if [[ -f "$staged_migrations/0195_etax_risk_tier_notify.sql" \
  && -f "$staged_migrations/01952_b_etax_risk_tier_notify_pgnet.sql" ]]; then
  printf '%s\t%s\t%s\t%s\t%s\n' \
    '0195' \
    '0195_etax_risk_tier_notify.sql' \
    '01952' \
    '01952_b_etax_risk_tier_notify_pgnet.sql' \
    '01952 explicitly depends on 0195 but sorts before 0195 under Supabase filename ordering' \
    >> "$semantic_map"
  semantic_merge_count=1
fi

bash "$project_root/scripts/prepare_supabase_migrations_ci.sh" \
  --merge-duplicates "$staged_migrations"

remaining_duplicates="$({
  for file in "$staged_migrations"/*.sql; do
    filename="$(basename "$file")"
    version="${filename%%_*}"
    [[ "$version" =~ ^[0-9]+$ ]] && printf '%s\n' "$version"
  done
} | sort | uniq -d)"

if [[ -n "$remaining_duplicates" ]]; then
  echo "[bootstrap-plan] duplicate versions remain after normalization:" >&2
  echo "$remaining_duplicates" >&2
  exit 1
fi

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_size() {
  if stat -c '%s' "$1" >/dev/null 2>&1; then
    stat -c '%s' "$1"
  else
    stat -f '%z' "$1"
  fi
}

manifest="$output_dir/migration-manifest.tsv"
printf 'order\tversion\tfile\tbytes\tsha256\n' > "$manifest"

order=0
total_bytes=0
ordered_files="$({
  for file in "$staged_migrations"/*.sql; do
    filename="$(basename "$file")"
    printf '%s\t%s\n' "$filename" "$file"
  done
} | sort -t $'\t' -k1,1)"

while IFS=$'\t' read -r filename file; do
  order=$((order + 1))
  version="${filename%%_*}"
  bytes="$(file_size "$file")"
  digest="$(sha256_file "$file")"
  total_bytes=$((total_bytes + bytes))
  printf '%s\t%s\t%s\t%s\t%s\n' \
    "$order" "$version" "$filename" "$bytes" "$digest" >> "$manifest"
done <<< "$ordered_files"

# fs.ReadDir, used by the pinned Supabase CLI, returns entries sorted by
# filename.  Assert that the manifest preserves that exact execution order so
# reconciliation never applies a migration in an order the CLI would not use.
expected_order="$output_dir/.expected-filename-order"
manifest_order="$output_dir/.manifest-filename-order"
find "$staged_migrations" -maxdepth 1 -type f -name '*.sql' \
  -exec basename {} \; | sort > "$expected_order"
tail -n +2 "$manifest" | cut -f3 > "$manifest_order"
if ! diff -u "$expected_order" "$manifest_order"; then
  echo "[bootstrap-plan] manifest order differs from Supabase filename order" >&2
  exit 1
fi
rm "$expected_order" "$manifest_order"

commit="unknown"
if command -v git >/dev/null 2>&1; then
  commit="$(git -C "$project_root" rev-parse HEAD 2>/dev/null || echo unknown)"
fi

manifest_sha256="$(sha256_file "$manifest")"
cat > "$output_dir/plan-summary.json" <<JSON
{
  "formatVersion": 1,
  "sourceCommit": "$commit",
  "inputMigrationFiles": $input_count,
  "inputDuplicateVersions": $input_duplicate_versions,
  "semanticVersionMerges": $semantic_merge_count,
  "renderedMigrationFiles": $order,
  "renderedDuplicateVersions": 0,
  "renderedSqlBytes": $total_bytes,
  "manifestSha256": "$manifest_sha256",
  "normalizationPolicy": "semantic-bootstrap-split-dependency-order-merge-and-duplicate-version-merge",
  "executionOrderPolicy": "supabase-filename-lexicographic",
  "productionWritesPerformed": false
}
JSON

echo "[bootstrap-plan] rendered $order migration files ($total_bytes bytes)"
echo "[bootstrap-plan] manifest sha256: $manifest_sha256"
echo "[bootstrap-plan] output: $output_dir"

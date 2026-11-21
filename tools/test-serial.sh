#!/usr/bin/env bash
# Keep one fresh per-file test runner within the enclosing memory guard.
set -euo pipefail
cd "$(dirname "$0")/.."
export STRICT=1
report_dir=${TEST_REPORT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/viewer-strict.XXXXXX")}
test_flags=(--test --test-reporter=tap --test-concurrency=1)
export VIEWER_TEST_ISOLATION=process
if node --test-isolation=none --version >/dev/null 2>&1; then
  test_flags+=(--test-isolation=none)
  export VIEWER_TEST_ISOLATION=none
fi
printf 'strict runner: %s, per-file isolation=%s\n' "$(node --version)" "$VIEWER_TEST_ISOLATION" >&2
node tools/strict-reports.mjs init "$report_dir"
while IFS= read -r -d '' test_file; do
  report="$report_dir/${test_file##*/}.tap"
  set +e
  node "${test_flags[@]}" "$test_file" > "$report" 2>&1
  result=$?
  set -e
  node tools/strict-reports.mjs case "$report_dir" "$test_file" "$report" "$result"
done < "$report_dir/files.nul"
node tools/strict-reports.mjs finish "$report_dir"

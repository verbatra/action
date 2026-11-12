#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

fixture_dir="$fixtures_dir/sensitive-source"
annotations="$work_dir/annotations.txt"
step_summary="$work_dir/step-summary.md"

if [ -n "${VERBATRA_CLI:-}" ]; then
  cli=(node "$VERBATRA_CLI")
else
  npm install --no-save --silent --prefix "$work_dir/cli" "@verbatra/cli@${VERBATRA_VERSION:-0.12.0}"
  cli=("$work_dir/cli/node_modules/.bin/verbatra")
fi

status=0
"${cli[@]}" check --sensitive --json --cwd "$fixture_dir" --config "$fixture_dir/.verbatrarc.json" \
  >"$work_dir/summary.json" 2>"$work_dir/error.txt" || status=$?

if [ "$status" -ne 1 ]; then
  fail "check --sensitive exited $status, expected 1"
fi

report_status=0
GITHUB_STEP_SUMMARY="$step_summary" \
  node "$repo_root/src/annotate.mjs" "$work_dir/summary.json" "$work_dir/error.txt" "$status" check >"$annotations" || report_status=$?

if [ "$report_status" -ne 1 ]; then
  fail "the report exited $report_status, expected 1"
fi

if ! grep -q '^::error title=verbatra sensitive::\[SENSITIVE_CONTENT\] contact holds' "$annotations"; then
  fail "no SENSITIVE_CONTENT annotation names the affected key"
fi

if ! grep -q 'Sensitive source keys:' "$step_summary"; then
  fail "the job summary has no sensitive source keys section"
fi

if grep -rq 'acme-corp' "$annotations" "$step_summary"; then
  fail "the matched text appears in the annotations or the job summary"
fi

if [ "$failures" -ne 0 ]; then
  cat "$annotations" "$step_summary"
fi

finish "check --sensitive findings become an annotation and a summary section without the matched text"

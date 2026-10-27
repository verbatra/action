#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

fixture_dir="$repo_root/.github/fixtures/sensitive-source"

if [ -n "${VERBATRA_CLI:-}" ]; then
  cli=(node "$VERBATRA_CLI")
else
  npm install --no-save --silent --prefix "$work_dir/cli" "@verbatra/cli@${VERBATRA_VERSION:-0.12.0}"
  cli=("$work_dir/cli/node_modules/.bin/verbatra")
fi

status=0
"${cli[@]}" check --sensitive --json --cwd "$fixture_dir" --config "$fixture_dir/.verbatrarc.json" \
  >"$work_dir/summary.json" 2>"$work_dir/error.txt" || status=$?

failures=0

if [ "$status" -ne 1 ]; then
  echo "FAIL: check --sensitive exited $status, expected 1"
  failures=1
fi

annotations="$work_dir/annotations.txt"
report_status=0
GITHUB_STEP_SUMMARY="$work_dir/step-summary.md" \
  node "$repo_root/annotate.mjs" "$work_dir/summary.json" "$work_dir/error.txt" "$status" check >"$annotations" || report_status=$?

if [ "$report_status" -ne 1 ]; then
  echo "FAIL: the report exited $report_status, expected 1"
  failures=1
fi

if ! grep -q '^::error title=verbatra sensitive::\[SENSITIVE_CONTENT\] contact holds' "$annotations"; then
  echo "FAIL: no SENSITIVE_CONTENT annotation names the affected key"
  failures=1
fi

if ! grep -q 'Sensitive source keys:' "$work_dir/step-summary.md"; then
  echo "FAIL: the job summary has no sensitive source keys section"
  failures=1
fi

if grep -rq 'acme-corp' "$annotations" "$work_dir/step-summary.md"; then
  echo "FAIL: the matched text appears in the annotations or the job summary"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  cat "$annotations" "$work_dir/step-summary.md"
  exit 1
fi

echo "OK: check --sensitive findings become an annotation and a summary section without the matched text"

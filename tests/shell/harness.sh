#!/usr/bin/env bash

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixtures_dir="$repo_root/tests/fixtures"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
failures=0

fail() {
  echo "FAIL: $*"
  failures=1
}

fixture_path() {
  (cd "$fixtures_dir/$1" && pwd)
}

github_output_value() {
  grep "^$1=" "$2" | tail -1 | cut -d= -f2- || true
}

write_exec_capturing_npm_stub() {
  local stub_dir="$1"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/npm" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "install" ] && [ -n "${INSTALL_MARKER:-}" ]; then
  touch "$INSTALL_MARKER"
fi
if [ "$1" = "exec" ] && [ -n "${EXEC_CAPTURE:-}" ]; then
  shift
  printf '%s\n' "$@" >"$EXEC_CAPTURE"
fi
exit 0
STUB
  chmod +x "$stub_dir/npm"
}

captured_pair_present() {
  local flag="$1" value="$2" capture="$3" previous="" line
  while IFS= read -r line; do
    if [ "$previous" = "$flag" ] && [ "$line" = "$value" ]; then
      return 0
    fi
    previous="$line"
  done <"$capture"
  return 1
}

run_step() {
  local output="$1"
  shift
  env \
    VERBATRA_VERSION="0.9.3" \
    COMMAND="translate" \
    CONFIG_PATH="" \
    WORKING_DIRECTORY="" \
    DRY_RUN="false" \
    QA="false" \
    QA_SEVERITY="" \
    QA_STRICT="false" \
    REQUIRE_REVIEWED="false" \
    SENSITIVE="false" \
    LOCALES="" \
    GITHUB_ACTION_PATH="$repo_root" \
    SUMMARY_FILE="$work_dir/summary.json" \
    ERROR_FILE="$work_dir/error.txt" \
    LOCALE_FILES_FILE="$work_dir/locale-files.json" \
    GITHUB_OUTPUT="$work_dir/github-output.txt" \
    "$@" \
    bash "$repo_root/src/run.sh" >"$output" 2>&1
}

finish() {
  if [ "$failures" -ne 0 ]; then
    exit 1
  fi
  echo "OK: $*"
}

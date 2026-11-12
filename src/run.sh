#!/usr/bin/env bash
set -eo pipefail

if ! [[ "$VERBATRA_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
  echo "::error::the version input must be an exact semver version, e.g. 1.2.3 or 1.2.3-next.0. Dist-tags such as 'latest', ranges, and prefixes such as '^' or '~' are not allowed."
  exit 1
fi
version_below() {
  local core="${1%%-*}"
  local prerelease="${1#"$core"}"
  local major minor patch min_major min_minor min_patch
  IFS=. read -r major minor patch <<<"$core"
  IFS=. read -r min_major min_minor min_patch <<<"$2"
  if [ "$((10#$major))" -ne "$((10#$min_major))" ]; then
    [ "$((10#$major))" -lt "$((10#$min_major))" ]
    return
  fi
  if [ "$((10#$minor))" -ne "$((10#$min_minor))" ]; then
    [ "$((10#$minor))" -lt "$((10#$min_minor))" ]
    return
  fi
  if [ "$((10#$patch))" -ne "$((10#$min_patch))" ]; then
    [ "$((10#$patch))" -lt "$((10#$min_patch))" ]
    return
  fi
  [ -n "$prerelease" ]
}
minimum_version=0.9.3
if version_below "$VERBATRA_VERSION" "$minimum_version"; then
  echo "::error::the version input must be $minimum_version or newer. Earlier releases resolve a verbatra.config.ts import of defineConfig from '@verbatra/cli' or '@verbatra/sdk' against the config file's own location instead of against the running CLI, so a .ts config either fails to load or silently binds to a different, unpinned copy of those packages. Pin version to $minimum_version or newer."
  exit 1
fi
case "$COMMAND" in
  translate|check|diff) ;;
  *)
    echo "::error::the command input must be one of: translate, check, diff."
    exit 1
    ;;
esac
for boolean_input in "dry-run:$DRY_RUN" "qa:$QA" "qa-strict:$QA_STRICT" "require-reviewed:$REQUIRE_REVIEWED" "sensitive:$SENSITIVE"; do
  case "${boolean_input#*:}" in
    true|false) ;;
    *)
      echo "::error::the ${boolean_input%%:*} input must be \"true\" or \"false\"."
      exit 1
      ;;
  esac
done
if [ "$DRY_RUN" = "true" ] && [ "$COMMAND" != "translate" ]; then
  echo "::error::the dry-run input applies only to the translate command. The check and diff commands are already read-only and the CLI rejects --dry-run. Remove dry-run, or set command to translate."
  exit 1
fi
if [ "$QA" != "true" ] && { [ -n "$QA_SEVERITY" ] || [ "$QA_STRICT" = "true" ]; }; then
  echo "::error::the qa-severity and qa-strict inputs apply only to the quality check. Set qa to true, or remove them."
  exit 1
fi
if [ "$QA" = "true" ]; then
  if [ "$COMMAND" != "check" ]; then
    echo "::error::the qa input applies only to the check command. Set command to check, or remove qa."
    exit 1
  fi
  qa_minimum_version=0.12.0
  if version_below "$VERBATRA_VERSION" "$qa_minimum_version"; then
    echo "::error::the qa input needs version $qa_minimum_version or newer, because earlier releases of the CLI have no check --qa. Pin version to $qa_minimum_version or newer, or remove qa."
    exit 1
  fi
fi
if [ "$REQUIRE_REVIEWED" = "true" ]; then
  if [ "$COMMAND" != "check" ]; then
    echo "::error::the require-reviewed input applies only to the check command. Set command to check, or remove require-reviewed."
    exit 1
  fi
  review_minimum_version=0.12.0
  if version_below "$VERBATRA_VERSION" "$review_minimum_version"; then
    echo "::error::the require-reviewed input needs version $review_minimum_version or newer, because earlier releases of the CLI have no check --require-reviewed. Pin version to $review_minimum_version or newer, or remove require-reviewed."
    exit 1
  fi
fi
if [ "$SENSITIVE" = "true" ]; then
  if [ "$COMMAND" != "check" ]; then
    echo "::error::the sensitive input applies only to the check command. Set command to check, or remove sensitive."
    exit 1
  fi
  sensitive_minimum_version=0.12.0
  if version_below "$VERBATRA_VERSION" "$sensitive_minimum_version"; then
    echo "::error::the sensitive input needs version $sensitive_minimum_version or newer, because earlier releases of the CLI have no check --sensitive. Pin version to $sensitive_minimum_version or newer, or remove sensitive."
    exit 1
  fi
fi
if [ -n "$LOCALES" ] && ! [[ "$LOCALES" =~ ^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*$ ]]; then
  echo "::error::the locales input must be a comma-separated list of locale codes such as de,fr, with no spaces or other characters."
  exit 1
fi
node_actual="$(node -p 'process.versions.node')"
node_major="${node_actual%%.*}"
if version_below "${VERBATRA_VERSION%%-*}" 0.12.0; then
  node_floor_text="22.14.0 or newer"
  node_supported=false
  if [ "$node_major" -ge 23 ] || { [ "$node_major" -eq 22 ] && ! version_below "$node_actual" 22.14.0; }; then node_supported=true; fi
elif version_below "${VERBATRA_VERSION%%-*}" 0.13.0; then
  node_floor_text="22.18.0 or newer on the 22 line, or 24 or newer"
  node_supported=false
  if [ "$node_major" -ge 24 ] || { [ "$node_major" -eq 22 ] && ! version_below "$node_actual" 22.18.0; }; then node_supported=true; fi
else
  node_floor_text="22.22.0 or newer on the 22 line, or an even-numbered (LTS) release line from 24 up (for example 24 or 26); from CLI 0.13.0 the action accepts only LTS lines, which is stricter than the CLI engines range"
  node_supported=false
  if { [ "$node_major" -ge 24 ] && [ $((node_major % 2)) -eq 0 ]; } || { [ "$node_major" -eq 22 ] && ! version_below "$node_actual" 22.22.0; }; then node_supported=true; fi
fi
if [ "$node_supported" != "true" ]; then
  echo "::error::the node-version input resolved to Node.js $node_actual, but this version of the verbatra CLI needs Node.js $node_floor_text. Set node-version accordingly."
  exit 1
fi
echo "summary_file=$SUMMARY_FILE" >>"$GITHUB_OUTPUT"
echo "error_file=$ERROR_FILE" >>"$GITHUB_OUTPUT"
echo "command=$COMMAND" >>"$GITHUB_OUTPUT"
echo "locale_files_file=$LOCALE_FILES_FILE" >>"$GITHUB_OUTPUT"
: >"$LOCALE_FILES_FILE"
set +e
install_dir="$(cd "${WORKING_DIRECTORY:-.}" 2>/dev/null && pwd)"
if [ -z "$install_dir" ]; then
  echo "the working-directory input '$WORKING_DIRECTORY' does not exist" >"$ERROR_FILE"
  : >"$SUMMARY_FILE"
  echo "exit_code=1" >>"$GITHUB_OUTPUT"
  exit 0
fi
fail_before_install() {
  printf '%s\n' "$1" >"$ERROR_FILE"
  : >"$SUMMARY_FILE"
  echo "exit_code=1" >>"$GITHUB_OUTPUT"
  exit 0
}
if [ -n "$CONFIG_PATH" ]; then
  if [[ "$CONFIG_PATH" = /* ]]; then
    resolved_config="$CONFIG_PATH"
  else
    resolved_config="$install_dir/$CONFIG_PATH"
  fi
  if [ ! -f "$resolved_config" ]; then
    fail_before_install "the config-path input '$CONFIG_PATH' resolved to '$resolved_config', which does not exist. config-path and working-directory both control this resolution: a relative config-path resolves against working-directory."
  fi
else
  resolved_config="$(node "$GITHUB_ACTION_PATH/src/resolve-config.mjs" "$install_dir" 2>"$ERROR_FILE")"
  if [ $? -ne 0 ]; then
    fail_before_install "no recognized verbatra config file was found directly inside '$install_dir', which is resolved from the working-directory input. Add a config file there, or set config-path explicitly."
  fi
fi
scratch_dir="$(mktemp -d)"
npm install --no-save --silent --prefix "$scratch_dir" \
  "@verbatra/cli@$VERBATRA_VERSION" "@verbatra/sdk@$VERBATRA_VERSION" >"$ERROR_FILE" 2>&1
if [ $? -ne 0 ]; then
  : >"$SUMMARY_FILE"
  echo "exit_code=1" >>"$GITHUB_OUTPUT"
  exit 0
fi
args=("$COMMAND" --json --cwd "$install_dir" --config "$resolved_config")
if [ "$DRY_RUN" = "true" ]; then args+=(--dry-run); fi
if [ "$QA" = "true" ]; then args+=(--qa); fi
if [ -n "$QA_SEVERITY" ]; then args+=(--severity "$QA_SEVERITY"); fi
if [ "$QA_STRICT" = "true" ]; then args+=(--strict); fi
if [ "$REQUIRE_REVIEWED" = "true" ]; then args+=(--require-reviewed); fi
if [ "$SENSITIVE" = "true" ]; then args+=(--sensitive); fi
if [ -n "$LOCALES" ]; then args+=(--locales "$LOCALES"); fi
npm exec --no --prefix "$scratch_dir" -- verbatra "${args[@]}" >"$SUMMARY_FILE" 2>"$ERROR_FILE"
echo "exit_code=$?" >>"$GITHUB_OUTPUT"
node "$GITHUB_ACTION_PATH/src/locale-files.mjs" "$scratch_dir" "$install_dir" "$resolved_config" "$LOCALE_FILES_FILE" >/dev/null 2>&1
exit 0

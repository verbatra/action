# Changelog

All notable changes to the verbatra GitHub Action are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries are newest
first, and the `[Unreleased]` entry collects changes that are merged but not yet
tagged.

`v1` is the only maintained line: every fix and feature lands there, and the `v1`
tag moves to the newest release. Every v1 release has the same runner floor,
because the action has pinned `actions/setup-node` v7 since `v1.0.0` (currently
`actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1`, v7.1.0), and that
action runs on the `node24` runtime.

## [Unreleased]

Tightens the Node.js range to LTS lines for CLI 0.13.0 and newer, the release
where the CLI's `engines` range becomes `^22.22.0 || >=24`. From `version`
0.13.0 the action accepts only LTS lines (22.22.0 or newer on the 22 line, or an
even-numbered line from 24 up), which is stricter than the CLI's own `engines`
range: the step fails before installing the CLI when `node-version` resolves to
Node.js 22 below 22.22.0 or to an odd-numbered line such as 25. For `version`
0.12.x the range is unchanged: 22.18.0 or newer on the 22 line, or 24 or newer.
The fix is to upgrade the runner's Node.js: set `node-version` to `22.22.0` or
newer on the 22 line, `24`, or `26`.

## [1.3.0] - 2026-10-27

No breaking change. Adds the `qa`, `qa-severity`, and `qa-strict` inputs, which
run `verbatra check --qa` over every committed translation and turn each finding
into an annotation, the `require-reviewed` input, which runs
`verbatra check --require-reviewed` and fails the step while a machine-written
translation is not approved, and the `needs-human` output, which is `"true"` when
`translate` exits `3` in human-only mode. That exit passes the step instead of
failing it. It also adds the `sensitive` input, which runs
`verbatra check --sensitive`, and the `locales` input, which limits a run to a
comma-separated subset of target locales with `--locales`. The step now fails
before installing the CLI when `node-version` resolves to a Node.js outside the
pinned CLI's range (22.18.0 or newer on the 22 line, or 24 or newer for
0.12.0 and newer; 22.14.0 or newer before). `check` now also warns about plurals that lack a CLDR plural category
the target language uses, and a whole-run failure shows the CLI's `hint` as a
next step and names the code of a wrapped error. See
[Check translation quality](README.md#check-translation-quality),
[Require reviewed translations](README.md#require-reviewed-translations), and
[Human-only mode](README.md#human-only-mode).

Minimum runner: Actions Runner v2.327.1. Minimum `@verbatra/cli` for `qa`,
`require-reviewed`, `sensitive`, and exit `3`: 0.12.0; every other input still works from
0.9.3.

## [1.2.0] - 2026-08-19

**Breaking.** The action now requires a recognized verbatra config directly
inside the resolved `working-directory` and fails before installing anything when
there is none. The lookup never walks up into a parent or ancestor directory, so
a shared config at the repository root no longer satisfies a `working-directory`
that points at a subdirectory. The failure names the exact path it checked and
the input that controls it. Once a config is found, it is always passed to the
CLI explicitly with `--config`.

Also breaking: the `version` input is now rejected unless it is `0.9.3` or newer,
because earlier CLI releases resolve a `verbatra.config.ts` import of
`defineConfig` against the config file's own location instead of against the
running CLI, and the action no longer works around that.

This release also retired the `v2` prerelease and settled on the single `v1`
line described above.

Minimum runner: Actions Runner v2.327.1. Minimum `@verbatra/cli`: 0.9.3.

## [1.1.4] - 2026-08-18

No breaking change, and no input contract change. Fixes the action merging its
scratch install into the consumer's own `node_modules`, which could overwrite
dependency versions in the checked-out tree or crash on a name collision with one
of the CLI's transitive dependencies.

Its release notes recommend moving to a `v2` line. That prerelease has since been
retired; `v1` is the maintained line, and `v1.2.0` or newer is the upgrade.

Minimum runner: Actions Runner v2.327.1.

## [1.1.3] - 2026-08-18

No breaking change. `npm install --prefix` still parsed the consumer's existing
`package.json`, so a pnpm or Yarn workspace-protocol dependency string there
(`workspace:*`, pnpm's `catalog:`) crashed the install. The CLI now installs into
an isolated scratch directory, and npm never reads the consumer's manifest.

Minimum runner: Actions Runner v2.327.1.

## [1.1.2] - 2026-08-18

No breaking change. Installing through a bare `npx --yes` put the CLI in an
ephemeral cache that is never an ancestor of the config file on disk, so every
`verbatra.config.ts` importing `defineConfig` failed with `CONFIG_INVALID`. The
action now installs `@verbatra/cli` and `@verbatra/sdk` at the pinned version and
invokes the binary through `npm exec`, which also fixed a Windows-runner failure.

Minimum runner: Actions Runner v2.327.1.

## [1.1.1] - 2026-08-14

No breaking change, and no behavior change. `action.yml`'s description was
translation-only, which hid the read-only gate from the Marketplace listing.

Minimum runner: Actions Runner v2.327.1.

## [1.1.0] - 2026-08-14

No breaking change. Adds the `command` input, so the action can run the CLI's
read-only `check` and `diff` commands as well as `translate`. Both are read-only:
no provider call, no API key, no quota, so they gate a pull request from a fork.
`command` defaults to `translate`, so existing workflows are unaffected.
`dry-run` applies to `translate` only and is now rejected with the other two
rather than ignored.

Minimum runner: Actions Runner v2.327.1.

## [1.0.1] - 2026-08-14

Documentation only. No breaking change, no behavior change, and no input
contract change. The README and security policy carried at the release tag still
described the action as unpublished with no releases; this brought the tagged
tree in line with the default branch, which the Marketplace listing already
rendered from.

Minimum runner: Actions Runner v2.327.1.

## [1.0.0] - 2026-08-14

First published release and the initial Marketplace listing: `translate` in CI,
with annotations, a job summary, and the CLI's exit code propagated. Inputs:
`version`, `config-path`, `working-directory`, `dry-run`, `node-version`.

Minimum runner: Actions Runner v2.327.1.

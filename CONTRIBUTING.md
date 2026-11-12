# Contributing to the verbatra GitHub Action

Thanks for your interest in contributing. This repository holds the composite
GitHub Action that runs the verbatra CLI in CI. It is a small repository on
purpose: `action.yml`, one bash script and a few plain ESM scripts it calls,
their tests, and the workflows.

The translation engine itself lives in the
[main verbatra repository](https://github.com/verbatra/verbatra). Read
[its contributing guide](https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md)
for anything that touches the CLI, the SDK, a provider, or a format adapter.

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, follow
[SECURITY.md](SECURITY.md); please do not open a public issue for
vulnerabilities.

## Which repository does my change belong in

| Your change | Where it goes |
| --- | --- |
| Action inputs, the `action.yml` wiring, annotations, the job summary, the workflows here | This repository |
| Translation behavior, a format adapter, a provider, CLI flags, config keys | [verbatra/verbatra](https://github.com/verbatra/verbatra) |
| The documentation site at verbatra.kreitz-webdev.de | [verbatra/verbatra](https://github.com/verbatra/verbatra), under `apps/docs` |

The action installs `@verbatra/cli` from npm at run time, so an engine fix ships
by publishing a CLI release and bumping the `version` input, not by changing
anything here.

## Prerequisites

- Node.js `^22.22.0 || >=24` (the `engines` range; CI runs 22.22.0, 24 and 26)
- npm (this repository uses npm and a committed `package-lock.json`, unlike the
  main repository, which uses pnpm)

## Setup

```
npm ci
```

Use `npm ci` rather than `npm install` so the lockfile stays authoritative. CI
installs the same way.

## Repository layout

```
action.yml            the action metadata; stays at the root so `uses: verbatra/action@v1` resolves
src/                  everything the action runs on a consumer's runner, with no build step
  run.sh              the "Run verbatra" step: input guards, config lookup, CLI install and run
  resolve-config.mjs  finds the config file directly inside working-directory
  locale-files.mjs    maps each locale to its file for annotation file= links
  annotate.mjs        the "Annotate and summarize" step: reads the captured output, writes results
  report.mjs          pure logic behind annotate.mjs: annotations, job summary, exit status
scripts/              maintainer tooling, never run by the action
  generate-usage.mjs  regenerates the README input reference from action.yml
  usage-block.mjs     renders that reference
tests/                Vitest unit tests (*.test.mjs) for src/ and scripts/
  shell/              bash tests (*.test.sh) that run src/run.sh with stubbed npm and node
  fixtures/           small verbatra projects the shell tests and the CI self-test run against
```

The layout follows what established actions do. `action.yml`, the README, the
license and the changelog sit at the root. Code that runs for consumers lives in
one directory (`src/` here; `dist/` in JavaScript actions that compile), and
`action.yml` reaches it through `$GITHUB_ACTION_PATH`, never through a path
relative to the consumer's workspace. Maintainer tooling (`scripts/`) and tests
with their fixtures (`tests/`) are kept apart from it, so it is clear which
files a release ships to runners.

Shell logic longer than a few lines does not stay inline in `action.yml`. It
lives in `src/run.sh`, which `action.yml` calls as
`bash "$GITHUB_ACTION_PATH/src/run.sh"`, with every input passed through the
step's `env:` block rather than a `${{ }}` expression in the script. The script
sets `-eo pipefail` itself, matching the options GitHub uses for an inline
`shell: bash` step, and stays compatible with bash 3.2.

Everything under `src/` must be committed: the action installs no dependencies
of its own, so `src/` imports only Node.js built-ins. The one package it loads,
`@verbatra/sdk` in `src/locale-files.mjs`, comes from the CLI install the run
step creates.

## Commands

- `npm test` - run the Vitest suite with coverage
- `npm run test:watch` - the same suite in watch mode
- `npm run test:shell` - run every `tests/shell/*.test.sh`; `sensitive-report.test.sh`
  installs `@verbatra/cli` from npm unless `VERBATRA_CLI` points at a built CLI
- `npm run docs:usage` - regenerate the README input reference from `action.yml`
- `npm run docs:usage:check` - fail when the README input reference is out of date

## The README input reference

The commented-YAML block between the `<!-- start usage -->` and
`<!-- end usage -->` markers in `README.md` is generated from `action.yml` by
`scripts/generate-usage.mjs`, with the rendering in `scripts/usage-block.mjs`. It lists every
input in declaration order with its description, its `# Default:` line, and its
rendered default, and nothing outside the markers is touched. Never edit the
block by hand: change `action.yml` and run `npm run docs:usage`. CI runs
`npm run docs:usage:check` and fails the build when the committed block differs
from a fresh regeneration.

The block has no `required` field, so a change to an input's `required` flag
also means updating the sentence directly above the markers that names the
required inputs.

## Tests and coverage

Unit tests use Vitest and live in `tests/` as `*.test.mjs` files. Coverage of
`src/` and `scripts/` is collected with the v8 provider and enforced at 90% on lines, functions,
statements, and branches, the same thresholds the main repository uses. New
behavior ships with tests and must keep coverage at or above that threshold.

`src/report.mjs` is the pure core: it turns the CLI's `--json` output and exit code
into annotations, the job-summary markdown, and the exit status, with no I/O at
all. Put logic there and test it directly. `src/annotate.mjs` is the thin I/O
shell that reads the captured files and writes the results; keep it thin.
`src/resolve-config.mjs` locates the verbatra config file directly inside a given
directory, following the same recognized-filename precedence the CLI's own
config search uses; `src/run.sh` invokes it once, before
`npm install`, so the guard can pass an explicit, already-verified `--config`
path to the CLI.

`src/locale-files.mjs` runs after the CLI and writes the locale-to-file mapping
`annotate.mjs` reads: it loads the config through the installed `@verbatra/sdk`
and its locale path resolver, and writes an empty mapping when either is
missing or resolving takes longer than 10 seconds, so annotations then simply
carry no `file=`. It always ends with `process.exit(0)`, so a config that leaves
a timer or socket open cannot hold the step.

The recognized config filenames and their precedence order in
`src/resolve-config.mjs` (`SEARCH_PLACES`) are a point-in-time copy of
`SEARCH_PLACES` in
[`packages/sdk/src/config/load-config.ts`](https://github.com/verbatra/verbatra/blob/main/packages/sdk/src/config/load-config.ts)
in the main `verbatra/verbatra` repository, which is the source of truth for
that list. There is no cross-repo automation keeping the two lists in sync; if
the SDK's list changes, `resolve-config.mjs` does not update itself. This is
accepted, documented drift, not a gap to silently discover later.

Values that come from the CLI's output are untrusted. Anything placed into a
workflow command is percent-encoded, and anything placed into the job summary is
escaped for markdown. If you add a new interpolation into either, escape it and
cover it with a hostile-input test.

`tests/shell/` tests `src/run.sh` directly: each test sources
`tests/shell/harness.sh`, whose `run_step` runs the script with every input at
its `action.yml` default plus the overrides a case sets, and with `npm` (and, for
the Node.js guard, `node`) replaced by stubs that record their arguments. The
guards there exist because inputs are untrusted: a rejected value is never echoed
into a workflow command, so a newline inside it cannot forge a second one. Keep
those tests whenever you touch a guard, and add one for a new guard.
`tests/action-layout.test.mjs` fails when `action.yml` stops calling
`src/run.sh`, when the step's `env:` block and the variables the script reads
drift apart, or when `ci.yml` names a fixture or shell test that does not exist
or skips one that does.

## Workflows

`.github/workflows/ci.yml` runs the unit tests on Node.js 22.22.0, 24 and 26 and
self-tests the composite action by running `uses: ./` against the fixtures in
`tests/fixtures`, then runs each shell test. No step there needs an API key, because a dry run and the
read-only commands never construct a provider, so the whole job runs on a fork
pull request.

- `tests/fixtures/dry-run` has an empty `de.json`, so it is the drifted project:
  `translate --dry-run` has real work to describe, and `check` and `diff` must fail
  the step against it.
- `tests/fixtures/in-sync` has every source key translated, so `check` and `diff`
  must pass the gate against it. It is what stops a renderer that fails
  unconditionally from looking correct.
- The remaining fixtures each pin one regression: a `verbatra.config.ts`
  importing `defineConfig` from `@verbatra/cli` and from `@verbatra/sdk`, a
  `package.json` using pnpm's `workspace:` and `catalog:` protocols, a
  consumer's own `node_modules` the action must never write into, a config file
  present directly at the resolved `working-directory` (the pre-flight config
  guard's positive case), and a subdirectory with its own locales but no config
  of its own nested under a parent that does have one (the guard's "strict, not
  inherited" negative case). Each fixture's README states what it guards.

The job also asserts that each input guard rejects rather than silently accepts: an
unsupported `command`, a `dry-run`, `qa`, `qa-strict`, or `require-reviewed`
value other than `"true"` or `"false"`, `dry-run` combined with a read-only
command, `qa` or `require-reviewed` combined with a command other than `check`,
`qa-severity` or `qa-strict` without `qa`, `sensitive` combined with a command other than `check`, a malformed
`locales` list, `qa`, `require-reviewed`, or `sensitive` with a
`version` below `0.12.0` (a `0.12.0-next.*` prerelease included, on purpose),
a `node-version` that resolves outside the CLI's Node.js range, a
floating `version`, a `version` below the minimum the action supports, a
`version` whose second line forges a workflow command, and a
`working-directory` with no recognized verbatra config file directly inside it. If you add a guard to
`src/run.sh`, add the matching rejection step and its assertion to `ci.yml`, and
a case in `tests/shell/`.

Four smaller workflows keep issues and pull requests labelled. None of them
checks out or runs code from a pull request:

- `pr-labels.yml` runs on `pull_request_target`, adds `scope:` labels from the
  changed paths in `.github/labeler.yml`, and adds a `type:` label (plus
  `breaking change` for a `!`) from the Conventional Commit title.
- `issue-triage.yml` posts a fixed request when `needs reproduction` or
  `needs info` is added, removes `needs triage` when an issue closes, and puts an
  issue back into `needs triage` when its author replies.
- `stale.yml` runs daily and touches only issues labelled `needs reproduction`
  or `needs info`: `stale` after 14 quiet days, closed as not planned 7 days
  later.
- `welcome.yml` posts one fixed message on a first issue and one on a first pull
  request.

Every `uses:` reference in this repository is pinned to a full 40-character
commit SHA with the human-readable version in a trailing comment. Keep it that
way; Dependabot proposes the bumps.

## Releases

This action does not cut sequential new major versions. Fixes and features land
as new `v1.x.y` point releases, and the `v1` moving tag is updated to each one
as it ships. No new major version number is cut for a breaking change; it lands
in `v1` like everything else. An early `v2` prerelease existed briefly and was
retired in favor of this single-line model; see
[Versioning](README.md#versioning) in the README.

### Release checklist

Changes that are merged but not yet tagged are collected under `## [Unreleased]`
in [CHANGELOG.md](CHANGELOG.md); add a bullet there for every user-visible change.
To release:

1. Confirm CI is green on `main`. The positive self-tests for `qa`,
   `require-reviewed`, `sensitive`, `locales`, and the `needs-human` output run in
   the `self-test` job against `@verbatra/cli` `0.12.0`.
2. Bump `version` in `package.json` and `package-lock.json` to the new `X.Y.Z`.
3. Regenerate the README input reference with `npm run docs:usage` if `action.yml`
   changed, and confirm `npm run docs:usage:check` passes.
4. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add
   a fresh empty `## [Unreleased]` above it.
5. Update the README "What's new" paragraph in the same pull request.
6. Run `npm ci && npm test && npm run test:shell` and open a pull request with these changes; merge it
   once CI is green.
7. Tag the merge commit `vX.Y.Z` and push the tag.
8. Create the GitHub release for `vX.Y.Z`, with notes taken from the `CHANGELOG.md`
   entry.
9. Move the `v1` tag to the same commit so consumers of `uses: verbatra/action@v1`
   receive it.
10. Open a follow-up pull request that updates the full-SHA example under
    "Versioning" in the README to the new release commit with a `# vX.Y.Z` comment,
    since the SHA exists only once the tag does. `tests/release-docs.test.mjs` checks that
    the SHA equals the commit of the tag named in its comment, so the example may
    lag one release but never name a wrong commit. CI fetches full history so that
    check runs there; it is skipped only in a local clone without the tag.

## Commit convention

This repository uses
[Conventional Commits](https://www.conventionalcommits.org). Write subjects as
`type(scope): summary`, for example `fix(report): escape pipes in table cells`.
There is no commitlint hook here, so the convention is upheld by hand and in
review.

All repository content is English, contains no emoji, and never uses the em dash
character.

## Pull requests

1. Branch from `main`.
2. Make your change with tests, and keep it focused.
3. Run `npm ci && npm test && npm run test:shell` locally and make sure both pass.
4. If you changed `action.yml` or `src/run.sh`, say how you exercised it; the self-test job in CI
   covers all three commands and every input guard, but not every combination of
   `config-path`, `working-directory`, and `node-version`.
5. If you changed an input in `action.yml`, run `npm run docs:usage` and commit
   the regenerated `README.md` in the same change. See
   [The README input reference](#the-readme-input-reference).
6. Use Conventional Commit messages.
7. Open a pull request with the template, describing what changed and how you
   tested it. Keep the pull request scoped and make sure CI is green.

A maintainer will review your pull request. Please be responsive to feedback, and
hold to the standards in the [Code of Conduct](CODE_OF_CONDUCT.md).

## Triage

Every issue form applies `needs triage`, and the `PR labels` workflow labels each
pull request by its changed paths and its Conventional Commit title.

Labels come in groups, the same here as in verbatra/verbatra and verbatra/skills,
so a transferred issue keeps them: `type:` says what kind of work it is, `scope:`
which area it touches, `status:` where it stands, and `resolution:` why it was
closed. `needs reproduction` and `needs info` start a timer that closes the issue
after 21 quiet days. The full list with descriptions is on the
[labels page](https://github.com/verbatra/action/labels); the main repository's
`scripts/sync-labels.sh verbatra/action` keeps it in step.

When an issue arrives, or once a day from the `label:"needs triage"` filter:

1. A security problem reported in public: hide it, ask for a private advisory,
   and open a draft advisory yourself.
2. A question, or a problem with the CLI or the translation engine: transfer it
   to [verbatra/verbatra](https://github.com/verbatra/verbatra), where a
   question becomes a Discussion in Q&A.
3. A duplicate: link the original and close it as a duplicate with
   `resolution: duplicate`.
4. Check the `scope:` label (the forms set `scope: action`).
5. A bug: try to reproduce it from the form. If you cannot, add
   `needs reproduction` (the `Issue triage` workflow asks for one and the `Stale`
   timer starts). If the action reference or the workflow snippet is missing,
   add `needs info`. When the reporter replies, the issue goes back to
   `needs triage` on its own.
6. Reproduced or accepted: add `status: accepted`, plus `good first issue` or
   `help wanted` if it suits someone else.
7. Not doing it: add `resolution: wontfix` and close it as not planned with one
   sentence saying why.
8. Remove `needs triage`. The filter should be empty at the end.

For a pull request: check the labels the workflow set, approve the first
workflow run of a first-time contributor only after reading the diff, and
confirm the `CHANGELOG.md` bullet.

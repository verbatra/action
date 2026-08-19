# Contributing to the verbatra GitHub Action

Thanks for your interest in contributing. This repository holds the composite
GitHub Action that runs the verbatra CLI in CI. It is a small repository on
purpose: `action.yml`, three plain ESM scripts, their tests, and the workflows.

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

- Node.js >= 22.14.0 (the `engines` floor, and the lower half of the CI matrix)
- npm (this repository uses npm and a committed `package-lock.json`, unlike the
  main repository, which uses pnpm)

## Setup

```
npm ci
```

Use `npm ci` rather than `npm install` so the lockfile stays authoritative. CI
installs the same way.

## Commands

- `npm test` - run the Vitest suite with coverage
- `npm run test:watch` - the same suite in watch mode

## Tests and coverage

Tests use Vitest and live next to the code as `*.test.mjs` files. Coverage is
collected with the v8 provider and enforced at 90% on lines, functions,
statements, and branches, the same thresholds the main repository uses. New
behavior ships with tests and must keep coverage at or above that threshold.

`report.mjs` is the pure core: it turns the CLI's `--json` output and exit code
into annotations, the job-summary markdown, and the exit status, with no I/O at
all. Put logic there and test it directly. `annotate.mjs` is the thin I/O shell
that reads the captured files and writes the results; keep it thin.
`resolve-config.mjs` locates the verbatra config file directly inside a given
directory, following the same recognized-filename precedence the CLI's own
config search uses; it is invoked once from the `id: run` step, before
`npm install`, so the guard can pass an explicit, already-verified `--config`
path to the CLI.

The recognized config filenames and their precedence order in
`resolve-config.mjs` (`SEARCH_PLACES`) are a point-in-time copy of
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

## Workflows

`.github/workflows/ci.yml` runs the unit tests on both matrix Node versions and
self-tests the composite action by running `uses: ./` against the fixtures in
`.github/fixtures`. No step there needs an API key, because a dry run and the
read-only commands never construct a provider, so the whole job runs on a fork
pull request.

- `.github/fixtures/dry-run` has an empty `de.json`, so it is the drifted project:
  `translate --dry-run` has real work to describe, and `check` and `diff` must fail
  the step against it.
- `.github/fixtures/in-sync` has every source key translated, so `check` and `diff`
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
unsupported `command`, `dry-run` combined with a read-only command, a floating
`version`, a `version` below the minimum the action supports, a `version` whose
second line forges a workflow command, and a `working-directory` with no
recognized verbatra config file directly inside it. If you add a guard to
`action.yml`, add the matching rejection step and its assertion.

Every `uses:` reference in this repository is pinned to a full 40-character
commit SHA with the human-readable version in a trailing comment. Keep it that
way; Dependabot proposes the bumps.

## Releases

This action does not cut sequential new major versions. Fixes and features land
as new `v1.x.y` point releases, and the `v1` moving tag is updated to each one
as it ships. No new major version number is cut for a breaking change; it lands
in `v1` like everything else. `v2` is a frozen, one-time snapshot kept only for
continuity, see [Why v1, not v2](README.md#why-v1-not-v2) in the README.

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
3. Run `npm ci && npm test` locally and make sure it passes.
4. If you changed `action.yml`, say how you exercised it; the self-test job in CI
   covers all three commands and every input guard, but not every combination of
   `config-path`, `working-directory`, and `node-version`.
5. Use Conventional Commit messages.
6. Open a pull request with the template, describing what changed and how you
   tested it. Keep the pull request scoped and make sure CI is green.

A maintainer will review your pull request. Please be responsive to feedback, and
hold to the standards in the [Code of Conduct](CODE_OF_CONDUCT.md).

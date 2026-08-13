# Contributing to the verbatra GitHub Action

Thanks for your interest in contributing. This repository holds the composite
GitHub Action that runs the verbatra CLI in CI. It is a small repository on
purpose: `action.yml`, two plain ESM scripts, their tests, and the workflows.

The translation engine itself lives in the
[main verbatra repository](https://github.com/mariokreitz/verbatra). Read
[its contributing guide](https://github.com/mariokreitz/verbatra/blob/main/CONTRIBUTING.md)
for anything that touches the CLI, the SDK, a provider, or a format adapter.

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, follow
[SECURITY.md](SECURITY.md); please do not open a public issue for
vulnerabilities.

## Which repository does my change belong in

| Your change | Where it goes |
| --- | --- |
| Action inputs, the `action.yml` wiring, annotations, the job summary, the workflows here | This repository |
| Translation behavior, a format adapter, a provider, CLI flags, config keys | [mariokreitz/verbatra](https://github.com/mariokreitz/verbatra) |
| The documentation site at verbatra.kreitz-webdev.de | [mariokreitz/verbatra](https://github.com/mariokreitz/verbatra), under `apps/docs` |

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

Values that come from the CLI's output are untrusted. Anything placed into a
workflow command is percent-encoded, and anything placed into the job summary is
escaped for markdown. If you add a new interpolation into either, escape it and
cover it with a hostile-input test.

## Workflows

`.github/workflows/ci.yml` runs the unit tests on both matrix Node versions and
self-tests the composite action by running `uses: ./` against the dry-run fixture
in `.github/fixtures/dry-run`. That fixture run needs no API key, because a dry
run never constructs a provider.

Every `uses:` reference in this repository is pinned to a full 40-character
commit SHA with the human-readable version in a trailing comment. Keep it that
way; Dependabot proposes the bumps.

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
   covers the happy path and the semver guard, but not every input.
5. Use Conventional Commit messages.
6. Open a pull request with the template, describing what changed and how you
   tested it. Keep the pull request scoped and make sure CI is green.

A maintainer will review your pull request. Please be responsive to feedback, and
hold to the standards in the [Code of Conduct](CODE_OF_CONDUCT.md).

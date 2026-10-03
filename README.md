<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/action/main/.github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra GitHub Action</h1>

<p align="center">
  Run verbatra i18n translations in CI or gate a pull request on locale drift, annotate failures, and write a job summary, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, a self-hosted LibreTranslate server, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://github.com/verbatra/action/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/action/ci.yml?branch=main&amp;label=Action%20CI&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="Action CI" /></a>
  <a href="https://github.com/marketplace/actions/verbatra"><img src="https://img.shields.io/github/v/release/verbatra/action?sort=semver&amp;label=marketplace&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="GitHub Marketplace release" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="@verbatra/cli npm version" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/action"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/action?label=openssf%20scorecard&amp;labelColor=0B0B12" alt="OpenSSF Scorecard" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?color=7b1fa2&amp;labelColor=0B0B12" alt="License: MIT" /></a>
</p>

## What's new in v1

`v1` is the only maintained line: every fix and feature lands there, and the `v1`
tag moves to the newest release. Entries are newest first. Every v1 release has
the same runner floor, because the action has pinned
`actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (v7.0.0) since
`v1.0.0` and that action runs on the `node24` runtime.

### Unreleased

No breaking change. Adds the `qa`, `qa-severity`, and `qa-strict` inputs, which
run `verbatra check --qa` over every committed translation and turn each finding
into an annotation, the `require-reviewed` input, which runs
`verbatra check --require-reviewed` and fails the step while a machine-written
translation is not approved, and the `needs-human` output, which is `"true"` when
`translate` exits `3` in human-only mode. That exit passes the step instead of
failing it. `check` now also warns about plurals that lack a CLDR plural category
the target language uses, and a whole-run failure shows the CLI's `hint` as a
next step and names the code of a wrapped error. See
[Check translation quality](#check-translation-quality),
[Require reviewed translations](#require-reviewed-translations), and
[Human-only mode](#human-only-mode).

Minimum runner: Actions Runner v2.327.1. Minimum `@verbatra/cli` for `qa`,
`require-reviewed`, and exit `3`: 0.12.0; every other input still works from
0.9.3.

### v1.2.0

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

### v1.1.4

No breaking change, and no input contract change. Fixes the action merging its
scratch install into the consumer's own `node_modules`, which could overwrite
dependency versions in the checked-out tree or crash on a name collision with one
of the CLI's transitive dependencies.

Its release notes recommend moving to a `v2` line. That prerelease has since been
retired; `v1` is the maintained line, and `v1.2.0` or newer is the upgrade.

Minimum runner: Actions Runner v2.327.1.

### v1.1.3

No breaking change. `npm install --prefix` still parsed the consumer's existing
`package.json`, so a pnpm or Yarn workspace-protocol dependency string there
(`workspace:*`, pnpm's `catalog:`) crashed the install. The CLI now installs into
an isolated scratch directory, and npm never reads the consumer's manifest.

Minimum runner: Actions Runner v2.327.1.

### v1.1.2

No breaking change. Installing through a bare `npx --yes` put the CLI in an
ephemeral cache that is never an ancestor of the config file on disk, so every
`verbatra.config.ts` importing `defineConfig` failed with `CONFIG_INVALID`. The
action now installs `@verbatra/cli` and `@verbatra/sdk` at the pinned version and
invokes the binary through `npm exec`, which also fixed a Windows-runner failure.

Minimum runner: Actions Runner v2.327.1.

### v1.1.1

No breaking change, and no behavior change. `action.yml`'s description was
translation-only, which hid the read-only gate from the Marketplace listing.

Minimum runner: Actions Runner v2.327.1.

### v1.1.0

No breaking change. Adds the `command` input, so the action can run the CLI's
read-only `check` and `diff` commands as well as `translate`. Both are read-only:
no provider call, no API key, no quota, so they gate a pull request from a fork.
`command` defaults to `translate`, so existing workflows are unaffected.
`dry-run` applies to `translate` only and is now rejected with the other two
rather than ignored.

Minimum runner: Actions Runner v2.327.1.

### v1.0.1

Documentation only. No breaking change, no behavior change, and no input
contract change. The README and security policy carried at the release tag still
described the action as unpublished with no releases; this brought the tagged
tree in line with the default branch, which the Marketplace listing already
rendered from.

Minimum runner: Actions Runner v2.327.1.

### v1.0.0

First published release and the initial Marketplace listing: `translate` in CI,
with annotations, a job summary, and the CLI's exit code propagated. Inputs:
`version`, `config-path`, `working-directory`, `dry-run`, `node-version`.

Minimum runner: Actions Runner v2.327.1.

## What it does

verbatra reads your locale files, works out what is missing or has drifted since the source last changed, and fills the gaps through the AI or machine-translation provider you configure, enforcing placeholder and ICU integrity on every result.

This action runs `verbatra translate`, `check`, or `diff` (each with `--json`), turns the result into GitHub annotations and a job-summary table, and propagates the CLI's exit code. `check` and `diff` are read-only and need no provider API key, so they gate a pull request without spending anything.

## Quick start

Add the action to a workflow. `working-directory` (the repository root by default) needs a verbatra config file directly inside it, for example `verbatra.config.ts` or `.verbatrarc.json`, plus the API key of your configured provider, passed from `secrets`:

```yaml
name: Translate
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: verbatra/action@v1
        with:
          version: 0.9.3
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

`v1` is the moving tag that tracks the latest release; see [Versioning](#versioning) for an immutable pin. See [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file) and [Providers](https://verbatra.kreitz-webdev.de/docs/providers) for the full reference.

### Preview without spending

Set `dry-run: true` to report what would change without calling a provider and without writing any file. A dry run never constructs a provider, so it needs no API key at all.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.9.3
          dry-run: "true"
```

### Gate a pull request

Set `command: check` to fail a pull request whose locale files have drifted from the source. `check` is read-only: it writes nothing, never constructs a provider, and needs no API key or `secrets` wiring at all, so it also runs on pull requests from forks.

```yaml
name: i18n gate
on: pull_request

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: verbatra/action@v1
        with:
          version: 0.9.3
          command: check
```

The step fails when any locale has missing or stale keys, and the job summary names the drifted locales and their counts, so the reason is visible without opening the log.

## Choosing a command

The `command` input selects which CLI command runs. All three report through the same annotations and job summary.

| Command | Writes files | Needs an API key | Fails the step when |
| --- | --- | --- | --- |
| `translate` (default) | yes | yes | a locale fails, or is written only partially because keys were withheld |
| `translate` with provider `none` | only translation-memory hits | no | as `translate`; keys left for a person pass the step with a warning (exit 3) |
| `translate` with `dry-run: "true"` | no | no | translation could not be planned |
| `check` | no | no | any locale has missing or stale keys |
| `check` with `qa: "true"` | no | no | a locale is out of date, or a committed translation fails the quality check |
| `check` with `require-reviewed: "true"` | no | no | a locale is out of date, or a machine-written translation is not approved |
| `diff` | no | no | any locale has pending changes |

- Use **`check`** as a pull-request gate: the smallest, fastest signal, with per-locale counts of missing, stale, and up-to-date keys.
- Use **`diff`** for the same gate when a reviewer needs to see *which* keys are pending. It lists the key names per locale, split into missing and changed, and calls out orphaned keys (present in a target locale but no longer in the source) separately, since those never fail the step on their own.
- Add **`qa: "true"`** to `check` to also review every committed translation, including ones typed by hand or merged from another tool. See [Check translation quality](#check-translation-quality).
- Add **`require-reviewed: "true"`** to `check` to fail while machine-written translations wait for a person's approval. See [Require reviewed translations](#require-reviewed-translations).
- Use **`translate --dry-run`** to preview the work a real run would do, in translate's own terms (translated, unchanged, integrity-withheld, and provider-failure counts), without writing anything.

### Check translation quality

Set `qa: "true"` together with `command: check` to run `verbatra check --qa`, which runs the placeholder, markup, ICU, and plural checks and the review flags over every committed target value, not only over values verbatra writes itself. It is read-only and keyless like `check`, and needs `version` `0.12.0` or newer; the action rejects `qa` with an older version before installing anything. A prerelease such as `0.12.0-next.0` is rejected too, deliberately: semver ranks a prerelease below its release, and a prerelease is not guaranteed to carry the final `check --qa` contract, so pin the release.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          qa: "true"
```

Each finding becomes an annotation naming the locale, the key, and the reason: an `::error::` for a value the integrity gate would refuse, and a `::warning::` for a review reason. The job summary adds `qa errors` and `qa warnings` columns and a findings table. The step fails on any error finding. Set `qa-strict: "true"` to fail on warnings too, or `qa-severity: error` to report errors only. The CLI rejects any other `qa-severity` value, and rejects `qa-severity: error` together with `qa-strict`, with exit code 2.

The job summary's findings table is the full view: it lists every finding (up to 1000, to keep the summary under GitHub's size limit). Annotations are only a preview, because GitHub shows at most 10 error, 10 warning, and 10 notice annotations per step ([annotation limits](https://github.com/actions/toolkit/blob/main/docs/problem-matchers.md#limitations)). The action keeps drift errors first, then review errors, then quality errors, then warnings, and adds one notice counting what it left out.

Every `check` also lists the plurals that lack a CLDR plural category their target language uses, such as a Polish plural with only `one` and `other`, as one `PLURAL_CATEGORIES_INCOMPLETE` warning per locale. It never fails a plain `check`; with `qa-strict` it fails the step like any other warning.

### Require reviewed translations

Set `require-reviewed: "true"` together with `command: check` to run `verbatra check --require-reviewed`, which fails the step while any machine-written translation (origin `machine`, `memory`, `fuzzy`, or `agent`) is not approved in the committed `verbatra.provenance.json`, where Studio and the MCP review tools record decisions. It is read-only and keyless like `check`, combines with `qa`, and needs `version` `0.12.0` or newer; the action rejects it with an older version or a `0.12.0` prerelease before installing anything, as it does `qa`.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          require-reviewed: "true"
```

Each locale with unapproved keys becomes one `REVIEW_REQUIRED` error annotation naming them, and the job summary adds an `unreviewed` column. A `verbatra.provenance.json` that is corrupt or from a newer verbatra fails the gate with one `REVIEW_STATE_UNREADABLE` annotation, since no decision can be read.

## Inputs

Every input and its default, generated from [`action.yml`](./action.yml).
`version` is the only required one.

<!-- start usage -->
```yaml
- uses: verbatra/action@v1
  with:
    # The @verbatra/cli version to run, e.g. 1.2.3. PIN this to an exact version for
    # reproducible, supply-chain-safe CI; do NOT use a floating tag such as "latest" (it
    # pulls whatever is newest at run time, which is non-reproducible and would auto-pull
    # a compromised release). The action rejects anything that is not an exact semver
    # (dist-tags, ranges, and ^/~ prefixes all fail the step). Must be 0.9.3 or newer:
    # older releases resolve a verbatra.config.ts import of defineConfig from
    # @verbatra/cli or @verbatra/sdk against the config file's own location rather than
    # against the running CLI, and the action no longer works around that. Required.
    version: ''

    # Which verbatra command to run. One of "translate" (default, writes translations),
    # "check" (read-only, exits 1 when any locale has missing or stale keys), or "diff"
    # (read-only, exits 1 when any locale has pending changes). The read-only commands
    # need no provider API key, so they work as a CI gate on a fork pull request. Anything
    # outside that set fails the step.
    # Default: translate
    command: translate

    # Explicit config file to load (maps to --config). A relative path resolves against
    # working-directory, not against the repository root. Empty (the default) requires a
    # recognized verbatra config file directly inside working-directory; the step fails
    # before installing the CLI when none is found there. The lookup is strict and not
    # inherited: it never walks up into a parent directory or the repository root, even
    # when one of them holds a valid config.
    # Default: ''
    config-path: ''

    # Directory to resolve config and locale files against (maps to --cwd). Config lookup
    # (when config-path is empty) is strict: it looks only directly inside this directory,
    # never a parent or ancestor, even when working-directory is unset and resolves to the
    # repository root. For example, in a monorepo where the app to translate lives at
    # apps/docs, set working-directory to apps/docs and put the config there; a config at
    # the repository root does not satisfy the check.
    # Default: ''
    working-directory: ''

    # Report what would change without calling a provider or writing (maps to --dry-run).
    # Applies only to the translate command; combining it with check or diff fails the
    # step, because those commands are already read-only and the CLI rejects the flag.
    # Must be "true" or "false"; any other value fails the step.
    # Default: false
    dry-run: "false"

    # Also run the quality check over every committed translation (maps to --qa). Applies
    # only to the check command; any other command fails the step. Each finding becomes an
    # annotation: an error for a value the integrity gate would refuse (a broken
    # placeholder, markup, or ICU message), a warning for a review reason. The step fails
    # on any error finding. Needs version 0.12.0 or newer; an older version fails the step
    # before installing the CLI. Must be "true" or "false"; any other value fails the
    # step.
    # Default: false
    qa: "false"

    # Lowest quality-check severity to report, "error" or "warning" (maps to --severity).
    # Empty (the default) reports both. Requires qa; the CLI rejects any other value, and
    # rejects "error" together with qa-strict.
    # Default: ''
    qa-severity: ''

    # Also fail the step when the quality check reports only warnings (maps to --strict).
    # Requires qa. Must be "true" or "false"; any other value fails the step.
    # Default: false
    qa-strict: "false"

    # Also fail the step while any machine-written translation is not approved in the
    # committed verbatra.provenance.json (maps to --require-reviewed). Applies only to the
    # check command; any other command fails the step. Each locale with unapproved keys
    # becomes an error annotation naming them. Keyless like check. Needs version 0.12.0 or
    # newer; an older version fails the step before installing the CLI. Must be "true" or
    # "false"; any other value fails the step.
    # Default: false
    require-reviewed: "false"

    # Node.js version to set up for running the CLI.
    # Default: 24
    node-version: "24"
```
<!-- end usage -->

`version` names the `@verbatra/cli` release the action installs. It is a
different number from the action's own `v1` tag in `uses:`; see
[Versioning](#versioning). For what `command` selects, see
[Choosing a command](#choosing-a-command). For how `config-path` and
`working-directory` interact, see [Config discovery](#config-discovery).

## Outputs

| Output | Value |
| --- | --- |
| `needs-human` | `"true"` when `translate` exited 3 because machine translation is disabled by policy and keys are left for a person, otherwise `"false"` |

Everything else is delivered as annotations, a job summary, and the job's exit
status. See [Human-only mode](#human-only-mode).

## Human-only mode

A config with `provider: { id: "none" }` disables machine translation by policy: `translate` fills keys only from exact translation-memory hits, reads no API key, and leaves every other missing or stale key for a person. When it leaves any, the CLI exits `3`. That is not a failure, so the action passes the step, writes one `::warning::` annotation per locale naming the keys (unfilled keys, and protected keys a person has to review), lists them in the job summary, and sets the `needs-human` output to `"true"`. Branch on the output to hand the keys off, for example with `verbatra export`:

```yaml
      - uses: verbatra/action@v1
        id: verbatra
        with:
          version: 0.12.0
      - if: steps.verbatra.outputs.needs-human == 'true'
        run: echo "Some keys need a human translation; see the job summary."
```

Exit `3` needs `@verbatra/cli` `0.12.0` or newer; an earlier CLI has no human-only mode and never exits `3`. Exit `3` from `check` or `diff` is not reinterpreted and still fails the step, as does a partial or failed locale, which the CLI reports with exit `1` instead.

## Config discovery

`working-directory` (the repository root by default) must contain a recognized verbatra config file directly inside it, for example `verbatra.config.ts` or `.verbatrarc.json`. The lookup never walks up into a parent directory or the repository root, even when an ancestor holds a valid config, and the action always passes the resolved config to the CLI explicitly with `--config`. If no config is found there, the step fails before installing the CLI, naming the exact directory it checked.

In a monorepo, point `working-directory` at the app you are translating:

```yaml
      with:
        version: 0.9.3
        working-directory: apps/docs
```

Here a recognized config must exist directly inside `apps/docs`; a config at the outer repository root does not satisfy the check. Set `config-path` to load a config from somewhere else instead.

See the [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) for the full rules, and [config file discovery order](https://verbatra.kreitz-webdev.de/docs/config-file#discovery-order) for every recognized file name.

## Permissions

A composite action cannot declare its own `permissions:`; only the consuming workflow can. Set `permissions:` to least privilege at the workflow or job level. The documented happy path needs only `contents: read`. Do not grant anything broader unless your own surrounding steps require it.

```yaml
permissions:
  contents: read
```

If you add steps that commit the translated files back or open a pull request, grant the extra scope on that job alone rather than widening the whole workflow.

## Secret wiring

API keys come only from environment variables, never from action inputs or a literal in YAML. Pass yours via `env:` from `secrets.*`, using the variable your provider reads:

| Provider id | Environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |
| `google-translate` | `GOOGLE_TRANSLATE_API_KEY` |
| `openai-compatible` | `OPENAI_COMPATIBLE_API_KEY`, or the variable named by `provider.options.apiKeyEnvVar`; omit entirely for a server that needs no key |
| `libretranslate` | `LIBRETRANSLATE_API_KEY`, only when your server requires a key |

Set only the keys your configured provider needs, and each value must be a `${{ secrets.* }}` reference, never a literal. Keys are never echoed: the action's own error messages name the variable but never a value.

## Job summary and annotations

Every run writes a job summary to `GITHUB_STEP_SUMMARY` (a per-locale counts table, or a whole-run failure heading) and annotates failures with `::error::` workflow commands, one per affected locale or one for a whole-run failure. A `check` with `qa` adds one annotation per quality finding, `::warning::` for a review reason. A whole-run failure, such as a locale the provider does not support (`LOCALE_UNSUPPORTED_BY_PROVIDER`, exit `2`), shows the error code, the code of the error it wraps as `(cause: MISSING_API_KEY)`, and, with a CLI that reports one, the `hint` from its JSON error record as a `Next step:` in both the annotation and the summary. Every code is explained on [Error codes](https://verbatra.kreitz-webdev.de/docs/error-codes), and every exit code on [Exit codes and JSON output](https://verbatra.kreitz-webdev.de/docs/cli/output#exit-codes). GitHub shows at most 10 annotations of each severity per step, so past that the action adds one notice counting the rest, and the job summary remains the full report. The job then exits with the CLI's own exit code, and it does so only after the annotations and the summary have been emitted. The one exception is `translate` exiting `3`, which passes the step; see [Human-only mode](#human-only-mode).

A per-locale annotation names that locale's file (`file=`), so GitHub shows it on the locale file in the pull request's changed files. The action resolves the file from the config's `files.pattern` through the `@verbatra/sdk` it installs next to the CLI (version 0.10.0 or newer), relative to the repository root. When the file cannot be resolved, or lies outside the workspace, the annotation is written without one. A whole-run failure and an unreadable `verbatra.provenance.json` never name a file.

For `translate`, a locale's status is `ok`, `partial`, or `failed`. A `partial` locale was written, but some of its keys were withheld by the integrity gate, a provider failure, or the token budget, and the CLI exits 1 for it just as for a failed one. It gets its own `LOCALE_PARTIAL` annotation naming how many keys landed and which were withheld, a `partial` value in the status column, a line under "Partial locales" in the summary, and its own count on the aggregate line (`3 locales: 1 succeeded, 1 partial, 1 failed`). A failed locale with no error of its own, because every key was withheld, names its withheld keys the same way.

## Versioning

`v1` is the only maintained line: every fix and feature lands there. Pin `v1` for convenience (it moves to the latest `v1.x.y` release), a specific `v1.x.y` tag for an immutable minor pin, or a full commit SHA for the most reproducible reference:

```yaml
      - uses: verbatra/action@0221b030d517d8af621fb6b812fcfd17a1f940ee # v1.2.0
```

Keep the human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot propose the SHA bumps.

An early `v2` prerelease existed briefly as a one-time breaking snapshot; it has been retired in favor of this single, continuously updated `v1` line. [What's new in v1](#whats-new-in-v1) lists every release on it, newest first.

Two things need pinning for reproducible, supply-chain-safe CI: the `uses:` reference above, and the `version` input, which must be an exact semver `@verbatra/cli` release (`0.9.3` or newer) rather than a floating tag such as `latest` or a range. The action rejects anything else before installing.

## Requirements

- A GitHub-hosted or self-hosted runner with `bash` available, on Actions Runner v2.327.1 or newer. The action sets up Node.js itself via `actions/setup-node` v7.0.0, which runs on the `node24` runtime and needs that runner floor, so no Node.js step of your own is required.
- Network access to the npm registry, to install `@verbatra/cli` at run time.
- A verbatra config directly inside the resolved `working-directory` (the repository root by default), plus locale files there. See [Config discovery](#config-discovery).

## The verbatra project

This action is the CI surface of verbatra, not a separate tool. It wraps the same `@verbatra/cli` you run locally, at a version you pin, so a CI run and a developer's run do the same work.

| Where | What it is |
| --- | --- |
| [github.com/verbatra/verbatra](https://github.com/verbatra/verbatra) | The main project: the `@verbatra/cli` command-line tool, the `@verbatra/sdk` programmatic API, the `@verbatra/studio` local dashboard, and the `@verbatra/mcp` stdio MCP server. |
| [`@verbatra/cli` on npm](https://www.npmjs.com/package/@verbatra/cli) | The package this action installs and runs. |
| [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) | The documentation site, including the [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli). |

Issues about translation behavior, formats, providers, or the CLI itself belong in the [main repository](https://github.com/verbatra/verbatra/issues). Issues about the action's inputs, annotations, or job summary belong [here](https://github.com/verbatra/action/issues).

## Security

Provider API keys are never accepted as an action input; they are read only from the environment, passed in from `${{ secrets.* }}`. Every `uses:` reference in this repository is pinned to a full commit SHA, the lockfile is committed and CI installs are frozen, and the `version` input is rejected unless it is an exact semver version. Locale and key names taken from CLI output are percent-encoded in annotations and escaped in the job summary, so a crafted key cannot forge a workflow command or inject markdown structure. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Documentation

The hosted documentation site at [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) is the canonical reference. The [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) covers this action in the context of a full project, and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli) documents every command and flag the action runs on your behalf.

## Contributing

The `qa` and `require-reviewed` inputs and the `needs-human` output are covered by unit tests and by guard self-tests, but not yet by a self-test against a real CLI, because they need `@verbatra/cli` `0.12.0`. Those tests are on the [release checklist](./CONTRIBUTING.md#release-checklist).

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first; they follow the main project's guidelines, with the differences this repository actually has (npm rather than pnpm, no changesets, no commit hook). Commits here follow Conventional Commits. Run `npm ci && npm test` before opening a pull request; the same suite runs in CI on Node 22.14.0 and 24, alongside a job that runs the action against itself.

## License

[MIT](./LICENSE) (c) Mario Kreitz

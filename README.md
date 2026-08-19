<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/action/main/.github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra GitHub Action</h1>

<p align="center">
  Run verbatra i18n translations in CI or gate a pull request on locale drift, annotate failures, and write a job summary, using OpenAI, Anthropic, Gemini, DeepL, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://github.com/verbatra/action/actions/workflows/ci.yml"><img src="https://github.com/verbatra/action/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/@verbatra/cli?label=%40verbatra%2Fcli" alt="@verbatra/cli npm version" /></a>
  <a href="https://github.com/marketplace/actions/verbatra"><img src="https://img.shields.io/github/v/release/verbatra/action?sort=semver&amp;label=marketplace&amp;color=blue" alt="GitHub Marketplace" /></a>
  <a href="https://github.com/verbatra/verbatra"><img src="https://img.shields.io/badge/project-verbatra-blue.svg" alt="Part of the verbatra project" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

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
| `translate` (default) | yes | yes | translation fails for a locale |
| `translate` with `dry-run: "true"` | no | no | translation could not be planned |
| `check` | no | no | any locale has missing or stale keys |
| `diff` | no | no | any locale has pending changes |

- Use **`check`** as a pull-request gate: the smallest, fastest signal, with per-locale counts of missing, stale, and up-to-date keys.
- Use **`diff`** for the same gate when a reviewer needs to see *which* keys are pending. It lists the key names per locale, split into missing and changed, and calls out orphaned keys (present in a target locale but no longer in the source) separately, since those never fail the step on their own.
- Use **`translate --dry-run`** to preview the work a real run would do, in translate's own terms (translated, unchanged, integrity-withheld, and provider-failure counts), without writing anything.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | yes | none | The `@verbatra/cli` version to run, for example `0.9.3`. Must be an exact semver version; a dist-tag such as `latest`, a range, or a `^`/`~` prefix fails the step. Must also be `0.9.3` or newer; an older pin fails the step. This is a different number from the action's own `v1` tag above; see [Versioning](#versioning). |
| `command` | no | `translate` | Which command to run: `translate`, `check`, or `diff`. See [Choosing a command](#choosing-a-command). Any other value fails the step. |
| `config-path` | no | `""` | Explicit config file to load (maps to `--config`). A relative path resolves against `working-directory`, not against the repository root. Empty (the default) requires a recognized config file directly inside `working-directory`; the step fails before installing the CLI when none is found there. |
| `working-directory` | no | `""` | Directory to resolve config and locale files against (maps to `--cwd`). Config lookup is strict, not inherited: it looks only directly inside this directory, never a parent or ancestor, even the repository root. See [Config discovery](#config-discovery). |
| `dry-run` | no | `"false"` | Report what would change without calling a provider or writing (maps to `--dry-run`). Applies only to `translate`; combining it with `check` or `diff` fails the step. |
| `node-version` | no | `"24"` | Node.js version to set up for running the CLI. |

The action declares no outputs. Its results are delivered as annotations, a job summary, and the job's exit status.

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
| `openai-compatible` | `OPENAI_COMPATIBLE_API_KEY`, or the variable named by `provider.options.apiKeyEnvVar`; omit entirely for a server that needs no key |

Set only the keys your configured provider needs, and each value must be a `${{ secrets.* }}` reference, never a literal. Keys are never echoed: the action's own error messages name the variable but never a value.

## Job summary and annotations

Every run writes a job summary to `GITHUB_STEP_SUMMARY` (a per-locale counts table, or a whole-run failure heading) and annotates failures with `::error::` workflow commands, one per affected locale or one for a whole-run failure. The job then exits with the CLI's own exit code, and it does so only after the annotations and the summary have been emitted.

## Versioning

`v1` is the only maintained line: every fix and feature lands there. Pin `v1` for convenience (it moves to the latest `v1.x.y` release), a specific `v1.x.y` tag for an immutable minor pin, or a full commit SHA for the most reproducible reference:

```yaml
      - uses: verbatra/action@d8276d514f16fa03001be1eda14778c637eb1f0f # v1.2.0
```

Keep the human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot propose the SHA bumps.

An early `v2` prerelease existed briefly as a one-time breaking snapshot; it has been retired in favor of this single, continuously updated `v1` line.

Two things need pinning for reproducible, supply-chain-safe CI: the `uses:` reference above, and the `version` input, which must be an exact semver `@verbatra/cli` release (`0.9.3` or newer) rather than a floating tag such as `latest` or a range. The action rejects anything else before installing.

## Requirements

- A GitHub-hosted or self-hosted runner with `bash` available. The action sets up Node.js itself via `actions/setup-node`, so no Node.js step of your own is required.
- Network access to the npm registry, to install `@verbatra/cli` at run time.
- A verbatra config directly inside the resolved `working-directory` (the repository root by default), plus locale files there. See [Config discovery](#config-discovery).

## The verbatra project

This action is the CI surface of verbatra, not a separate tool. It wraps the same `@verbatra/cli` you run locally, at a version you pin, so a CI run and a developer's run do the same work.

| Where | What it is |
| --- | --- |
| [github.com/verbatra/verbatra](https://github.com/verbatra/verbatra) | The main project: the `@verbatra/cli` command-line tool, the `@verbatra/sdk` programmatic API, and the `@verbatra/studio` local dashboard. |
| [`@verbatra/cli` on npm](https://www.npmjs.com/package/@verbatra/cli) | The package this action installs and runs. |
| [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) | The documentation site, including the [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli). |

Issues about translation behavior, formats, providers, or the CLI itself belong in the [main repository](https://github.com/verbatra/verbatra/issues). Issues about the action's inputs, annotations, or job summary belong [here](https://github.com/verbatra/action/issues).

## Security

Provider API keys are never accepted as an action input; they are read only from the environment, passed in from `${{ secrets.* }}`. Every `uses:` reference in this repository is pinned to a full commit SHA, the lockfile is committed and CI installs are frozen, and the `version` input is rejected unless it is an exact semver version. Locale and key names taken from CLI output are percent-encoded in annotations and escaped in the job summary, so a crafted key cannot forge a workflow command or inject markdown structure. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Documentation

The hosted documentation site at [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) is the canonical reference. The [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) covers this action in the context of a full project, and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli) documents every command and flag the action runs on your behalf.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first; they follow the main project's guidelines, with the differences this repository actually has (npm rather than pnpm, no changesets, no commit hook). Commits here follow Conventional Commits. Run `npm ci && npm test` before opening a pull request; the same suite runs in CI on Node 22.14.0 and 24, alongside a job that runs the action against itself.

## License

[MIT](./LICENSE) (c) Mario Kreitz

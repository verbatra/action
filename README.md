<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/action/main/.github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra GitHub Action</h1>

<p align="center">
  Run verbatra i18n translations in CI, annotate failures, and write a job summary, using OpenAI, Anthropic, Gemini, DeepL, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://github.com/verbatra/action/actions/workflows/ci.yml"><img src="https://github.com/verbatra/action/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/@verbatra/cli?label=%40verbatra%2Fcli" alt="@verbatra/cli npm version" /></a>
  <a href="https://github.com/verbatra/verbatra"><img src="https://img.shields.io/badge/project-verbatra-blue.svg" alt="Part of the verbatra project" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Quick start

Add the action to a workflow. It needs a verbatra config in the repository (for example `verbatra.config.ts` or `.verbatrarc.json`) and the API key of your configured provider, passed from `secrets`:

> Read this before copying. This action has no releases yet, so the `verbatra/action@v1` reference used in every example below does not resolve today and a workflow that uses it as-is will fail. Replace `@v1` with a full commit SHA from `main`. `@v1` is the moving major tag cut with the first published release, and it is documented here so the examples stay correct once that release exists; see [The action reference itself](#the-action-reference-itself) for why a SHA is the better pin either way.

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
          version: 0.8.0
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

See [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file) for the config reference and [Providers](https://verbatra.kreitz-webdev.de/docs/providers) for the provider options.

### Preview without spending

Set `dry-run: true` to report what would change without calling a provider and without writing any file. A dry run never constructs a provider, so it needs no API key at all. It is the cheapest way to gate a pull request on "are the locale files in sync".

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.8.0
          dry-run: "true"
```

## Description

verbatra is an i18n translation automation tool: it reads your locale files, works out what is missing or has drifted since the source last changed, and fills the gaps through the AI or machine-translation provider you choose, enforcing placeholder and ICU integrity on every result.

This composite action runs `verbatra translate --json`, turns the result into GitHub annotations and a job-summary table, and propagates the CLI exit code so the job fails when translation fails. At run time it installs [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) at the pinned `version` via `npx` and runs it, so the action carries no bundled CLI of its own and picking a CLI release is a one-line change.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | yes | none | The `@verbatra/cli` version to run, for example `0.8.0`. Must be an exact semver version; a dist-tag such as `latest`, a range, or a `^`/`~` prefix fails the step. |
| `config-path` | no | `""` | Explicit config file to load (maps to `--config`). Empty uses the normal config search. |
| `working-directory` | no | `""` | Directory to resolve config and locale files against (maps to `--cwd`). |
| `dry-run` | no | `"false"` | Report what would change without calling a provider or writing (maps to `--dry-run`). |
| `node-version` | no | `"24"` | Node.js version to set up for running the CLI. |

The action declares no outputs. Its results are delivered as annotations, a job summary, and the job's exit status.

## Permissions

A composite action cannot declare its own `permissions:`; only the consuming workflow can. Set `permissions:` to least privilege at the workflow or job level. The documented happy path needs only `contents: read`. Do not grant anything broader unless your own surrounding steps require it.

```yaml
permissions:
  contents: read
```

If you add steps that commit the translated files back or open a pull request, grant the extra scope on that job alone rather than widening the whole workflow.

## Secret wiring

Provider API keys are passed via `env:` from `secrets.*`, for example `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`. Keys come only from the environment. A key value is never inlined into YAML and is never passed as an action input. The action and the CLI read keys only from the environment, so a `${{ secrets.* }}` reference in `env:` is the single supported way to provide them.

Each hosted provider reads exactly one variable:

| Provider id | Environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |

The `openai-compatible` provider is the exception: it needs no key for a server that requires none, and otherwise reads `OPENAI_COMPATIBLE_API_KEY` or whichever variable its `apiKeyEnvVar` option names. Pass that variable through `env:` the same way.

Set only the keys your configured provider needs. Each value must be a `${{ secrets.* }}` reference, never a literal:

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
```

Keys are never echoed. The action's own error messages name the variable but never include a value, and annotations built from CLI output are percent-encoded so a value cannot break out of a workflow command.

## Version pinning

Two separate things need pinning, and both matter.

### The `version` input

The `version` input must be pinned to an exact version (for example `version: 0.8.0`) for reproducible, supply-chain-safe CI. Do not use a floating tag such as `latest` and do not use a range. A floating tag pulls whatever is newest at run time, which is non-reproducible and would auto-pull a compromised release. The action enforces this: a `version` that is not an exact semver (a dist-tag, a range, or a `^`/`~` prefix) fails the step before anything is installed.

The action installs the CLI via `npx` at run time, so the pinned `version` is what governs reproducibility: pinning it pins exactly which CLI release runs.

### The action reference itself

`verbatra/action@v1` is a moving major-version tag: it is convenient and it keeps picking up fixes, but it is mutable. It also does not exist yet, as noted in the quick start. The security-conscious form is a full 40-character commit SHA, which is immutable and which works today:

```yaml
      - uses: verbatra/action@<commit-sha> # v1.0.0
```

Pin every `uses:` reference this way, including `actions/checkout` in the example above. Keep the human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot propose the SHA bumps.

## Job summary and annotations

The action writes a job summary to `GITHUB_STEP_SUMMARY` (a per-locale counts table, or a whole-run failure heading) and annotates failures via `::error::` workflow commands. On a per-locale failure it emits one annotation per failed locale; on a whole-run failure it emits one annotation built from the CLI error. The job then exits with the CLI exit code, so a failed translation fails the job, and it does so only after the annotations and the summary have been emitted.

## Requirements

- A GitHub-hosted or self-hosted runner with `bash` available. The action sets up Node.js itself via `actions/setup-node`, so no Node.js step of your own is required.
- Network access to the npm registry, to install `@verbatra/cli` at run time.
- A verbatra config and locale files in the repository.

## The verbatra project

This action is the CI surface of verbatra, not a separate tool. It wraps the same `@verbatra/cli` you run locally, at a version you pin, so a CI run and a developer's run do the same work.

| Where | What it is |
| --- | --- |
| [github.com/verbatra/verbatra](https://github.com/verbatra/verbatra) | The main project: the `@verbatra/cli` command-line tool, the `@verbatra/sdk` programmatic API, and the `@verbatra/studio` local dashboard. |
| [`@verbatra/cli` on npm](https://www.npmjs.com/package/@verbatra/cli) | The package this action installs and runs. |
| [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) | The documentation site, including the [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli). |

Issues about translation behavior, formats, providers, or the CLI itself belong in the [main repository](https://github.com/verbatra/verbatra/issues). Issues about the action's inputs, annotations, or job summary belong [here](https://github.com/verbatra/action/issues).

## Security

Provider API keys are never accepted as an action input. They are read only from the environment, passed in from `${{ secrets.* }}`, and an error message names the variable but never its value. Every `uses:` reference in this repository is pinned to a full commit SHA, the lockfile is committed and CI installs are frozen, and the `version` input is rejected unless it is an exact semver version. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Documentation

The hosted documentation site at [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) is the canonical reference. The [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action) covers this action in the context of a full project, and the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli) documents every command and flag the action runs on your behalf.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first; they follow the main project's guidelines, with the differences this repository actually has (npm rather than pnpm, no changesets, no commit hook). Commits here follow Conventional Commits. Run `npm ci && npm test` before opening a pull request; the same suite runs in CI on Node 22.14.0 and 24, alongside a job that runs the action against itself.

## License

[MIT](./LICENSE) (c) Mario Kreitz

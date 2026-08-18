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

verbatra is an i18n translation automation tool: it reads your locale files, works out what is missing or has drifted since the source last changed, and fills the gaps through the AI or machine-translation provider you choose, enforcing placeholder and ICU integrity on every result.

This composite action runs one of `verbatra translate --json`, `verbatra check --json`, or `verbatra diff --json`, turns the result into GitHub annotations and a job-summary table, and propagates the CLI exit code so the job fails when the command fails. The read-only commands make it a CI gate as well as a translator: `check` and `diff` need no provider API key, so they gate a pull request without spending anything.

At run time it installs [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) and [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk) at the pinned `version` into a temporary scratch directory of its own, then runs that install against your project with `--cwd`. The action carries no bundled CLI, picking a release is a one-line change, and nothing is ever written into your repository's own `node_modules`: not a merged install, not a symlink, not a directory. A `verbatra.config.ts` that does `import { defineConfig } from "@verbatra/cli"` (or from `@verbatra/sdk`) still resolves the exact pinned packages, because since 0.9.3 the SDK points the TypeScript config loader's bare-specifier resolution at the packages installed alongside the SDK that is actually running, rather than at whatever happens to sit next to the config file. That is why `version` must be 0.9.3 or newer; see [The `version` input](#the-version-input).

## Quick start

Add the action to a workflow. It needs a verbatra config in the repository (for example `verbatra.config.ts` or `.verbatrarc.json`) and the API key of your configured provider, passed from `secrets`:

> The examples below use `verbatra/action@v2`, the moving major tag that tracks the latest v2 release. It is the convenient form. For an immutable pin, replace it with a full commit SHA; see [The action reference itself](#the-action-reference-itself).

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
      - uses: verbatra/action@v2
        with:
          version: 0.9.3
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

See [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file) for the config reference and [Providers](https://verbatra.kreitz-webdev.de/docs/providers) for the provider options.

### Preview without spending

Set `dry-run: true` to report what would change without calling a provider and without writing any file. A dry run never constructs a provider, so it needs no API key at all.

```yaml
      - uses: verbatra/action@v2
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
      - uses: verbatra/action@v2
        with:
          version: 0.9.3
          command: check
```

The step fails when any locale has missing or stale keys, and the job summary names the drifted locales and their counts, so the reason is visible without opening the log.

## Choosing a command

The `command` input selects which CLI command runs. All three report through the same annotations and job summary; they differ in what they do and what they cost.

| Command | Writes files | Needs an API key | Fails the step when |
| --- | --- | --- | --- |
| `translate` (default) | yes | yes | translation fails for a locale |
| `translate` with `dry-run: "true"` | no | no | translation could not be planned |
| `check` | no | no | any locale has missing or stale keys |
| `diff` | no | no | any locale has pending changes |

- Use **`check`** as a pull-request gate. It answers "are the locale files in sync" with per-locale counts of missing, stale, and up-to-date keys. It is the smallest, fastest signal.
- Use **`diff`** when you want the same gate but need to see *which* keys are pending. It reports the key names per locale, split into missing and changed, which is what you want when a reviewer has to act on the result.
- Use **`translate --dry-run`** when you want to preview the work a real translation run would do, in translate's own terms (translated, unchanged, integrity-withheld, and provider-failure counts). It models the write path without writing.

Two behaviours worth knowing, both of which the action reports as the CLI does:

- Orphaned keys (present in a target locale but no longer in the source) are reported but are **not** a failure. A locale whose only difference is an orphan exits 0. `diff` lists orphans in the job summary so they stay visible; `check` has no orphan signal at all.
- `dry-run` applies only to `translate`. Combining it with `check` or `diff` fails the step rather than being silently ignored, because those commands are already read-only and the CLI itself rejects the flag.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | yes | none | The `@verbatra/cli` version to run, for example `0.9.3`. Must be an exact semver version; a dist-tag such as `latest`, a range, or a `^`/`~` prefix fails the step. Must also be `0.9.3` or newer; an older pin fails the step. See [The `version` input](#the-version-input). |
| `command` | no | `translate` | Which command to run: `translate`, `check`, or `diff`. See [Choosing a command](#choosing-a-command). Any other value fails the step. |
| `config-path` | no | `""` | Explicit config file to load (maps to `--config`). A relative path resolves against `working-directory`, not against the repository root. Empty uses the normal config search. |
| `working-directory` | no | `""` | Directory to resolve config and locale files against (maps to `--cwd`). |
| `dry-run` | no | `"false"` | Report what would change without calling a provider or writing (maps to `--dry-run`). Applies only to `translate`; combining it with `check` or `diff` fails the step. |
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

The `version` input must be pinned to an exact version (for example `version: 0.9.3`) for reproducible, supply-chain-safe CI. Do not use a floating tag such as `latest` and do not use a range. A floating tag pulls whatever is newest at run time, which is non-reproducible and would auto-pull a compromised release. The action enforces this: a `version` that is not an exact semver (a dist-tag, a range, or a `^`/`~` prefix) fails the step before anything is installed.

The action installs the CLI at run time into a scratch directory of its own and runs it against `working-directory` (or the repository root if unset) via `--cwd`, so the pinned `version` is what governs reproducibility: pinning it pins exactly which CLI release runs.

`version` must also be `0.9.3` or newer, and the action rejects an older pin with a message saying so. Before 0.9.3, loading a `verbatra.config.ts` that does `import { defineConfig } from "@verbatra/cli"` (or from `@verbatra/sdk`) resolved that import from the config file's own location, so it either failed outright, when the project has no such dependency installed, or bound silently to a different, unpinned copy of the package. Earlier releases of this action worked around it by symlinking the pinned packages into the consuming repository's `node_modules`, which meant writing into a directory the action does not own. 0.9.3 fixed the resolution in the SDK itself, so the workaround is gone and the floor exists to keep an old pin from silently falling back into the original bug. There is nothing to migrate other than the pinned number: 0.9.2 was never published, so the next release below the floor is 0.9.1.

### The action reference itself

`verbatra/action@v2` is a moving major-version tag: it resolves to the latest v2 release, so it is convenient and it keeps picking up fixes, but it is mutable and the code behind it can change without the reference changing. The security-conscious form is a full 40-character commit SHA, which is immutable and cannot be repointed:

```yaml
      - uses: verbatra/action@0288e936b7d995def3c64928b0b9558f3662cbf7 # v2.0.0
```

Pin every `uses:` reference this way, including `actions/checkout` in the example above. Keep the human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot propose the SHA bumps.

## Upgrading from v1

`v1` is legacy. `v2` is the only supported, recommended tag, used throughout this README, and every new workflow should use it with `version` pinned to the current `@verbatra/cli` release. `v2` drops the `node_modules` symlink workaround described in [The `version` input](#the-version-input) entirely and adds a floor on the `version` input: `0.9.3` or newer. `v1` never enforced a minimum `version`, so a `version` pin below `0.9.3` fails the step under `v2` where it previously would have silently fallen back to the workaround. That is the only breaking change.

`v1` still resolves, to `v1.1.4`, so an existing `@v1` workflow does not break outright. `v1.1.4` stopped merging the CLI install into your repository's `node_modules` (see [PR #9](https://github.com/verbatra/action/pull/9)), but it still symlinks the pinned packages into that same directory and enforces no minimum `version`, so it still carries real, known risk: a `version` pin left below `0.9.3` on `v1` falls straight back into the resolution bug the symlink was built to paper over. `v2` removes that write into your tree entirely. Existing `@v1` users should migrate to `@v2` rather than treat it as an equally valid alternative; `v1` is kept working only for continuity while that migration happens, not as an ongoing option to opt into.

## Job summary and annotations

The action writes a job summary to `GITHUB_STEP_SUMMARY` (a per-locale counts table, or a whole-run failure heading) and annotates failures via `::error::` workflow commands. Each command renders its own table: translated and integrity counts for `translate`, missing/stale/up-to-date counts for `check`, and missing/changed/orphaned counts plus the pending key names for `diff`. When the step fails, the summary states why in one line, so the cause is readable without opening the log.

On a per-locale failure it emits one annotation per affected locale; on a whole-run failure it emits one annotation built from the CLI error. The job then exits with the CLI exit code, so a failed run fails the job, and it does so only after the annotations and the summary have been emitted.

Every value taken from CLI output, including locale and key names, is percent-encoded in annotations and escaped in the job summary, so a crafted key cannot forge a workflow command or inject markdown structure.

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

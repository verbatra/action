<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/action/main/.github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra GitHub Action</h1>

<p align="center">
  Run verbatra translations in CI, or gate a pull request on locale drift, with annotations and a job summary.
</p>

<p align="center">
  <a href="https://github.com/verbatra/action/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/action/ci.yml?branch=main&amp;label=Action%20CI&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="Action CI" /></a>
  <a href="https://github.com/marketplace/actions/verbatra"><img src="https://img.shields.io/github/v/release/verbatra/action?sort=semver&amp;label=marketplace&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="GitHub Marketplace release" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&amp;color=7b1fa2&amp;labelColor=0B0B12" alt="@verbatra/cli npm version" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/action"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/action?label=openssf%20scorecard&amp;labelColor=0B0B12" alt="OpenSSF Scorecard" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?color=7b1fa2&amp;labelColor=0B0B12" alt="License: MIT" /></a>
</p>

## What's new

v1.3.0 adds the `qa`, `qa-severity`, `qa-strict`, `require-reviewed`, `sensitive`, and `locales` inputs, the `needs-human` output, and a Node.js check before the CLI installs. See [CHANGELOG.md](./CHANGELOG.md) for every release, and [Releases](https://github.com/verbatra/action/releases) for the published notes.

## Quick start

verbatra reads your locale files, finds what is missing or has drifted since the source changed, and fills the gaps through the AI or machine-translation provider you configure. `working-directory` (the repository root by default) needs a verbatra config file directly inside it, for example `verbatra.config.ts` or `.verbatrarc.json`, plus the API key of your provider, passed from `secrets`:

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
          version: 0.12.0
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

`v1` is the moving tag that tracks the latest release; see [Versioning](#versioning) for an immutable pin. See [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file) and [Providers](https://verbatra.kreitz-webdev.de/docs/providers) for the full reference.

## Examples

The snippets below show the action step; wrap them in a workflow like the one above.

### Preview without spending

`dry-run: "true"` reports what would change without calling a provider or writing a file. It never constructs a provider, so it needs no API key.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          dry-run: "true"
```

### Gate a pull request

`command: check` fails a pull request whose locale files have drifted from the source. It is read-only and needs no API key or `secrets` wiring, so it also runs on pull requests from forks.

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
          version: 0.12.0
          command: check
```

The step fails when any locale has missing or stale keys, and the job summary names the drifted locales and their counts.

### Check translation quality

`qa: "true"` with `command: check` runs `verbatra check --qa`: the placeholder, markup, ICU, and plural checks and the review flags over every committed target value, including ones typed by hand. It is read-only and keyless, and needs `version` `0.12.0` or newer. A `0.12.0` prerelease is rejected on purpose: semver ranks it below the release, and it is not guaranteed to carry the final contract.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          qa: "true"
```

Each finding becomes an annotation naming the locale, key, and reason: `::error::` for a value the integrity gate would refuse, `::warning::` for a review reason. The step fails on any error. Add `qa-strict: "true"` to fail on warnings too, or `qa-severity: error` to report errors only (the CLI rejects `error` together with `qa-strict`, with exit code 2). `check` also warns, once per locale, about plurals that lack a CLDR plural category the target language uses (`PLURAL_CATEGORIES_INCOMPLETE`).

### Require reviewed translations

`require-reviewed: "true"` with `command: check` fails the step while any machine-written translation (origin `machine`, `memory`, `fuzzy`, or `agent`) is not approved in the committed `verbatra.provenance.json`, where Studio and the MCP review tools record decisions. It is read-only, keyless, combines with `qa`, and needs `version` `0.12.0` or newer.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          require-reviewed: "true"
```

Each locale with unapproved keys gets one `REVIEW_REQUIRED` error annotation naming them. A corrupt `verbatra.provenance.json`, or one from a newer verbatra, fails the gate with `REVIEW_STATE_UNREADABLE`.

### Scan for sensitive content

`sensitive: "true"` with `command: check` scans the source file and glossary for content that looks sensitive, such as emails, keys, or card numbers, and fails on any finding. It is read-only, keyless, and needs `version` `0.12.0` or newer.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          sensitive: "true"
```

### Limit a run to some locales

`locales` takes a comma-separated subset of the configured target locales and works with `translate`, `check`, and `diff` on every supported CLI version.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          command: check
          locales: "de,fr"
```

### Translate a monorepo app

`working-directory` must contain a recognized config file directly inside it. The lookup never walks up into a parent directory or the repository root, so a config at the outer root does not satisfy it. Set `config-path` to load a config from somewhere else.

```yaml
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
          working-directory: apps/docs
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Hand keys to a person (human-only mode)

A config with `provider: { id: "none" }` disables machine translation: `translate` fills keys only from exact translation-memory hits, reads no API key, and leaves the rest for a person. When it leaves any, the CLI exits `3`. That passes the step, writes one `::warning::` per locale naming the keys, and sets the `needs-human` output to `"true"`. Branch on it to hand the keys off, for example with `verbatra export`. Exit `3` needs `@verbatra/cli` `0.12.0` or newer; from `check` or `diff` it still fails the step.

```yaml
      - uses: verbatra/action@v1
        id: verbatra
        with:
          version: 0.12.0
      - if: steps.verbatra.outputs.needs-human == 'true'
        run: echo "Some keys need a human translation; see the job summary."
```

### Translate and open a pull request

Run `translate`, then let `peter-evans/create-pull-request` commit the changed locale files to a branch and open a pull request. The job needs `contents: write` and `pull-requests: write`, and the repository setting Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests" must be enabled. A pull request opened with the default `GITHUB_TOKEN` does not trigger other workflows, so your `check` gate will not run on it unless you pass a personal access token or GitHub App token as the `token` input.

```yaml
name: Translate
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: verbatra/action@v1
        with:
          version: 0.12.0
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: peter-evans/create-pull-request@3ffccacd46053766916f087ce41d627c0b8cf2d1 # v8.1.3
        with:
          branch: verbatra/translations
          commit-message: "chore(i18n): update translations"
          title: "chore(i18n): update translations"
          body: "Translations updated by the verbatra action."
```

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
- Use **`diff`** for the same gate when a reviewer needs to see *which* keys are pending. It lists key names per locale, split into missing and changed, and calls out orphaned keys (in a target locale but no longer in the source) separately; those never fail the step on their own.
- Use **`translate --dry-run`** to preview a real run in translate's own terms (translated, unchanged, integrity-withheld, and provider-failure counts) without writing anything.

## Inputs

`version` is the only required input. The table says when each one applies; a value used with the wrong command fails the step before the CLI is installed.

| Input | Default | Applies to |
| --- | --- | --- |
| `version` | none (required) | every command |
| `command` | `translate` | every command |
| `config-path` | empty | every command |
| `working-directory` | empty (repository root) | every command |
| `dry-run` | `"false"` | `translate` only |
| `qa` | `"false"` | `check` only |
| `qa-severity` | empty (errors and warnings) | `check` with `qa` |
| `qa-strict` | `"false"` | `check` with `qa` |
| `require-reviewed` | `"false"` | `check` only |
| `sensitive` | `"false"` | `check` only |
| `locales` | empty (every target locale) | `translate`, `check`, `diff` |
| `node-version` | `"24"` | every command |

The reference below is generated from [`action.yml`](./action.yml).

<!-- start usage -->
```yaml
- uses: verbatra/action@v1
  with:
    # Exact @verbatra/cli version to install, for example 0.12.0. Must be 0.9.3 or newer;
    # tags, ranges and prefixes are rejected.
    version: ''

    # The verbatra command to run: "translate" (default), "check" or "diff". The last two
    # are read-only and need no API key.
    # Default: translate
    command: translate

    # Config file to load (--config). A relative path resolves against working-directory.
    # When empty, a config must exist directly inside working-directory; parent
    # directories are never searched.
    # Default: ''
    config-path: ''

    # Directory holding the verbatra config and locale files (--cwd). Defaults to the
    # repository root; in a monorepo, set it to the app directory.
    # Default: ''
    working-directory: ''

    # Preview a translate run without calling a provider or writing files (--dry-run).
    # Only valid with command translate. "true" or "false".
    # Default: false
    dry-run: "false"

    # Run the quality check over every committed translation and annotate each finding
    # (--qa). Only valid with command check; needs CLI 0.12.0 or newer. "true" or "false".
    # Default: false
    qa: "false"

    # Lowest quality-check severity to report, "error" or "warning" (--severity). Empty
    # reports both. Requires qa; "error" cannot be combined with qa-strict.
    # Default: ''
    qa-severity: ''

    # Also fail when the quality check reports only warnings (--strict). Requires qa.
    # "true" or "false".
    # Default: false
    qa-strict: "false"

    # Fail while any machine-written translation is not approved in
    # verbatra.provenance.json (--require-reviewed). Only valid with command check; needs
    # CLI 0.12.0 or newer. "true" or "false".
    # Default: false
    require-reviewed: "false"

    # Scan the source file and glossary for sensitive content such as emails, keys or card
    # numbers, and fail on any finding (--sensitive). Only valid with command check; needs
    # CLI 0.12.0 or newer. "true" or "false".
    # Default: false
    sensitive: "false"

    # Comma-separated subset of target locales, for example "de,fr" (--locales). Empty
    # runs every target locale. Only letters, digits, "-", "_" and commas are accepted.
    # Default: ''
    locales: ''

    # Node.js version to set up. For CLI 0.13.0 or newer it must be 22.22.0 or newer on
    # the 22 line, or an even-numbered line from 24 up. Older CLI rules are in the README.
    # Default: 24
    node-version: "24"
```
<!-- end usage -->

`version` names the `@verbatra/cli` release the action installs. It is a different number from the action's own `v1` tag in `uses:`; see [Versioning](#versioning).

## Outputs

| Output | Value |
| --- | --- |
| `needs-human` | `"true"` when `translate` exited 3 because machine translation is disabled by policy and keys are left for a person, otherwise `"false"` |

Everything else is delivered as annotations, a job summary, and the job's exit status. See [Hand keys to a person](#hand-keys-to-a-person-human-only-mode).

## Job summary and annotations

Every run writes a job summary to `GITHUB_STEP_SUMMARY` and annotates failures with `::error::` workflow commands, then exits with the CLI's own exit code, after the annotations and summary are emitted. The exception is `translate` exiting `3`, which passes the step.

- GitHub shows at most 10 annotations of each severity per step, so past that the action adds one notice counting the rest. The job summary is the full report.
- A per-locale annotation names the locale file (`file=`) when it can be resolved from the config's `files.pattern` within 10 seconds, so GitHub shows it in the pull request's changed files.
- A `translate` locale is `ok`, `partial` (written, but some keys withheld), or `failed`; `partial` gets its own `LOCALE_PARTIAL` annotation.
- A whole-run failure shows the error code, the wrapped cause, and the CLI's `hint` as a `Next step:`. Every code is on [Error codes](https://verbatra.kreitz-webdev.de/docs/error-codes), and every exit code on [Exit codes and JSON output](https://verbatra.kreitz-webdev.de/docs/cli/output#exit-codes).

The full behavior, including the JSON schemas the action reads, is in the [GitHub Action guide](https://verbatra.kreitz-webdev.de/docs/github-action).

## Permissions

A composite action cannot declare its own `permissions:`; only the consuming workflow can. The `translate`, `check`, and `diff` examples above need only `contents: read`. Grant more on the job that needs it, as in [Translate and open a pull request](#translate-and-open-a-pull-request), rather than widening the whole workflow.

```yaml
permissions:
  contents: read
```

## Secret wiring

API keys come only from environment variables, never from action inputs or a literal in YAML. Pass yours via `env:` from `secrets.*`, using the variable your provider reads:

| Provider id | Environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |
| `google-translate` | `GOOGLE_TRANSLATE_API_KEY` |
| `opencode` | `OPENCODE_API_KEY`; needs CLI 0.12.0 or newer |
| `openai-compatible` | `OPENAI_COMPATIBLE_API_KEY`, or the variable named by `provider.options.apiKeyEnvVar`; omit entirely for a server that needs no key. An `apiKeyEnvVar` naming `OPENCODE_API_KEY` is rejected (`CONFIG_INVALID`): use the `opencode` provider instead |
| `libretranslate` | `LIBRETRANSLATE_API_KEY`, only when your server requires a key |
| `none` | none; machine translation is disabled and keys are left for a person; needs CLI 0.12.0 or newer |

Set only the keys your configured provider needs, each as a `${{ secrets.* }}` reference, never a literal. The action's error messages name the variable but never a value.

## Requirements

- A GitHub-hosted or self-hosted runner with `bash`, on Actions Runner v2.327.1 or newer. The action sets up Node.js itself via `actions/setup-node` v7.1.0, which runs on the `node24` runtime, so no Node.js step of your own is required.
- Network access to the npm registry, to install `@verbatra/cli` at run time.
- A verbatra config directly inside the resolved `working-directory`, plus locale files there.
- A `node-version` the pinned CLI supports. The step fails before installing the CLI when it resolves outside the range:

| `version` | Accepted Node.js |
| --- | --- |
| `0.13.0` or newer (a prerelease included) | 22.22.0 or newer on the 22 line, or an even-numbered line from 24 up (for example 24 or 26); stricter than the CLI's own `engines` range |
| `0.12.x` | 22.18.0 or newer on the 22 line, or 24 or newer |
| older than `0.12.0` | 22.14.0 or newer |

## Versioning

`v1` is the only maintained line: every fix and feature lands there. Pin `v1` for convenience (it moves to the latest `v1.x.y` release), a specific `v1.x.y` tag for an immutable minor pin, or a full commit SHA for the most reproducible reference:

```yaml
      - uses: verbatra/action@84f75d2058654ada874a862df4ed0b41e9dd15a9 # v1.3.0
```

Keep the human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot propose the SHA bumps.

The `version` input needs pinning too. It must be an exact semver `@verbatra/cli` release, `0.9.3` or newer, never a floating tag such as `latest` or a range: a floating reference pulls whatever is newest at run time, which is not reproducible and would auto-pull a compromised release. The action rejects anything else before installing. The `0.9.3` floor exists because earlier CLI releases resolve a `verbatra.config.ts` import of `defineConfig` against the config file's own location instead of the running CLI.

## Security

API keys are read only from the environment and never accepted as an input; every `uses:` reference here is pinned to a full commit SHA, and the `version` input must be an exact semver. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first. Issues about translation behavior, formats, providers, or the CLI belong in the [main repository](https://github.com/verbatra/verbatra/issues); issues about this action's inputs, annotations, or job summary belong [here](https://github.com/verbatra/action/issues). Run `npm ci && npm test` before opening a pull request.

## License

[MIT](./LICENSE) (c) Mario Kreitz

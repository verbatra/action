# verbatra GitHub Action

Run [verbatra](https://github.com/mariokreitz/verbatra) i18n translations in CI, annotate failures,
and write a job summary.

verbatra is an i18n translation automation tool: it reads your locale files, works out what is
missing or has drifted since the source last changed, and fills the gaps through an AI translation
provider while enforcing placeholder and ICU integrity on every result.

This composite action runs `verbatra translate --json`, turns the result into GitHub annotations
and a job-summary table, and propagates the CLI exit code so the job fails when translation fails.
At run time it installs `@verbatra/cli` at the pinned `version` via `npx` and runs it, so the
action carries no bundled CLI of its own.

## Usage

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
      - uses: mariokreitz/verbatra-action@v1
        with:
          version: 0.7.1
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The action expects a verbatra config in the repository (for example `.verbatrarc.json` or
`verbatra.config.ts`). See the [verbatra documentation](https://verbatra.kreitz-webdev.de) for the
config reference.

### Preview without spending

Set `dry-run: true` to report what would change without calling a provider and without writing any
file. A dry run never constructs a provider, so it needs no API key at all. It is the cheapest way
to gate a pull request on "are the locale files in sync".

```yaml
      - uses: mariokreitz/verbatra-action@v1
        with:
          version: 0.7.1
          dry-run: "true"
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | yes | none | The `@verbatra/cli` version to run, for example `0.7.1`. Must be an exact semver version; a dist-tag such as `latest`, a range, or a `^`/`~` prefix fails the step. |
| `config-path` | no | `""` | Explicit config file to load (maps to `--config`). Empty uses the normal config search. |
| `working-directory` | no | `""` | Directory to resolve config and locale files against (maps to `--cwd`). |
| `dry-run` | no | `"false"` | Report what would change without calling a provider or writing (maps to `--dry-run`). |
| `node-version` | no | `"24"` | Node.js version to set up for running the CLI. |

The action declares no outputs. Its results are delivered as annotations, a job summary, and the
job's exit status.

## Permissions

A composite action cannot declare its own `permissions:`; only the consuming workflow can. Set
`permissions:` to least privilege at the workflow or job level. The documented happy path needs
only `contents: read`. Do not grant anything broader unless your own surrounding steps require it.

```yaml
permissions:
  contents: read
```

If you add steps that commit the translated files back or open a pull request, grant the extra
scope on that job alone rather than widening the whole workflow.

## Secret wiring

Provider API keys are passed via `env:` from `secrets.*`, for example
`ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`. Keys come only from the environment. A key
value is never inlined into YAML and is never passed as an action input. The action and the CLI
read keys only from the environment, so a `${{ secrets.* }}` reference in `env:` is the single
supported way to provide them.

Each hosted provider reads exactly one variable:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `DEEPL_API_KEY`

The `openai-compatible` provider is the exception: it needs no key for a server that requires none,
and otherwise reads `OPENAI_COMPATIBLE_API_KEY` or whichever variable its `apiKeyEnvVar` option
names. Pass that variable through `env:` the same way.

Set only the keys your configured provider needs. Each value must be a `${{ secrets.* }}`
reference, never a literal:

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  DEEPL_API_KEY: ${{ secrets.DEEPL_API_KEY }}
```

Keys are never echoed. The action's own error messages name the variable but never include a value,
and annotations built from CLI output are percent-encoded so a value cannot break out of a workflow
command.

## Version pinning

Two separate things need pinning, and both matter.

### The `version` input

The `version` input MUST be pinned to an exact version (for example `version: 0.7.1`) for
reproducible, supply-chain-safe CI. Do not use a floating tag such as `latest` and do not use a
range. A floating tag pulls whatever is newest at run time, which is non-reproducible and would
auto-pull a compromised release. The action enforces this: a `version` that is not an exact semver
(a dist-tag, a range, or a `^`/`~` prefix) fails the step before anything is installed.

The action installs the CLI via `npx` at run time, so the pinned `version` is what governs
reproducibility: pinning it pins exactly which CLI release runs.

### The action reference itself

`mariokreitz/verbatra-action@v1` is a moving major-version tag: it is convenient and it keeps
picking up fixes, but it is mutable. The security-conscious form is a full 40-character commit SHA,
which is immutable:

```yaml
      - uses: mariokreitz/verbatra-action@<commit-sha> # v1.0.0
```

Pin every `uses:` reference this way, including `actions/checkout` in the example above. Keep the
human-readable version in a trailing comment so the pin stays reviewable, and let Dependabot
propose the SHA bumps.

## Job summary and annotations

The action writes a job summary to `GITHUB_STEP_SUMMARY` (a per-locale counts table, or a whole-run
failure heading) and annotates failures via `::error::` workflow commands. On a per-locale failure
it emits one annotation per failed locale; on a whole-run failure it emits one annotation built
from the CLI error. The job then exits with the CLI exit code, so a failed translation fails the
job, and it does so only after the annotations and the summary have been emitted.

## Requirements

- A GitHub-hosted or self-hosted runner with `bash` available. The action sets up Node.js itself
  via `actions/setup-node`, so no Node.js step of your own is required.
- Network access to the npm registry, to install `@verbatra/cli` at run time.
- A verbatra config and locale files in the repository.

## License

MIT. See [LICENSE](LICENSE).

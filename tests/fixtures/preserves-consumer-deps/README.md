Regression fixture for the invariant that the action never writes into the
consumer's own node_modules at all.

Two historical bugs motivated it, both from a run step that installed the CLI
into a scratch directory and then reached into the consumer's tree:

- The run step used to merge the scratch install into the consumer's
  node_modules with `cp -a scratch/node_modules/. working-directory/node_modules/`,
  with the exit code of `cp` never checked. A name collision with a real
  consumer dependency that pnpm left as a symlink made `cp` fail outright on
  that entry, and the CLI then crashed with a raw exception from deep inside a
  mismatched transitive dependency instead of a clean verbatra error. A name
  collision with a real consumer dependency directory (plain npm, no symlink
  involved) merged silently: no error, but the consumer's own dependency
  version was overwritten on disk with whatever version the CLI's own
  transitive dependency tree happened to pull in.
- The narrower replacement symlinked only `@verbatra/cli` and `@verbatra/sdk`
  from the scratch install into `working-directory/node_modules/@verbatra/`, so
  that a `verbatra.config.ts` doing `import { defineConfig } from "@verbatra/cli"`
  resolved the pinned packages. It still created entries inside a directory the
  action does not own. `@verbatra/sdk` 0.9.3 makes it unnecessary: the SDK now
  points jiti's bare-specifier resolution at the packages installed alongside
  the running SDK, so a `.ts` config resolves correctly with nothing linked into
  the consumer's tree at all.

`node_modules/zod/package.json` and `node_modules/debug/package.json` here stand
in for a consumer's own dependencies of those names, both of which are real
transitive dependencies of `@verbatra/cli` today. Their version field is a
sentinel, `0.0.0-consumer-owned-do-not-touch`, that no real package will ever
have.

The CI assertion that follows this fixture's run checks two things: those two
tracked files still carry the sentinel version, and `git status --porcelain`
reports nothing at all under this fixture's node_modules. The second half is
what catches an added entry rather than a modified one, which is why this
fixture's node_modules is deliberately un-ignored in `.gitignore`. Keep both
halves: the specific past bugs are structurally impossible now, but "the action
does not write into the consumer's node_modules" is the invariant worth guarding
forever.

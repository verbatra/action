Regression fixture for the node_modules merge bug fixed alongside this
fixture: the run step used to install the CLI into an isolated scratch
directory, then run `cp -a scratch/node_modules/. working-directory/node_modules/`
to merge that scratch install into the consumer's own node_modules, with the
exit code of `cp` never checked. Two confirmed failure modes came out of
that merge:

- A name collision with a real consumer dependency that pnpm left as a
  symlink made `cp` fail outright on that entry, and the CLI then crashed
  with a raw exception from deep inside a mismatched transitive dependency
  instead of a clean verbatra error.
- A name collision with a real consumer dependency directory (plain npm,
  no symlink involved) merged silently: no error, but the consumer's own
  dependency version was overwritten on disk with whatever version the CLI's
  own transitive dependency tree happened to pull in.

`node_modules/zod/package.json` and `node_modules/debug/package.json` here
stand in for a consumer's own dependencies of those names, both of which are
real transitive dependencies of `@verbatra/cli` today. Their version field is
a sentinel, `0.0.0-consumer-owned-do-not-touch`, that no real package will
ever have. The fix runs the CLI from its own scratch install via `--cwd`
instead of merging into the consumer's node_modules, so these two files must
still contain that exact sentinel version after the action runs. If a future
change reintroduces the merge, this is the entry that catches it.

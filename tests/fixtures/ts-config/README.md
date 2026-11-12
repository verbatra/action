A verbatra.config.ts fixture, in sync, used to exercise the TypeScript config
path specifically. verbatra.config.ts is the format `verbatra init` scaffolds
by default and what real consumers actually use, so this fixture exists to
catch anything that only breaks on a TS config (cosmiconfig-typescript-loader,
module resolution of `defineConfig` from the installed package) which the
JSON-config fixtures (in-sync, dry-run) cannot exercise.

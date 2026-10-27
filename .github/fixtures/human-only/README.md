# Human-only self-test fixture

The config sets `provider: { id: "none" }` and `de.json` is empty, so `translate` leaves keys for a person and exits 3. The step must pass with the `needs-human` output set to `"true"`. No provider is constructed and no key is read. Needs `@verbatra/cli` 0.12.0.

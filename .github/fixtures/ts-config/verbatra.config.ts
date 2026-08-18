import { defineConfig } from "@verbatra/cli";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
});

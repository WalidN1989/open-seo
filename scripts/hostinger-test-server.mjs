// Compatibility test only: no migrations, tickers, mailbox bridge, or jobs.
import { execFileSync } from "node:child_process";
import { preview } from "vite";

process.env.OPENSEO_TELEMETRY_DISABLED = "1";
execFileSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "scripts/write-runtime-dev-vars.ts",
    "dist/server/.dev.vars",
  ],
  { stdio: "inherit" },
);

await preview({
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 3001,
    strictPort: true,
  },
});

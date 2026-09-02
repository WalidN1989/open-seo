import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const runtimeVariableNames = [
  "AUTH_MODE",
  "ANTHROPIC_API_KEY",
  "AUTUMN_SECRET_KEY",
  "AUTUMN_WEBHOOK_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BYPASS_EMAIL_VERIFICATION",
  "DATABASE_PROVIDER",
  "DATAFORSEO_API_KEY",
  "GDPR_ERASURE_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "INTERNAL_CRON_SECRET",
  "LOOPS_API_KEY",
  "LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID",
  "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENSEO_VOICE_ANTHROPIC_API_KEY",
  "OPENSEO_VOICE_DEEPGRAM_API_KEY",
  "POLICY_AUD",
  "POSTGRES_DATABASE_URL",
  "POSTHOG_HOST",
  "POSTHOG_PUBLIC_KEY",
  "SELFHOSTED_ALLOWED_EMAILS",
  "TEAM_DOMAIN",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_SITE_KEY",
  "VOICE_AI_MODEL",
] as const;

const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error("Usage: write-runtime-dev-vars.ts <output-path>");
}

const contents = runtimeVariableNames
  .flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [`${name}=${JSON.stringify(value)}`];
  })
  .join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${contents}\n`, { mode: 0o600 });
await chmod(outputPath, 0o600);

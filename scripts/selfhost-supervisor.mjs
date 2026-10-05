import { spawn } from "node:child_process";

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  // workerd is a child of Vite. Wait for Vite to dispose Miniflare, then bound
  // shutdown so an unresponsive worker cannot keep the container alive.
  const deadline = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 5_000);
  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once("exit", resolve);
        }),
    ),
  ).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
}

function start(name, args) {
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  children.push(child);
  child.once("error", (error) => {
    console.error(`[supervisor] ${name} failed to start: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[supervisor] ${name} exited (${code ?? signal}); restarting container`,
      );
      stop(1);
    }
  });
}

process.once("SIGTERM", () => stop(0));
process.once("SIGINT", () => stop(0));
start("server", [
  "node_modules/vite/bin/vite.js",
  "preview",
  "--host",
  "0.0.0.0",
  "--port",
  process.env.PORT ?? "3001",
]);
if (process.env.INTERNAL_CRON_SECRET) {
  start("ticker", ["--import", "tsx", "scripts/internal-ticker.ts"]);
  start("mail bridge", ["--import", "tsx", "scripts/mail-bridge.ts"]);
} else {
  console.warn(
    "[supervisor] INTERNAL_CRON_SECRET not set; background jobs will NOT run.",
  );
}

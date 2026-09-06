import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import type { AssistantConfig } from "./assistantQuery";

/** Whether this business has a Claude connection, and where to fix it. */
export function AssistantStatusBanner({ ai }: { ai: AssistantConfig["ai"] }) {
  return (
    <section
      className={`rounded-xl border p-4 ${ai.connected ? "border-success/40 bg-success/5" : "border-warning/50 bg-warning/10"}`}
    >
      <div className="flex items-start gap-3">
        <Bot className="mt-0.5 size-5 shrink-0" />
        <div className="text-sm">
          {ai.connected ? (
            <p>
              <span className="font-medium">Claude is connected</span> for this
              business
              {ai.keySource === "integration"
                ? " with its own API key."
                : ai.keySource === "platform"
                  ? " using the platform key."
                  : ", but no API key resolves. Re-enter the key under Integrations."}
            </p>
          ) : (
            <p>
              <span className="font-medium">Claude is not connected.</span>{" "}
              Instant answers and escalation still work; AI replies start once
              you connect Claude Haiku under{" "}
              <Link to="/modules/integrations" className="link link-primary">
                Integrations
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

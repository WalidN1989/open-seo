import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, KeyRound, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { captureClientEvent } from "@/client/lib/posthog";

export const Route = createFileRoute("/_authenticated/oauth-consent")({
  component: OAuthConsentPage,
});

const SCOPE_COPY: Record<string, { label: string; description: string }> = {
  offline_access: {
    label: "Stay connected",
    description: "Refresh access without asking you to sign in every time.",
  },
  mcp: {
    label: "Use Digital Urgency through MCP",
    description: "Projects, SEO tools, reports, and the existing MCP surface.",
  },
  "business:read": {
    label: "Read business and CRM data",
    description: "Customers, leads, quotes, invoices, messages, and history.",
  },
  "business:write": {
    label: "Edit business data and contact customers",
    description:
      "Create and update records, save drafts, and—after your explicit approval—send email, SMS, WhatsApp, or client reports.",
  },
  "voice:read": {
    label: "Read voice-agent data",
    description: "Agents, calls, transcripts, summaries, and recordings.",
  },
  "voice:write": {
    label: "Edit voice-agent settings",
    description: "Prompts, greetings, hours, voices, and agent status.",
  },
};

function OAuthConsentPage() {
  const { data: session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userEmail = session?.user?.email ?? null;
  const requestedScopes = useMemo(() => {
    if (typeof window === "undefined") return ["offline_access", "mcp"];
    const raw = new URLSearchParams(window.location.search).get("scope") ?? "";
    const scopes = raw.split(/\s+/).filter((scope) => scope in SCOPE_COPY);
    return scopes.length ? [...new Set(scopes)] : ["offline_access", "mcp"];
  }, []);

  useEffect(() => {
    captureClientEvent("mcp:consent_viewed");
  }, []);

  async function respond(accept: boolean) {
    setError(null);
    setIsSubmitting(true);
    if (!accept) {
      captureClientEvent("mcp:consent_denied");
    }

    const response = await fetch("/api/oauth/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accept,
        query: window.location.search,
      }),
    });
    const data: {
      redirectTo?: string;
      error?: string;
    } = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Unable to complete authorization.");
      setIsSubmitting(false);
      return;
    }

    if (data.redirectTo) {
      window.location.assign(data.redirectTo);
      return;
    }

    setError("Authorization response did not include a redirect URL.");
    setIsSubmitting(false);
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <img
          src="/digital-urgency-logo.png"
          alt="Digital Urgency"
          className="size-10 rounded-lg"
        />
        <h1 className="mt-5 text-xl font-semibold">Authorize MCP access</h1>
        <p className="mt-2 text-sm text-base-content/70">
          An MCP client is requesting access to your Digital Urgency workspace.
        </p>
      </div>

      {userEmail ? (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2 text-sm">
          <div className="flex size-7 items-center justify-center rounded-full bg-base-300">
            <User className="size-4" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-base-content/60">Signed in as</div>
            <div className="font-medium">{userEmail}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-base-content/60">
          This will allow it to
        </div>
        <ul className="mt-3 space-y-3">
          {requestedScopes.map((scopeName) => {
            const scope = SCOPE_COPY[scopeName];
            const Icon = scopeName === "mcp" ? KeyRound : Database;
            return (
              <li key={scopeName} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-3.5" /> {scope.label}
                  </div>
                  <div className="text-xs text-base-content/60">
                    {scope.description}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={isSubmitting}
          onClick={() => void respond(true)}
        >
          {isSubmitting ? "Authorizing..." : "Authorize"}
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-base-content/50">
        You can revoke access at any time in Settings.
      </p>
    </div>
  );
}

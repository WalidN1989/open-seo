import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { getAuthMode, isHostedClientAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import { ClaudeIcon, CodexIcon } from "@/client/features/ai-mcp/AgentIcons";
import { AvailableTools } from "@/client/features/ai-mcp/AvailableTools";
import {
  CodeBlock,
  Collapsible,
  CopyButton,
} from "@/client/features/ai-mcp/SetupControls";

const SUPPORT_EMAIL = "sales@digitalurgency.com.au";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";
const SKILL_NAMES = [
  "seo-project-setup",
  "seo-coach",
  "keyword-research",
  "keyword-clustering",
  "competitive-landscape",
  "competitor-analysis",
  "link-prospecting",
  "local-seo",
  "seo-audit",
];
const SKILLS_INSTALL = `npx skills add every-app/open-seo`;
const ALL_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*'`;
const CLAUDE_CODE_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent claude-code`;
const CODEX_SKILLS_INSTALL = `npx skills add every-app/open-seo --skill '*' --agent codex`;
const SKILLS_MANUAL_INSTALL = `git clone https://github.com/every-app/open-seo.git

# Codex
mkdir -p ~/.codex/skills
cp -R open-seo/.agents/skills/* ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R open-seo/.agents/skills/* ~/.claude/skills/`;

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

/**
 * What the setup guides say in each mode.
 *
 * Hosted runs the OAuth provider, so a client signs in when prompted.
 * Self-hosted does not — /mcp there takes an API key as a Bearer header — so
 * its commands carry the key and its prose points at Settings rather than at a
 * login that never appears. The key instructions used to be gated to hosted,
 * which hid them in the one mode that requires them. Codex has no header flag
 * and reads a bearer token from an environment variable instead.
 */
function guideCopy(hosted: boolean, mcpUrl: string) {
  const keyPlaceholder = "oseo_PASTE_YOUR_KEY_HERE";
  if (hosted) {
    return {
      keyPlaceholder,
      urlNote: "Sign in with Digital Urgency when prompted.",
      claudeCommand: `claude mcp add --transport http --scope user openseo ${mcpUrl}`,
      claudeAfter: "Approve the login when prompted.",
      codexCommand: `codex mcp add openseo --url ${mcpUrl}`,
      codexAfter: "Approve the login when prompted.",
      desktopLoginStep: "Approve the Digital Urgency login when prompted.",
    };
  }
  return {
    keyPlaceholder,
    urlNote: "This instance authenticates with an API key rather than a login.",
    claudeCommand: `claude mcp add --transport http --scope user openseo ${mcpUrl} --header "Authorization: Bearer ${keyPlaceholder}"`,
    claudeAfter:
      "Replace the placeholder with your key before running it, then check /mcp in Claude Code.",
    codexCommand: `codex mcp add openseo --url ${mcpUrl} --bearer-token-env-var OPENSEO_API_KEY`,
    codexAfter:
      "Codex reads the key from an environment variable: export OPENSEO_API_KEY with your key in the shell that launches it.",
    desktopLoginStep:
      "This connector flow signs in with OAuth, which a self-hosted instance does not run. Use the Claude Code or Codex command above with an API key instead.",
  };
}

/**
 * Where to get a key, worded for the mode: hosted offers it as the headless
 * alternative to the OAuth login; self-hosted makes it the only way in.
 */
function KeyHint({
  hosted,
  keyPlaceholder,
}: {
  hosted: boolean;
  keyPlaceholder: string;
}) {
  return hosted ? (
    <p className="mt-2 text-xs text-base-content/55">
      For headless or CI setups, use an API key from{" "}
      <Link className="link link-primary" to="/settings">
        Settings
      </Link>{" "}
      instead of the OAuth login.
    </p>
  ) : (
    <p className="mt-2 text-xs text-base-content/55">
      Create one under{" "}
      <Link className="link link-primary" to="/settings">
        Settings → API keys → Create API key
      </Link>
      , then paste it where the commands below say{" "}
      <code className="font-mono">{keyPlaceholder}</code>. It is shown once.
    </p>
  );
}

function AiPage() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;
  const hosted = isHostedClientAuthMode();
  const copy = guideCopy(hosted, mcpUrl);

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-12 md:px-6 md:py-16 pb-24 md:pb-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">AI & MCP</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          Connect your AI agent to Digital Urgency. Run keyword research, SERP
          analysis, domain lookups, and backlink reviews from your editor or
          chat.
        </p>

        {getAuthMode(import.meta.env.AUTH_MODE) === "cloudflare_access" ? (
          <div className="alert alert-warning mt-6 text-sm" role="alert">
            <ShieldAlert className="size-4 shrink-0" />
            <span>
              This instance is behind Cloudflare Access. MCP clients cannot
              connect until Managed OAuth is enabled on your Access application.{" "}
              <a
                href="https://openseo.so/docs/self-hosting/cloudflare#connect-the-mcp-server-through-cloudflare-access"
                target="_blank"
                rel="noreferrer"
                className="link font-medium"
              >
                Setup guide
              </a>
            </span>
          </div>
        ) : null}

        <section className="mt-8">
          <div className="rounded-lg border border-base-300 bg-base-200 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                MCP server URL
              </p>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                onCopy={() => captureClientEvent("mcp:setup_url_copy")}
              />
            </div>
            <code className="mt-2 block break-all font-mono text-sm text-base-content">
              {mcpUrl}
            </code>
          </div>
          <p className="mt-2.5 text-xs text-base-content/55 leading-relaxed">
            Paste this into any MCP client. This URL points at the Digital
            Urgency instance you are using now, whether hosted, self-hosted, or
            local. {copy.urlNote}
          </p>
          <KeyHint hosted={hosted} keyPlaceholder={copy.keyPlaceholder} />
        </section>

        <section className="mt-10">
          <h2 className="text-base font-semibold">Setup guides</h2>
          <p className="mt-1.5 text-sm text-base-content/70">
            Pick your agent.
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="claude-code"
              title="Claude Code"
              subtitle="Add with the CLI"
              icon={<ClaudeIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock
                code={copy.claudeCommand}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "claude-code",
                  })
                }
              />
              <p className="text-sm text-base-content/70">{copy.claudeAfter}</p>
            </Collapsible>

            <Collapsible
              id="claude-desktop"
              title="Claude Desktop"
              subtitle="Add a custom connector"
              icon={<ClaudeIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open <span className="text-base-content">Settings</span> →{" "}
                  <span className="text-base-content">Connectors</span>.
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add custom connector
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above and click Add.</li>
                <li>{copy.desktopLoginStep}</li>
                <li>
                  Optional: after Digital Urgency connects, click{" "}
                  <span className="font-medium text-base-content">
                    Configure
                  </span>
                  , then choose{" "}
                  <span className="font-medium text-base-content">
                    Always Approved
                  </span>
                  , except for any tools you want Claude to ask before using.
                </li>
              </ol>
              <p className="text-xs text-base-content/55 leading-relaxed">
                Requires a Claude Pro, Max, Team, or Enterprise plan.
              </p>
            </Collapsible>

            <Collapsible
              id="codex"
              title="Codex"
              subtitle="Add with the CLI"
              icon={<CodexIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock
                code={copy.codexCommand}
                onCopy={() =>
                  captureClientEvent("mcp:setup_command_copy", {
                    agent: "codex",
                  })
                }
              />
              <p className="text-sm text-base-content/70">{copy.codexAfter}</p>
            </Collapsible>

            <Collapsible
              id="codex-desktop"
              title="Codex Desktop"
              subtitle="Settings → Integrations & MCP"
              icon={<CodexIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open{" "}
                  <span className="text-base-content">
                    Settings → Integrations & MCP
                  </span>
                  .
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add your own
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above.</li>
                <li>{copy.desktopLoginStep}</li>
              </ol>
            </Collapsible>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Digital Urgency Skills</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Skills give Codex and Claude Code reusable SEO workflows that can
            call your Digital Urgency MCP tools when live SERP, keyword,
            backlink, or domain data is needed.
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="skills-add"
              title="Install with skills add"
              subtitle="Recommended cross-agent installer"
            >
              <CodeBlock code={SKILLS_INSTALL} />
              <p className="text-sm text-base-content/70">
                You can also auto-accept each Digital Urgency skill:
              </p>
              <CodeBlock code={ALL_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="claude-code-skills"
              title="Install for Claude Code"
              subtitle="Target Claude Code only"
              icon={<ClaudeIcon className="size-5" />}
            >
              <CodeBlock code={CLAUDE_CODE_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="codex-skills"
              title="Install for Codex"
              subtitle="Target OpenAI Codex only"
              icon={<CodexIcon className="size-5" />}
            >
              <CodeBlock code={CODEX_SKILLS_INSTALL} />
            </Collapsible>
            <Collapsible
              id="manual-skills"
              title="Manual GitHub install"
              subtitle="Clone the repo and copy the skills"
            >
              <CodeBlock code={SKILLS_MANUAL_INSTALL} />
            </Collapsible>
          </div>
          <div className="mt-5">
            <p className="text-sm text-base-content/70 leading-relaxed">
              Start with{" "}
              <span className="font-mono text-base-content">
                /seo-project-setup
              </span>
              . It will ask about your project and save your goals, positioning,
              and competitors to your project context.
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-base-content/50">
              Available skills
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm text-base-content/70 sm:grid-cols-2">
              {SKILL_NAMES.map((skill) => (
                <li key={skill} className="flex gap-2">
                  <span className="text-base-content/35">-</span>
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Available tools</h2>
          <div className="mt-5">
            <AvailableTools />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Sam: AI SEO teammate</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Sam is an experimental content workflow for Claude Code and other
            coding agents. It combines keyword research, source discovery,
            drafting, and QA.
          </p>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
          >
            View Sam on GitHub
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Roadmap</h2>
          <ul className="mt-4 space-y-3">
            {[
              {
                title: "In-app SEO Research Agent",
                description:
                  "Ask questions and run research without leaving Digital Urgency",
              },
              {
                title: "Content Assistant",
                description:
                  "Generate drafts using saved keywords and business context",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm">
                <span className="mt-[2px] shrink-0 text-base-content/40">
                  &mdash;
                </span>
                <span className="text-base-content/70">
                  <span className="font-medium text-base-content">
                    {item.title}
                  </span>
                  <br />
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-base-content/55 leading-relaxed">
          Have feedback? Email{" "}
          <a className="link link-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

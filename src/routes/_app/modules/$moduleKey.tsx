import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireBusinessModuleAccess } from "@/serverFunctions/business-modules";
import {
  businessModuleCatalog,
  businessModuleKeySchema,
  type BusinessModuleKey,
} from "@/shared/business-modules";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { LeadsWorkspace } from "@/client/features/business-modules/LeadsWorkspace";
import {
  VoiceWorkspace,
  WhatsappWorkspace,
} from "@/client/features/business-modules/CommunicationsWorkspace";
import { EmailWorkspace } from "@/client/features/business-modules/email/EmailWorkspace";

export const Route = createFileRoute("/_app/modules/$moduleKey")({
  component: BusinessModulePage,
});

const capabilities: Record<BusinessModuleKey, readonly string[]> = {
  leads: [
    "Lead capture and source tracking",
    "Qualification and assignment",
    "Prospects, inquiries, meetings, and notes",
    "Conversion into CRM contacts and opportunities",
  ],
  crm: [
    "Contacts and companies",
    "Configurable sales pipelines",
    "Activities, ownership, and follow-ups",
    "Staff roles and module permissions",
  ],
  whatsapp: [
    "Shared team inbox and contacts",
    "Templates, campaigns, and automations",
    "AI assistance and order requests",
    "Delivery state and reporting",
  ],
  voice: [
    "Provider-neutral agent configuration",
    "Speech-to-text, model, and text-to-speech providers",
    "Conversation history and transcripts",
    "In-app support assistant foundation",
  ],
  email: [
    "An inbox per business in its own AgentMail pod",
    "Drafts for human approval, or autopilot replies",
    "The same assistant brain as WhatsApp",
    "A custom SMTP/IMAP mailbox, later",
  ],
  integrations: [
    "Provider connections with secret references",
    "Signed inbound and outbound webhooks",
    "WooCommerce, SMS, widgets, and catalog sync",
    "Apify, Firecrawl, Hunter, Make, and future adapters",
  ],
};

function BusinessModulePage() {
  const { moduleKey: rawModuleKey } = Route.useParams();
  const parsed = businessModuleKeySchema.safeParse(rawModuleKey);
  if (!parsed.success) throw notFound();
  const moduleKey = parsed.data;
  const module = businessModuleCatalog.find((item) => item.key === moduleKey)!;
  const accessQuery = useQuery({
    queryKey: ["business-modules", moduleKey, "access"],
    queryFn: () => requireBusinessModuleAccess({ data: { moduleKey } }),
    retry: false,
  });

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-7 md:pb-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <Link to="/modules" className="btn btn-ghost btn-sm -ml-2">
          <ArrowLeft className="size-4" />
          Business
        </Link>

        {accessQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : accessQuery.isError ? (
          <div className="alert alert-warning">
            {getStandardErrorMessage(
              accessQuery.error,
              "This module is not available for your account.",
            )}
          </div>
        ) : (
          <>
            {moduleKey === "leads" ? <LeadsWorkspace /> : null}
            {moduleKey === "whatsapp" ? <WhatsappWorkspace /> : null}
            {moduleKey === "voice" ? <VoiceWorkspace /> : null}
            {moduleKey === "email" ? <EmailWorkspace /> : null}
            {businessModuleKeySchema.options.includes(moduleKey) ? null : (
              <>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {module.label}
                    </h1>
                    <span className="badge badge-success badge-sm">Active</span>
                  </div>
                  <p className="mt-1 text-base leading-6 text-base-content/65">
                    {module.description}
                  </p>
                </div>

                <section className="rounded-xl border border-base-300 p-6">
                  <h2 className="font-semibold">Foundation ready</h2>
                  <p className="mt-1 text-sm text-base-content/60">
                    The tenant boundary, entitlement check, and staff access
                    guard are active. Legacy workflows will be migrated into
                    this module incrementally without importing duplicate SEO
                    features.
                  </p>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {capabilities[moduleKey].map((capability) => (
                      <li key={capability} className="flex gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                        {capability}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

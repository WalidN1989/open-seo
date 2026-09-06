import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  draftWhatsappAssistantProfile,
  updateWhatsappAssistantSettings,
} from "@/serverFunctions/whatsappAssistant";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ASSISTANT_MODELS } from "@/types/schemas/whatsappAssistant";
import { AssistantDraftPanel } from "./AssistantDraftPanel";
import { AssistantStatusBanner } from "./AssistantStatusBanner";
import { PriceTokenList } from "./PriceTokenList";
import {
  type AssistantConfig,
  useAssistantConfig,
  useAssistantMutation,
} from "./assistantQuery";

const MODEL_LABELS: Record<(typeof ASSISTANT_MODELS)[number], string> = {
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5 — fastest, lowest cost",
  "claude-sonnet-5": "Claude Sonnet 5 — stronger judgement",
  "claude-opus-5": "Claude Opus 5 — best judgement, highest cost",
};

/** Shared by both channels; `channel` hides the controls only one of them has. */
export function AssistantConfigSection({
  channel = "whatsapp",
}: {
  channel?: "whatsapp" | "email";
} = {}) {
  const query = useAssistantConfig();
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  return (
    <ConfigForm
      key={query.data.settings.updatedAt ?? "defaults"}
      config={query.data}
      channel={channel}
    />
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-control w-full">
      <span className="mb-1 text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 text-xs text-base-content/60">{hint}</span>
      ) : null}
    </label>
  );
}

function ConfigForm({
  config,
  channel,
}: {
  config: AssistantConfig;
  channel: "whatsapp" | "email";
}) {
  const { settings, ai, priceTokens } = config;
  const [form, setForm] = useState({
    autopilot: settings.autopilot,
    model:
      ASSISTANT_MODELS.find((model) => model === settings.model) ??
      ASSISTANT_MODELS[0],
    replyDelaySeconds: settings.replyDelaySeconds,
    bookingLink: settings.bookingLink ?? "",
    timezone: settings.timezone ?? "",
    businessHoursStart: settings.businessHoursStart ?? "",
    businessHoursEnd: settings.businessHoursEnd ?? "",
    contactEmail: settings.contactEmail ?? "",
    contactPhone: settings.contactPhone ?? "",
    address: settings.address ?? "",
    escalationKeywords: settings.escalationKeywords ?? "",
    handoffMessage: settings.handoffMessage ?? "",
    persona: settings.persona ?? "",
    businessFacts: settings.businessFacts ?? "",
  });
  const save = useAssistantMutation(
    (input: typeof form) => updateWhatsappAssistantSettings({ data: input }),
    "Assistant config saved",
  );
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const draft = useMutation({
    mutationFn: () => draftWhatsappAssistantProfile(),
    onSuccess: (result) => {
      if (result.status === "no_domain") {
        toast.error(
          "Set this project's domain first, or fill its Context tab.",
        );
        return;
      }
      if (result.status === "unreadable") {
        toast.error(
          result.firecrawlConnected
            ? `Nothing readable came back from ${result.domain}.`
            : `Could not read ${result.domain}. Connect Firecrawl under Integrations for a full read.`,
        );
        return;
      }
      if (
        (form.persona.trim() || form.businessFacts.trim()) &&
        !window.confirm(
          "Replace the persona, business facts, hours and hand-off line with the draft? Nothing is saved until you press Save config.",
        )
      ) {
        return;
      }
      setForm((current) => ({
        ...current,
        persona: result.persona,
        businessFacts: result.businessFacts,
        // A field the source did not support keeps whatever is already there.
        timezone: result.timezone ?? current.timezone,
        businessHoursStart:
          result.businessHoursStart ?? current.businessHoursStart,
        businessHoursEnd: result.businessHoursEnd ?? current.businessHoursEnd,
        handoffMessage: result.handoffMessage ?? current.handoffMessage,
        contactEmail: result.contactEmail ?? current.contactEmail,
        contactPhone: result.contactPhone ?? current.contactPhone,
        address: result.address ?? current.address,
      }));
      toast.success(
        result.source === "context"
          ? "Drafted from this project's Context tab — review, then save."
          : `Drafted from ${result.pagesRead} page${result.pagesRead === 1 ? "" : "s"} of the website — review, then save.`,
      );
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });
  const empty = !form.persona.trim() && !form.businessFacts.trim();
  const input = "input input-bordered input-sm w-full";
  const textarea = "textarea textarea-bordered w-full text-sm leading-relaxed";

  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(form);
      }}
    >
      <AssistantStatusBanner ai={ai} />

      {channel === "whatsapp" ? (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-base-300 p-4">
          <span>
            <span className="block font-medium">Autopilot</span>
            <span className="text-sm text-base-content/60">
              When on, the assistant answers incoming messages on its own. When
              off, only instant answers, escalation and automation rules run.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={form.autopilot}
            onChange={(event) => set("autopilot", event.currentTarget.checked)}
          />
        </label>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Model">
          <select
            className="select select-bordered select-sm w-full"
            value={form.model}
            onChange={(event) => {
              const chosen = ASSISTANT_MODELS.find(
                (model) => model === event.currentTarget.value,
              );
              if (chosen) set("model", chosen);
            }}
          >
            {ASSISTANT_MODELS.map((model) => (
              <option key={model} value={model}>
                {MODEL_LABELS[model]}
              </option>
            ))}
          </select>
        </Field>
        {channel === "whatsapp" ? (
          <Field
            label="Reply delay (seconds)"
            hint="Waits this long after their last message so several quick messages get one considered reply. 0 to 8."
          >
            <input
              type="number"
              min={0}
              max={8}
              className={input}
              value={form.replyDelaySeconds}
              onChange={(event) =>
                set(
                  "replyDelaySeconds",
                  Math.max(
                    0,
                    Math.min(8, Number(event.currentTarget.value) || 0),
                  ),
                )
              }
            />
          </Field>
        ) : null}
        <Field
          label="Booking link"
          hint="Calendly or similar. Until one is set the assistant offers a call-back instead of inventing a link."
        >
          <input
            className={input}
            placeholder="https://calendly.com/…"
            value={form.bookingLink}
            onChange={(event) => set("bookingLink", event.currentTarget.value)}
          />
        </Field>
        <Field
          label="Timezone"
          hint="IANA name, e.g. Australia/Brisbane or Asia/Colombo."
        >
          <input
            className={input}
            placeholder="Australia/Brisbane"
            value={form.timezone}
            onChange={(event) => set("timezone", event.currentTarget.value)}
          />
        </Field>
        <Field label="Business hours start">
          <input
            type="time"
            className={input}
            value={form.businessHoursStart}
            onChange={(event) =>
              set("businessHoursStart", event.currentTarget.value)
            }
          />
        </Field>
        <Field label="Business hours end">
          <input
            type="time"
            className={input}
            value={form.businessHoursEnd}
            onChange={(event) =>
              set("businessHoursEnd", event.currentTarget.value)
            }
          />
        </Field>
        <Field
          label="Contact email"
          hint="Given to a customer who asks how to reach the business."
        >
          <input
            type="email"
            className={input}
            placeholder="sales@example.com"
            value={form.contactEmail}
            onChange={(event) => set("contactEmail", event.currentTarget.value)}
          />
        </Field>
        <Field label="Contact phone">
          <input
            className={input}
            placeholder="+61 400 000 000"
            value={form.contactPhone}
            onChange={(event) => set("contactPhone", event.currentTarget.value)}
          />
        </Field>
      </div>
      <Field
        label="Address"
        hint="Where the business trades. The assistant gives this out when someone asks where you are."
      >
        <input
          className={input}
          placeholder="2/84 Estramina Street, Oxley QLD 4075, Australia"
          value={form.address}
          onChange={(event) => set("address", event.currentTarget.value)}
        />
      </Field>

      <Field
        label="Escalation keywords"
        hint="Comma-separated. If a message contains any of these, the assistant sends the hand-off line once, stops replying, and the chat is marked pending for a person."
      >
        <textarea
          className={textarea}
          rows={2}
          value={form.escalationKeywords}
          onChange={(event) =>
            set("escalationKeywords", event.currentTarget.value)
          }
        />
      </Field>
      <Field
        label="Hand-off message"
        hint="Sent once when an escalation keyword matches."
      >
        <input
          className={input}
          value={form.handoffMessage}
          onChange={(event) => set("handoffMessage", event.currentTarget.value)}
        />
      </Field>

      <section className="rounded-xl border border-base-300 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4" />
          <h3 className="font-medium">Live price tokens</h3>
        </div>
        <p className="mb-3 text-sm text-base-content/60">
          Write{" "}
          <code className="rounded bg-base-200 px-1">{"{{price:Name}}"}</code>{" "}
          in an instant answer and it is replaced with the current price from
          Commerce when the message is sent. Never type a price by hand.
        </p>
        {priceTokens.length ? (
          <PriceTokenList tokens={priceTokens} />
        ) : (
          <p className="text-sm text-base-content/50">
            No priced products yet. Add products with a sale price in the
            Commerce module and they appear here.
          </p>
        )}
      </section>

      <AssistantDraftPanel
        empty={empty}
        pending={draft.isPending}
        onDraft={() => draft.mutate()}
      />

      <Field
        label="Persona & identity"
        hint="Who the assistant is and how it talks. Replaces the default opening instruction; the guard-rails against inventing facts always apply."
      >
        <textarea
          className={textarea}
          rows={7}
          placeholder="You are the assistant for Digital Urgency, a Brisbane web and SEO agency. Reply in the customer's language, keep it short, and get real interest onto a call with the team…"
          value={form.persona}
          onChange={(event) => set("persona", event.currentTarget.value)}
        />
      </Field>
      <Field
        label="Business facts"
        hint="Services, where you are, who you serve, turnaround, guarantees. The assistant may only state facts written here, in the Context tab of this project, or in the live price list."
      >
        <textarea
          className={textarea}
          rows={9}
          value={form.businessFacts}
          onChange={(event) => set("businessFacts", event.currentTarget.value)}
        />
      </Field>

      <div className="flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save config"}
        </button>
      </div>
    </form>
  );
}

/* oxlint-disable max-lines */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type React from "react";
import {
  Bot,
  Cable,
  FileText,
  MessageCircleMore,
  Plus,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import {
  createIntegration,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappTemplate,
  getIntegrationsWorkspace,
  getVoiceWorkspace,
  getWhatsappWorkspace,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { createWhatsappConnectionSchema } from "@/types/schemas/communications";

export function WhatsappWorkspace() {
  const client = useQueryClient();
  const [form, setForm] = useState<"connection" | "template" | null>(null);
  const query = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
  });
  const connection = useMutation({
    mutationFn: (data: {
      provider: "meta_cloud" | "twilio" | "custom";
      displayPhoneNumber?: string;
    }) => createWhatsappConnection({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("WhatsApp connection saved");
    },
    onError: showError,
  });
  const template = useMutation({
    mutationFn: (data: {
      name: string;
      body: string;
      languageCode: string;
      category: "marketing";
    }) => createWhatsappTemplate({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Template created");
    },
    onError: showError,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} />;
  const data = query.data!;
  return (
    <Workspace
      title="WhatsApp"
      subtitle="Shared inbox, campaigns, templates, automations, and order requests."
      actions={
        <>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setForm("connection")}
          >
            <Cable className="size-4" /> Connection
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setForm("template")}
          >
            <Plus className="size-4" /> Template
          </button>
        </>
      }
    >
      {form === "connection" ? (
        <SimpleForm
          fields={["displayPhoneNumber"]}
          select={{
            name: "provider",
            options: ["meta_cloud", "twilio", "custom"],
          }}
          onSubmit={(values) => {
            const parsed = createWhatsappConnectionSchema.safeParse(values);
            if (parsed.success) connection.mutate(parsed.data);
          }}
        />
      ) : null}
      {form === "template" ? (
        <SimpleForm
          fields={["name", "body"]}
          onSubmit={(values) =>
            template.mutate({
              name: values.name,
              body: values.body,
              languageCode: "en",
              category: "marketing",
            })
          }
        />
      ) : null}
      <Metrics
        items={[
          ["Connections", data.connections.length],
          [
            "Open conversations",
            data.conversations.filter((item) => item.status === "open").length,
          ],
          ["Templates", data.templates.length],
          ["Campaigns", data.campaigns.length],
          ["Automations", data.automations.length],
          ["Order requests", data.orders.length],
        ]}
      />
      <Panel title="Shared inbox" icon={MessageCircleMore}>
        {data.conversations.length ? (
          data.conversations.map((item) => (
            <Row
              key={item.id}
              title={item.externalConversationId ?? "Conversation"}
              detail={item.status}
            />
          ))
        ) : (
          <Empty text="Connect a WhatsApp provider to begin receiving conversations." />
        )}
      </Panel>
      <Panel title="Templates" icon={FileText}>
        {data.templates.length ? (
          data.templates.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              detail={`${item.languageCode} · ${item.status}`}
            />
          ))
        ) : (
          <Empty text="No message templates yet." />
        )}
      </Panel>
    </Workspace>
  );
}

export function VoiceWorkspace() {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ["voice", "workspace"],
    queryFn: () => getVoiceWorkspace(),
  });
  const mutation = useMutation({
    mutationFn: (data: {
      name: string;
      speechToTextProvider?: string;
      textToSpeechProvider?: string;
      modelProvider?: string;
    }) => createVoiceAgent({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      setAdding(false);
      toast.success("Voice agent created");
    },
    onError: showError,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} />;
  return (
    <Workspace
      title="Voice Agent"
      subtitle="Browser voice assistants now; telephony remains a separate provider capability."
      actions={
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> Agent
        </button>
      }
    >
      {adding ? (
        <SimpleForm
          fields={[
            "name",
            "speechToTextProvider",
            "textToSpeechProvider",
            "modelProvider",
          ]}
          onSubmit={(values) =>
            mutation.mutate({
              name: values.name,
              speechToTextProvider: values.speechToTextProvider,
              textToSpeechProvider: values.textToSpeechProvider,
              modelProvider: values.modelProvider,
            })
          }
        />
      ) : null}
      <Metrics
        items={[
          ["Agents", query.data!.agents.length],
          ["Conversations", query.data!.conversations.length],
        ]}
      />
      <Panel title="Agents" icon={Bot}>
        {query.data!.agents.length ? (
          query.data!.agents.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              detail={`${item.status} · ${item.modelProvider ?? "model not configured"}`}
            />
          ))
        ) : (
          <Empty text="Create an agent, then attach speech and model credentials through a secret reference." />
        )}
      </Panel>
    </Workspace>
  );
}

export function IntegrationsWorkspace() {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ["integrations", "workspace"],
    queryFn: () => getIntegrationsWorkspace(),
  });
  const mutation = useMutation({
    mutationFn: (data: { providerKey: string; displayName: string }) =>
      createIntegration({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      setAdding(false);
      toast.success("Integration added");
    },
    onError: showError,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} />;
  return (
    <Workspace
      title="Integrations"
      subtitle="Provider-neutral connections and signed webhook delivery infrastructure."
      actions={
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> Integration
        </button>
      }
    >
      {adding ? (
        <SimpleForm
          fields={["displayName", "providerKey"]}
          onSubmit={(values) =>
            mutation.mutate({
              providerKey: values.providerKey,
              displayName: values.displayName,
            })
          }
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Connections" icon={Cable}>
          {query.data!.connections.length ? (
            query.data!.connections.map((item) => (
              <Row
                key={item.id}
                title={item.displayName}
                detail={`${item.providerKey} · ${item.status}`}
              />
            ))
          ) : (
            <Empty text="Add WooCommerce, Apify, Firecrawl, Hunter, Make, SMS, or another provider." />
          )}
        </Panel>
        <Panel title="Webhooks" icon={Webhook}>
          {query.data!.webhooks.length ? (
            query.data!.webhooks.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                detail={`${item.direction} · ${item.status}`}
              />
            ))
          ) : (
            <Empty text="No signed webhook endpoints configured." />
          )}
        </Panel>
      </div>
    </Workspace>
  );
}

function Workspace({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-base-content/60">{subtitle}</p>
        </div>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}
function Metrics({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-base-300 p-4">
          <p className="text-xs uppercase text-base-content/50">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}
function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-base-300">
      <div className="flex items-center gap-2 border-b border-base-300 p-4">
        <Icon className="size-4" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="divide-y divide-base-300">{children}</div>
    </section>
  );
}
function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-4">
      <p className="font-medium">{title}</p>
      <p className="text-xs text-base-content/50">{detail}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-base-content/40">{text}</p>;
}
function Loading() {
  return (
    <div className="flex justify-center py-16">
      <span className="loading loading-spinner" />
    </div>
  );
}
function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="alert alert-error">{getStandardErrorMessage(error)}</div>
  );
}
function showError(error: unknown) {
  toast.error(getStandardErrorMessage(error));
}
function SimpleForm({
  fields,
  select,
  onSubmit,
}: {
  fields: string[];
  select?: { name: string; options: string[] };
  onSubmit: (values: Record<string, string>) => void;
}) {
  return (
    <form
      className="flex flex-wrap gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit(
          Object.fromEntries(
            [...fields, ...(select ? [select.name] : [])].map((name) => [
              name,
              fieldValue(data, name),
            ]),
          ),
        );
      }}
    >
      {select ? (
        <select name={select.name} className="select select-bordered select-sm">
          {select.options.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      ) : null}
      {fields.map((field, index) => (
        <input
          key={field}
          name={field}
          required={index === 0}
          className="input input-bordered input-sm min-w-44 flex-1"
          placeholder={field.replace(/([A-Z])/g, " $1")}
        />
      ))}
      <button className="btn btn-primary btn-sm">Save</button>
    </form>
  );
}

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

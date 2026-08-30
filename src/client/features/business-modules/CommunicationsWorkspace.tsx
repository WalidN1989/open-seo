/* oxlint-disable max-lines, max-lines-per-function */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
  appendVoiceTranscript,
  createIntegration,
  createWebhookEndpoint,
  createVoiceAgent,
  createWhatsappConnection,
  createWhatsappAutomation,
  createWhatsappCampaign,
  createWhatsappOrder,
  createWhatsappTemplate,
  endVoiceConversation,
  getIntegrationsWorkspace,
  getVoiceWorkspace,
  getWhatsappWorkspace,
  launchWhatsappCampaign,
  retryWebhookDelivery,
  testIntegration,
  sendWhatsappMessage,
  startVoiceConversation,
  transcribeVoiceAudio,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { createWhatsappConnectionSchema } from "@/types/schemas/communications";
import { integrationProviders } from "@/shared/integration-providers";

export function WhatsappWorkspace() {
  const client = useQueryClient();
  const [form, setForm] = useState<
    "connection" | "template" | "campaign" | "automation" | "order" | null
  >(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
  });
  const connection = useMutation({
    mutationFn: (data: {
      provider: "meta_cloud" | "twilio" | "custom";
      displayPhoneNumber?: string;
      externalAccountId?: string;
      credentialReference?: string;
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
      connectionId?: string;
      externalTemplateId?: string;
      status?: "draft" | "approved";
    }) => createWhatsappTemplate({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Template created");
    },
    onError: showError,
  });
  const reply = useMutation({
    mutationFn: (data: { conversationId: string; body: string }) =>
      sendWhatsappMessage({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setReplyTo(null);
      toast.success("Message sent");
    },
    onError: showError,
  });
  const campaign = useMutation({
    mutationFn: (data: {
      name: string;
      connectionId: string;
      templateId: string;
    }) => createWhatsappCampaign({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Campaign draft created");
    },
    onError: showError,
  });
  const launchCampaign = useMutation({
    mutationFn: (campaignId: string) =>
      launchWhatsappCampaign({ data: { campaignId } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      toast.success(
        `Campaign finished: ${result.sent} sent, ${result.failed} failed`,
      );
    },
    onError: showError,
  });
  const automation = useMutation({
    mutationFn: (data: {
      name: string;
      triggerType: "keyword";
      matchValue?: string;
      responseTemplateId: string;
    }) => createWhatsappAutomation({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Automation activated");
    },
    onError: showError,
  });
  const order = useMutation({
    mutationFn: (data: {
      summary: string;
      amountCents: number;
      conversationId?: string;
    }) => createWhatsappOrder({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Order request created");
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
            className="btn btn-ghost btn-sm"
            onClick={() => setForm("order")}
          >
            Order
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setForm("automation")}
          >
            Automation
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setForm("campaign")}
          >
            Campaign
          </button>
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
          fields={[
            "displayPhoneNumber",
            "externalAccountId",
            "credentialReference",
          ]}
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
          fields={["name", "body", "connectionId", "externalTemplateId"]}
          onSubmit={(values) =>
            template.mutate({
              name: values.name,
              body: values.body,
              languageCode: "en",
              category: "marketing",
              connectionId: values.connectionId || undefined,
              externalTemplateId: values.externalTemplateId || undefined,
              status: values.externalTemplateId ? "approved" : "draft",
            })
          }
        />
      ) : null}
      {form === "campaign" ? (
        <SimpleForm
          fields={["name", "connectionId", "templateId"]}
          onSubmit={(values) =>
            campaign.mutate({
              name: values.name,
              connectionId: values.connectionId,
              templateId: values.templateId,
            })
          }
        />
      ) : null}
      {form === "automation" ? (
        <SimpleForm
          fields={["name", "matchValue", "responseTemplateId"]}
          onSubmit={(values) =>
            automation.mutate({
              name: values.name,
              matchValue: values.matchValue,
              responseTemplateId: values.responseTemplateId,
              triggerType: "keyword",
            })
          }
        />
      ) : null}
      {form === "order" ? (
        <SimpleForm
          fields={["summary", "amount", "conversationId"]}
          onSubmit={(values) =>
            order.mutate({
              summary: values.summary,
              amountCents: Math.round(Number(values.amount || 0) * 100),
              conversationId: values.conversationId || undefined,
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
            <div key={item.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Row
                    title={item.externalConversationId ?? "Conversation"}
                    detail={item.status}
                  />
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setReplyTo(item.id)}
                >
                  Reply
                </button>
              </div>
              {replyTo === item.id ? (
                <SimpleForm
                  fields={["body"]}
                  onSubmit={(values) =>
                    reply.mutate({ conversationId: item.id, body: values.body })
                  }
                />
              ) : null}
            </div>
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
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Campaigns" icon={MessageCircleMore}>
          {data.campaigns.length ? (
            data.campaigns.map((item) => (
              <div key={item.id} className="flex items-center gap-2 pr-4">
                <div className="min-w-0 flex-1">
                  <Row title={item.name} detail={item.status} />
                </div>
                {item.status === "draft" || item.status === "scheduled" ? (
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => launchCampaign.mutate(item.id)}
                  >
                    Launch
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty text="No campaigns yet." />
          )}
        </Panel>
        <Panel title="Automations" icon={Bot}>
          {data.automations.length ? (
            data.automations.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                detail={`${item.triggerType} · ${item.status}`}
              />
            ))
          ) : (
            <Empty text="No automations yet." />
          )}
        </Panel>
        <Panel title="Order requests" icon={FileText}>
          {data.orders.length ? (
            data.orders.map((item) => (
              <Row
                key={item.id}
                title={item.summary}
                detail={`${item.status} · $${(item.amountCents / 100).toFixed(2)}`}
              />
            ))
          ) : (
            <Empty text="No order requests yet." />
          )}
        </Panel>
      </div>
    </Workspace>
  );
}

export function VoiceWorkspace() {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [recordingConversationId, setRecordingConversationId] = useState<
    string | null
  >(null);
  const recorderRef = useRef<{
    recorder: MediaRecorder;
    chunks: Blob[];
    conversationId: string;
    stream: MediaStream;
  } | null>(null);
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
      credentialReference?: string;
    }) => createVoiceAgent({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      setAdding(false);
      toast.success("Voice agent created");
    },
    onError: showError,
  });
  const start = useMutation({
    mutationFn: (agentConfigId: string) =>
      startVoiceConversation({ data: { agentConfigId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      toast.success("Browser voice session started");
    },
    onError: showError,
  });
  const transcript = useMutation({
    mutationFn: (data: { conversationId: string; transcript: string }) =>
      appendVoiceTranscript({ data: { ...data, speaker: "user" } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      toast.success("Transcript saved");
    },
    onError: showError,
  });
  const end = useMutation({
    mutationFn: (conversationId: string) =>
      endVoiceConversation({ data: { conversationId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      toast.success("Voice session completed");
    },
    onError: showError,
  });
  const transcribe = useMutation({
    mutationFn: (data: {
      conversationId: string;
      audioBase64: string;
      mimeType: string;
    }) => transcribeVoiceAudio({ data: { ...data, language: "multi" } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["voice"] });
      toast.success(`Heard: ${result.transcript}`);
      if ("replyError" in result && result.replyError) {
        toast.warning(
          `Transcript saved, but the agent could not reply: ${result.replyError}`,
        );
      }
      if ("audioBase64" in result && result.audioBase64) {
        const audio = new Audio(
          `data:${result.mimeType};base64,${result.audioBase64}`,
        );
        await audio.play().catch(() => {
          toast.warning(
            "The reply is ready, but browser audio playback was blocked.",
          );
        });
      }
    },
    onError: showError,
  });
  const beginRecording = async (conversationId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const state = { recorder, chunks: [] as Blob[], conversationId, stream };
      recorderRef.current = state;
      recorder.ondataavailable = (event) => {
        if (event.data.size) state.chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(state.chunks, { type: recorder.mimeType });
        setRecordingConversationId(null);
        recorderRef.current = null;
        transcribe.mutate({
          conversationId,
          audioBase64: await blobToBase64(blob),
          mimeType: blob.type || "audio/webm",
        });
      };
      recorder.start();
      setRecordingConversationId(conversationId);
    } catch (error) {
      showError(error);
    }
  };
  const stopRecording = () => recorderRef.current?.recorder.stop();
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
            "credentialReference",
          ]}
          onSubmit={(values) =>
            mutation.mutate({
              name: values.name,
              speechToTextProvider: values.speechToTextProvider,
              textToSpeechProvider: values.textToSpeechProvider,
              modelProvider: values.modelProvider,
              credentialReference: values.credentialReference,
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
            <div key={item.id} className="flex items-center gap-2 pr-4">
              <div className="min-w-0 flex-1">
                <Row
                  title={item.name}
                  detail={`${item.status} · ${item.modelProvider ?? "model not configured"}`}
                />
              </div>
              <button
                className="btn btn-primary btn-xs"
                onClick={() => start.mutate(item.id)}
              >
                Start session
              </button>
            </div>
          ))
        ) : (
          <Empty text="Create an agent, then attach speech and model credentials through a secret reference." />
        )}
      </Panel>
      <Panel title="Browser sessions" icon={MessageCircleMore}>
        {query.data!.conversations.length ? (
          query.data!.conversations.map((conversation) => {
            const messages = query.data!.messages.filter(
              (message) => message.conversationId === conversation.id,
            );
            return (
              <div key={conversation.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {conversation.channel} session
                    </p>
                    <p className="text-xs text-base-content/50">
                      {conversation.status} · {messages.length} transcript
                      entries
                    </p>
                  </div>
                  {conversation.status === "active" ? (
                    <div className="flex gap-2">
                      <button
                        className={`btn btn-xs ${recordingConversationId === conversation.id ? "btn-error" : "btn-primary"}`}
                        onClick={() =>
                          recordingConversationId === conversation.id
                            ? stopRecording()
                            : beginRecording(conversation.id)
                        }
                      >
                        {recordingConversationId === conversation.id
                          ? "Stop recording"
                          : "Record"}
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => end.mutate(conversation.id)}
                      >
                        End
                      </button>
                    </div>
                  ) : null}
                </div>
                {conversation.status === "active" ? (
                  <SimpleForm
                    fields={["transcript"]}
                    onSubmit={(values) =>
                      transcript.mutate({
                        conversationId: conversation.id,
                        transcript: values.transcript,
                      })
                    }
                  />
                ) : null}
                {messages.slice(0, 5).map((message) => (
                  <p key={message.id} className="text-sm">
                    <span className="font-medium capitalize">
                      {message.speaker}:
                    </span>{" "}
                    {message.transcript}
                  </p>
                ))}
              </div>
            );
          })
        ) : (
          <Empty text="No browser voice sessions yet." />
        )}
      </Panel>
    </Workspace>
  );
}

export function IntegrationsWorkspace() {
  const client = useQueryClient();
  const [adding, setAdding] = useState<"integration" | "webhook" | null>(null);
  const query = useQuery({
    queryKey: ["integrations", "workspace"],
    queryFn: () => getIntegrationsWorkspace(),
  });
  const mutation = useMutation({
    mutationFn: (data: {
      providerKey: string;
      displayName: string;
      credentialReference?: string;
    }) => createIntegration({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      setAdding(null);
      toast.success("Integration added");
    },
    onError: showError,
  });
  const webhook = useMutation({
    mutationFn: (data: {
      name: string;
      url: string;
      secretReference: string;
      eventTypes: string[];
    }) => createWebhookEndpoint({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      setAdding(null);
      toast.success("Signed webhook created");
    },
    onError: showError,
  });
  const retryDelivery = useMutation({
    mutationFn: (deliveryId: string) =>
      retryWebhookDelivery({ data: { deliveryId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Webhook delivery retried");
    },
    onError: showError,
  });
  const integrationTest = useMutation({
    mutationFn: (connectionId: string) =>
      testIntegration({ data: { connectionId } }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      toast.success(result.detail);
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
        <>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setAdding("webhook")}
          >
            <Webhook className="size-4" /> Webhook
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setAdding("integration")}
          >
            <Plus className="size-4" /> Integration
          </button>
        </>
      }
    >
      {adding === "integration" ? (
        <SimpleForm
          fields={["displayName", "providerKey", "credentialReference"]}
          onSubmit={(values) =>
            mutation.mutate({
              providerKey: values.providerKey,
              displayName: values.displayName,
              credentialReference: values.credentialReference || undefined,
            })
          }
        />
      ) : null}
      {adding === "webhook" ? (
        <SimpleForm
          fields={["name", "url", "secretReference", "eventTypes"]}
          onSubmit={(values) =>
            webhook.mutate({
              name: values.name,
              url: values.url,
              secretReference: values.secretReference,
              eventTypes: values.eventTypes
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Connections" icon={Cable}>
          {query.data!.connections.length ? (
            query.data!.connections.map((item) => (
              <div key={item.id} className="flex items-center gap-2 pr-4">
                <div className="min-w-0 flex-1">
                  <Row
                    title={item.displayName}
                    detail={`${item.providerKey} · ${item.status}`}
                  />
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={integrationTest.isPending}
                  onClick={() => integrationTest.mutate(item.id)}
                >
                  Test
                </button>
              </div>
            ))
          ) : (
            <Empty text="Add Claude Haiku, WooCommerce, Apify, Firecrawl, Hunter, Make, SMS, or another provider." />
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
      <Panel title="Available provider adapters" icon={Cable}>
        {integrationProviders.map((provider) => (
          <Row
            key={provider.key}
            title={provider.name}
            detail={provider.capabilities.join(" · ")}
          />
        ))}
      </Panel>
      <Panel title="Recent webhook deliveries" icon={Webhook}>
        {query.data!.deliveries.length ? (
          query.data!.deliveries.map((item) => (
            <div key={item.id} className="flex items-center gap-2 pr-4">
              <div className="min-w-0 flex-1">
                <Row
                  title={item.eventType}
                  detail={`${item.status} · ${item.attemptCount} attempt${item.attemptCount === 1 ? "" : "s"}${item.responseStatus ? ` · HTTP ${item.responseStatus}` : ""}`}
                />
              </div>
              {item.status === "failed" ? (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => retryDelivery.mutate(item.id)}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <Empty text="No webhook deliveries yet." />
        )}
      </Panel>
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

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}

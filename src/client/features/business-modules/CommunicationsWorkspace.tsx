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
  updateWhatsappConnection,
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
  testWebhookEndpoint,
  testIntegration,
  sendWhatsappMessage,
  startVoiceConversation,
  transcribeVoiceAudio,
  updateWhatsappConversation,
  runIntegrationAction,
} from "@/serverFunctions/communications";
import { convertWhatsappOrderRequest } from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createWhatsappConnectionSchema,
  updateWhatsappConnectionSchema,
} from "@/types/schemas/communications";
import { integrationProviders } from "@/shared/integration-providers";

const whatsappConversationStatuses = ["open", "pending", "closed"] as const;

function isWhatsappConversationStatus(
  value: string,
): value is (typeof whatsappConversationStatuses)[number] {
  return whatsappConversationStatuses.some((status) => status === value);
}

export function WhatsappWorkspace() {
  const client = useQueryClient();
  const [form, setForm] = useState<
    | "connection"
    | "connection-update"
    | "template"
    | "campaign"
    | "automation"
    | "order"
    | null
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

  // Rotating a token is a separate action from creating a number: the token is
  // never sent to the browser, so a blank field here means "keep the one you
  // have" rather than "clear it".
  const connectionUpdate = useMutation({
    mutationFn: (data: {
      connectionId: string;
      accessToken?: string;
      displayPhoneNumber?: string;
      phoneNumberId?: string;
      businessAccountId?: string;
    }) => updateWhatsappConnection({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Connection updated");
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
  const updateConversation = useMutation({
    mutationFn: (data: {
      conversationId: string;
      assignedMemberId?: string | null;
      contactId?: string | null;
      status?: "open" | "pending" | "closed";
    }) => updateWhatsappConversation({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      toast.success("Conversation updated");
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
  const messageCount = (direction?: string, status?: string) =>
    data.messageStats
      .filter(
        (item) =>
          (!direction || item.direction === direction) &&
          (!status || item.status === status),
      )
      .reduce((sum, item) => sum + item.count, 0);
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
            className="btn btn-ghost btn-sm"
            onClick={() => setForm("connection-update")}
          >
            Update connection
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
            "phoneNumberId",
            "businessAccountId",
            "accessToken",
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
      {form === "connection-update" ? (
        <SimpleForm
          fields={[
            "connectionId",
            "accessToken",
            "displayPhoneNumber",
            "phoneNumberId",
            "businessAccountId",
          ]}
          onSubmit={(values) => {
            const parsed = updateWhatsappConnectionSchema.safeParse(values);
            if (parsed.success) connectionUpdate.mutate(parsed.data);
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
          ["Inbound messages", messageCount("inbound")],
          ["Outbound messages", messageCount("outbound")],
          ["Failed messages", messageCount(undefined, "failed")],
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
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  aria-label="Linked CRM contact"
                  className="select select-bordered select-xs w-full"
                  value={item.contactId ?? ""}
                  disabled={updateConversation.isPending}
                  onChange={(event) =>
                    updateConversation.mutate({
                      conversationId: item.id,
                      contactId: event.currentTarget.value || null,
                    })
                  }
                >
                  <option value="">No CRM contact</option>
                  {data.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {[contact.firstName, contact.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                        contact.whatsappPhone ||
                        contact.phone}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Assigned team member"
                  className="select select-bordered select-xs w-full"
                  value={item.assignedMemberId ?? ""}
                  disabled={updateConversation.isPending}
                  onChange={(event) =>
                    updateConversation.mutate({
                      conversationId: item.id,
                      assignedMemberId: event.currentTarget.value || null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name || member.email}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Conversation status"
                  className="select select-bordered select-xs w-full"
                  value={item.status}
                  disabled={updateConversation.isPending}
                  onChange={(event) => {
                    const status = event.currentTarget.value;
                    if (isWhatsappConversationStatus(status))
                      updateConversation.mutate({
                        conversationId: item.id,
                        status,
                      });
                  }}
                >
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="closed">Closed</option>
                </select>
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
              <OrderRequestRow
                key={item.id}
                id={item.id}
                summary={item.summary}
                detail={`${item.status} · $${(item.amountCents / 100).toFixed(2)}`}
                convertedOrderId={item.externalOrderId}
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
  const [runningProvider, setRunningProvider] = useState<{
    id: string;
    providerKey: string;
  } | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
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
  const webhookTest = useMutation({
    mutationFn: (endpointId: string) =>
      testWebhookEndpoint({
        data: {
          endpointId,
          eventType: "openseo.webhook.test",
          payload: { message: "OpenSEO signed webhook test" },
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Test webhook delivered");
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
  const providerAction = useMutation({
    mutationFn: (
      data:
        | {
            connectionId: string;
            action: "apify_run_actor";
            actorId: string;
            inputJson: string;
          }
        | {
            connectionId: string;
            action: "firecrawl_scrape";
            url: string;
          },
    ) => runIntegrationAction({ data }),
    onSuccess: (result) => {
      setActionResult(result.resultPreview);
      toast.success("Provider action completed");
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
                {item.status === "connected" &&
                (item.providerKey === "apify" ||
                  item.providerKey === "firecrawl") ? (
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => {
                      setRunningProvider({
                        id: item.id,
                        providerKey: item.providerKey,
                      });
                      setActionResult(null);
                    }}
                  >
                    Run
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty text="Add Claude Haiku, WooCommerce, Apify, Firecrawl, Hunter, Make, SMS, or another provider." />
          )}
        </Panel>
        <Panel title="Webhooks" icon={Webhook}>
          {query.data!.webhooks.length ? (
            query.data!.webhooks.map((item) => (
              <div key={item.id} className="flex items-center gap-2 pr-4">
                <div className="min-w-0 flex-1">
                  <Row
                    title={item.name}
                    detail={`${item.direction} · ${item.status}`}
                  />
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={webhookTest.isPending}
                  onClick={() => webhookTest.mutate(item.id)}
                >
                  Test
                </button>
              </div>
            ))
          ) : (
            <Empty text="No signed webhook endpoints configured." />
          )}
        </Panel>
      </div>
      {runningProvider?.providerKey === "apify" ? (
        <Panel title="Run Apify actor" icon={Cable}>
          <SimpleForm
            fields={["actorId", "inputJson"]}
            onSubmit={(values) =>
              providerAction.mutate({
                connectionId: runningProvider.id,
                action: "apify_run_actor",
                actorId: values.actorId,
                inputJson: values.inputJson || "{}",
              })
            }
          />
        </Panel>
      ) : null}
      {runningProvider?.providerKey === "firecrawl" ? (
        <Panel title="Scrape with Firecrawl" icon={Cable}>
          <SimpleForm
            fields={["url"]}
            onSubmit={(values) =>
              providerAction.mutate({
                connectionId: runningProvider.id,
                action: "firecrawl_scrape",
                url: values.url,
              })
            }
          />
        </Panel>
      ) : null}
      {actionResult ? (
        <Panel title="Provider result" icon={FileText}>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 text-xs">
            {actionResult}
          </pre>
        </Panel>
      ) : null}
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-base leading-6 text-base-content/65">
            {subtitle}
          </p>
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
        <div
          key={label}
          className="rounded-xl border border-base-300 bg-base-100 p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
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
      <div className="flex items-center gap-2 border-b border-base-300 px-4 py-3.5">
        <Icon className="size-4" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="divide-y divide-base-300">{children}</div>
    </section>
  );
}
/**
 * An order request is an enquiry. Turning it into an order is an explicit act
 * by a person — never something an AI reply does — and it produces a DRAFT, so
 * no stock moves until someone confirms it.
 */
function OrderRequestRow({
  id,
  summary,
  detail,
  convertedOrderId,
}: {
  id: string;
  summary: string;
  detail: string;
  convertedOrderId: string | null;
}) {
  const queryClient = useQueryClient();
  const convert = useMutation({
    mutationFn: () => convertWhatsappOrderRequest({ data: { requestId: id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp", "workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["commerce", "orders"] }),
      ]);
      toast.success("Draft order created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{summary}</p>
        <p className="text-sm text-base-content/60">{detail}</p>
      </div>
      {convertedOrderId ? (
        <span className="badge badge-ghost badge-sm shrink-0">
          Order created
        </span>
      ) : (
        <button
          className="btn btn-outline btn-xs shrink-0"
          disabled={convert.isPending}
          onClick={() => convert.mutate()}
        >
          Create draft order
        </button>
      )}
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-4">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-base-content/60">{detail}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-base-content/60">{text}</p>;
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
const SECRET_FIELDS = new Set(["accessToken"]);

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
          // A token is masked as it is typed and kept out of the browser's
          // autofill store. It is never rendered back: the server returns
          // which credentials are set, not their values.
          type={SECRET_FIELDS.has(field) ? "password" : "text"}
          autoComplete={SECRET_FIELDS.has(field) ? "off" : undefined}
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

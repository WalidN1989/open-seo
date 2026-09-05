/* oxlint-disable max-lines, max-lines-per-function, complexity */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  Bot,
  Cable,
  FileText,
  MessageCircleMore,
  Plus,
  Search,
  UserRound,
  Webhook,
  Download,
  CheckCircle2,
  MessageSquarePlus,
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
  updateWhatsappContactProfile,
  addWhatsappContactTag,
  upsertWhatsappContactAttribute,
  createWhatsappInternalNote,
  runIntegrationAction,
} from "@/serverFunctions/communications";
import { createCrmContact } from "@/serverFunctions/crm";
import { convertWhatsappOrderRequest } from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createWhatsappConnectionSchema,
  updateWhatsappConnectionSchema,
} from "@/types/schemas/communications";
import { integrationProviders } from "@/shared/integration-providers";

const whatsappConversationStatuses = ["open", "pending", "closed"] as const;
const whatsappSections = [
  "Inbox",
  "Contacts",
  "Templates",
  "Campaigns",
  "Automation",
  "AI Assistant",
  "Order Requests",
  "Reports",
  "Settings",
] as const;

function formatWhatsappTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatConversationAge(value?: string | null) {
  if (!value) return "00:00";
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1_000),
  );
  const hours = Math.floor(elapsedSeconds / 3_600);
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const quoteCsvValue = (value: string) => `"${value.replaceAll('"', '""')}"`;

function exportWhatsappContacts(data: {
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    whatsappPhone: string | null;
  }>;
  contactProfiles: Array<{
    contactId: string;
    marketingOptIn: boolean;
    utilityOptIn: boolean;
  }>;
  tags: Array<{ id: string; name: string }>;
  contactTagAssignments: Array<{ contactId: string; tagId: string }>;
}) {
  const rows = data.contacts.map((contact) => {
    const profile = data.contactProfiles.find(
      (item) => item.contactId === contact.id,
    );
    const tagIds = new Set(
      data.contactTagAssignments
        .filter((item) => item.contactId === contact.id)
        .map((item) => item.tagId),
    );
    return [
      contact.firstName,
      contact.lastName ?? "",
      contact.email ?? "",
      contact.phone ?? "",
      contact.whatsappPhone ?? "",
      data.tags
        .filter((tag) => tagIds.has(tag.id))
        .map((tag) => tag.name)
        .join("; "),
      profile?.marketingOptIn ? "yes" : "no",
      profile?.utilityOptIn ? "yes" : "no",
    ];
  });
  const csv = [
    [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "WhatsApp phone",
      "Tags",
      "Marketing opt-in",
      "Utility opt-in",
    ],
    ...rows,
  ]
    .map((row) => row.map((value) => quoteCsvValue(value)).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ConversationStatusFilter =
  | "all"
  | (typeof whatsappConversationStatuses)[number];

/**
 * Narrow a select's value against the real status list. A cast would compile
 * even after the options and the list drift apart.
 */
function isConversationStatusFilter(
  value: string,
): value is ConversationStatusFilter {
  return (
    value === "all" ||
    (whatsappConversationStatuses as readonly string[]).includes(value)
  );
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
    | "contact"
    | null
  >(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationStatusFilter, setConversationStatusFilter] =
    useState<ConversationStatusFilter>("all");
  const [tagName, setTagName] = useState("");
  const [attributeKey, setAttributeKey] = useState("");
  const [attributeValue, setAttributeValue] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [activeSection, setActiveSection] =
    useState<(typeof whatsappSections)[number]>("Inbox");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
    // Meta reaches the server quickly. Poll only while this page is visible so
    // the operator sees inbound messages without manually refreshing.
    refetchInterval: 2_500,
    refetchIntervalInBackground: false,
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
  const updateContactProfile = useMutation({
    mutationFn: (data: {
      contactId: string;
      marketingOptIn?: boolean;
      utilityOptIn?: boolean;
      useWhatsappName?: boolean;
    }) => updateWhatsappContactProfile({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
    },
    onError: showError,
  });
  const addContactTag = useMutation({
    mutationFn: (data: { contactId: string; name: string }) =>
      addWhatsappContactTag({ data }),
    onSuccess: async () => {
      setTagName("");
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
    },
    onError: showError,
  });
  const saveContactAttribute = useMutation({
    mutationFn: (data: { contactId: string; key: string; value: string }) =>
      upsertWhatsappContactAttribute({ data }),
    onSuccess: async () => {
      setAttributeKey("");
      setAttributeValue("");
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
    },
    onError: showError,
  });
  const addInternalNote = useMutation({
    mutationFn: (data: { conversationId: string; body: string }) =>
      createWhatsappInternalNote({ data }),
    onSuccess: async () => {
      setInternalNote("");
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
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
  const createContact = useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      whatsappPhone?: string;
    }) => createCrmContact({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setForm(null);
      toast.success("Contact created");
    },
    onError: showError,
  });
  const createAndLinkContact = useMutation({
    mutationFn: async (data: {
      conversationId: string;
      displayName: string;
      whatsappPhone: string;
    }) => {
      const nameParts = data.displayName.trim().split(/\s+/);
      const firstName = nameParts.shift()!;
      const contact = await createCrmContact({
        data: {
          firstName,
          lastName: nameParts.join(" ") || undefined,
          phone: data.whatsappPhone,
          whatsappPhone: data.whatsappPhone,
        },
      });
      await updateWhatsappConversation({
        data: {
          conversationId: data.conversationId,
          contactId: contact.id,
        },
      });
      return contact;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      setNewContactName("");
      toast.success("Contact created and linked to this conversation");
    },
    onError: showError,
  });
  const latestMessageId = query.data?.messages.at(-1)?.id;
  useEffect(() => {
    if (activeSection !== "Inbox") return;
    const frame = requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSection, latestMessageId, selectedConversationId]);
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
  const selectedConversation =
    data.conversations.find((item) => item.id === selectedConversationId) ??
    data.conversations[0];
  const selectedContact = data.contacts.find(
    (contact) => contact.id === selectedConversation?.contactId,
  );
  const selectedMessages = selectedConversation
    ? data.messages.filter(
        (message) => message.conversationId === selectedConversation.id,
      )
    : [];
  const selectedProfile = data.contactProfiles.find(
    (profile) => profile.contactId === selectedContact?.id,
  );
  const selectedTagIds = new Set(
    data.contactTagAssignments
      .filter((assignment) => assignment.contactId === selectedContact?.id)
      .map((assignment) => assignment.tagId),
  );
  const selectedTags = data.tags.filter((tag) => selectedTagIds.has(tag.id));
  const selectedAttributes = data.contactAttributes.filter(
    (attribute) => attribute.contactId === selectedContact?.id,
  );
  const selectedNotes = data.internalNotes.filter(
    (note) => note.conversationId === selectedConversation?.id,
  );
  const visibleConversations = data.conversations.filter((conversation) => {
    if (
      conversationStatusFilter !== "all" &&
      conversation.status !== conversationStatusFilter
    )
      return false;
    const term = conversationSearch.trim().toLowerCase();
    if (!term) return true;
    const contact = data.contacts.find(
      (candidate) => candidate.id === conversation.contactId,
    );
    return [
      conversation.externalConversationId,
      contact?.firstName,
      contact?.lastName,
      contact?.phone,
      contact?.whatsappPhone,
    ].some((value) => value?.toLowerCase().includes(term));
  });
  return (
    <Workspace
      title="WhatsApp"
      subtitle="Shared inbox, campaigns, templates, automations, and order requests."
      compact={activeSection === "Inbox"}
      actions={
        <>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setActiveSection("Settings");
              setForm("connection");
            }}
          >
            <Cable className="size-4" /> Connection
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setActiveSection("Templates");
              setForm("template");
            }}
          >
            <Plus className="size-4" /> Template
          </button>
        </>
      }
    >
      <nav className="flex gap-1 overflow-x-auto border-b border-base-300">
        {whatsappSections.map((section) => (
          <button
            key={section}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${activeSection === section ? "border-primary font-semibold text-base-content" : "border-transparent text-base-content/60 hover:text-base-content"}`}
            onClick={() => {
              setActiveSection(section);
              setForm(null);
            }}
          >
            {section}
          </button>
        ))}
      </nav>
      {form === "connection" ? (
        <SimpleForm
          stacked
          meta={CONNECTION_FIELD_META}
          fields={[
            "displayPhoneNumber",
            "accessToken",
            "externalAccountId",
            "phoneNumberId",
            "businessAccountId",
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
          stacked
          meta={CONNECTION_FIELD_META}
          fields={[
            "connectionId",
            "accessToken",
            "displayPhoneNumber",
            "phoneNumberId",
            "businessAccountId",
          ]}
          locked={["connectionId"]}
          defaults={{
            connectionId: data.connections[0]?.id,
            displayPhoneNumber:
              data.connections[0]?.displayPhoneNumber ?? undefined,
            phoneNumberId: data.connections[0]?.phoneNumberId ?? undefined,
            businessAccountId:
              data.connections[0]?.businessAccountId ?? undefined,
          }}
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
      {form === "contact" ? (
        <SimpleForm
          fields={["firstName", "lastName", "email", "phone", "whatsappPhone"]}
          onSubmit={(values) =>
            createContact.mutate({
              firstName: values.firstName,
              lastName: values.lastName || undefined,
              email: values.email || undefined,
              phone: values.phone || undefined,
              whatsappPhone: values.whatsappPhone || undefined,
            })
          }
        />
      ) : null}
      {activeSection === "Reports" ? (
        <Metrics
          items={[
            ["Connections", data.connections.length],
            [
              "Open conversations",
              data.conversations.filter((item) => item.status === "open")
                .length,
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
      ) : null}
      {activeSection === "Inbox" ? (
        <section className="flex h-[calc(100dvh-112px)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100">
          {data.conversations.length ? (
            <div className="grid min-h-0 flex-1 lg:grid-cols-[256px_minmax(0,1fr)_250px]">
              <aside className="min-h-0 border-b border-base-300 lg:border-r lg:border-b-0">
                <div className="space-y-2 border-b border-base-300 p-2.5">
                  <div className="flex gap-1.5">
                    <label className="input input-bordered input-sm flex min-w-0 flex-1 items-center gap-2">
                      <Search className="size-4 opacity-50" />
                      <input
                        aria-label="Search conversations"
                        className="min-w-0 grow"
                        placeholder="Search conversations…"
                        value={conversationSearch}
                        onChange={(event) =>
                          setConversationSearch(event.target.value)
                        }
                      />
                    </label>
                    <button
                      aria-label="Add a WhatsApp contact"
                      className="btn btn-outline btn-square btn-sm"
                      title="Add a contact"
                      onClick={() => {
                        setActiveSection("Contacts");
                        setForm("contact");
                      }}
                    >
                      <MessageSquarePlus className="size-4" />
                    </button>
                  </div>
                  <select
                    aria-label="Filter conversations"
                    className="select select-bordered select-sm w-full"
                    value={conversationStatusFilter}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (isConversationStatusFilter(next)) {
                        setConversationStatusFilter(next);
                      }
                    }}
                  >
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Solved</option>
                  </select>
                </div>
                <div className="h-[calc(100%-90px)] overflow-y-auto">
                  {visibleConversations.map((conversation) => {
                    const contact = data.contacts.find(
                      (candidate) => candidate.id === conversation.contactId,
                    );
                    const name =
                      [contact?.firstName, contact?.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                      conversation.externalConversationId ||
                      "WhatsApp contact";
                    const lastMessage = data.messages
                      .filter(
                        (message) => message.conversationId === conversation.id,
                      )
                      .at(-1);
                    return (
                      <button
                        key={conversation.id}
                        className={`flex w-full gap-3 border-b border-base-200 p-3 text-left transition-colors hover:bg-base-200/60 ${selectedConversation?.id === conversation.id ? "bg-primary/10" : ""}`}
                        onClick={() =>
                          setSelectedConversationId(conversation.id)
                        }
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">
                              {name}
                            </p>
                            <span className="text-[10px] text-base-content/50">
                              {formatWhatsappTime(conversation.lastMessageAt)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-base-content/60">
                            {lastMessage?.body || "No messages yet"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="flex min-h-0 min-w-0 flex-col">
                <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-base-300 px-3 py-2">
                  {selectedConversation ? (
                    <select
                      aria-label="Assign conversation"
                      className="select select-bordered select-sm w-36"
                      value={selectedConversation.assignedMemberId ?? ""}
                      disabled={updateConversation.isPending}
                      onChange={(event) =>
                        updateConversation.mutate({
                          conversationId: selectedConversation.id,
                          assignedMemberId: event.currentTarget.value || null,
                        })
                      }
                    >
                      <option value="">Bot / automation</option>
                      {data.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || member.email}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {[selectedContact?.firstName, selectedContact?.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                        selectedConversation?.externalConversationId ||
                        "Conversation"}
                    </p>
                    <p className="text-xs text-base-content/55">
                      {selectedConversation?.externalConversationId}
                    </p>
                  </div>
                  {selectedConversation ? (
                    <>
                      <span className="badge badge-info badge-sm capitalize">
                        {selectedConversation.status === "closed"
                          ? "Solved"
                          : selectedConversation.status}
                      </span>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={updateConversation.isPending}
                        onClick={() => {
                          updateConversation.mutate({
                            conversationId: selectedConversation.id,
                            status:
                              selectedConversation.status === "closed"
                                ? "open"
                                : "closed",
                          });
                        }}
                      >
                        <CheckCircle2 className="size-4" />
                        {selectedConversation.status === "closed"
                          ? "Reopen"
                          : "Mark as solved"}
                      </button>
                      <span
                        className="badge badge-ghost badge-sm font-mono text-[10px]"
                        title="Time since last message"
                      >
                        {formatConversationAge(
                          selectedConversation.lastMessageAt,
                        )}
                      </span>
                    </>
                  ) : null}
                </header>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-base-200/25 p-4">
                  {selectedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${message.direction === "outbound" ? "rounded-br-md bg-primary text-primary-content" : "rounded-bl-md border border-base-300 bg-base-100"}`}
                      >
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={`mt-1 text-right text-[10px] ${message.direction === "outbound" ? "text-primary-content/70" : "text-base-content/45"}`}
                        >
                          {formatWhatsappTime(
                            message.sentAt || message.createdAt,
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!selectedMessages.length ? (
                    <Empty text="No messages in this conversation yet." />
                  ) : null}
                  <div ref={transcriptEndRef} aria-hidden="true" />
                </div>
                {selectedConversation ? (
                  <div className="shrink-0 border-t border-base-300 p-3">
                    <SimpleForm
                      fields={["body"]}
                      submitLabel="Send"
                      isSubmitting={reply.isPending}
                      resetOnSubmit
                      onSubmit={(values) =>
                        reply.mutate({
                          conversationId: selectedConversation.id,
                          body: values.body,
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>

              <aside className="min-h-0 overflow-y-auto border-t border-base-300 p-3 lg:border-t-0 lg:border-l">
                <div className="mb-3 border-b border-base-300 pb-3 text-center">
                  <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-base-200">
                    <UserRound className="size-5" />
                  </div>
                  <p className="font-semibold">
                    {[selectedContact?.firstName, selectedContact?.lastName]
                      .filter(Boolean)
                      .join(" ") || "WhatsApp contact"}
                  </p>
                  <p className="text-xs text-base-content/55">
                    {selectedConversation?.externalConversationId}
                  </p>
                </div>
                {selectedConversation ? (
                  <div className="space-y-4">
                    <label className="form-control gap-1">
                      <span className="text-xs font-medium">CRM contact</span>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={selectedConversation.contactId ?? ""}
                        disabled={updateConversation.isPending}
                        onChange={(event) =>
                          updateConversation.mutate({
                            conversationId: selectedConversation.id,
                            contactId: event.currentTarget.value || null,
                          })
                        }
                      >
                        <option value="">Not linked</option>
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
                    </label>
                    {!selectedContact ? (
                      <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                        <p className="text-xs font-medium">
                          Create contact from this chat
                        </p>
                        <p className="text-[11px] text-base-content/55">
                          {selectedConversation.externalConversationId}
                        </p>
                        <input
                          aria-label="New contact name"
                          className="input input-bordered input-sm w-full"
                          placeholder="Contact name"
                          value={newContactName}
                          onChange={(event) =>
                            setNewContactName(event.target.value)
                          }
                        />
                        <button
                          className="btn btn-primary btn-sm w-full"
                          disabled={
                            !newContactName.trim() ||
                            !selectedConversation.externalConversationId ||
                            createAndLinkContact.isPending
                          }
                          onClick={() =>
                            createAndLinkContact.mutate({
                              conversationId: selectedConversation.id,
                              displayName: newContactName,
                              whatsappPhone:
                                selectedConversation.externalConversationId!,
                            })
                          }
                        >
                          {createAndLinkContact.isPending
                            ? "Creating…"
                            : "Create & link"}
                        </button>
                      </div>
                    ) : null}
                    <div className="rounded-lg bg-base-200/60 p-3 text-xs text-base-content/65">
                      Messages: {selectedMessages.length}
                      <br />
                      Status: {selectedConversation.status}
                    </div>
                    {selectedContact ? (
                      <>
                        <div className="space-y-2 border-t border-base-300 pt-4">
                          <ContactToggle
                            label="Marketing opt-in"
                            checked={selectedProfile?.marketingOptIn ?? false}
                            disabled={updateContactProfile.isPending}
                            onChange={(marketingOptIn) =>
                              updateContactProfile.mutate({
                                contactId: selectedContact.id,
                                marketingOptIn,
                              })
                            }
                          />
                          <ContactToggle
                            label="Utility opt-in"
                            checked={selectedProfile?.utilityOptIn ?? false}
                            disabled={updateContactProfile.isPending}
                            onChange={(utilityOptIn) =>
                              updateContactProfile.mutate({
                                contactId: selectedContact.id,
                                utilityOptIn,
                              })
                            }
                          />
                          <ContactToggle
                            label="Use WhatsApp name"
                            checked={selectedProfile?.useWhatsappName ?? true}
                            disabled={updateContactProfile.isPending}
                            onChange={(useWhatsappName) =>
                              updateContactProfile.mutate({
                                contactId: selectedContact.id,
                                useWhatsappName,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2 border-t border-base-300 pt-4">
                          <p className="text-xs font-semibold">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="badge badge-ghost badge-sm"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <input
                              aria-label="New contact tag"
                              className="input input-bordered input-sm min-w-0 flex-1"
                              placeholder="Add tag"
                              value={tagName}
                              onChange={(event) =>
                                setTagName(event.target.value)
                              }
                            />
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={
                                !tagName.trim() || addContactTag.isPending
                              }
                              onClick={() =>
                                addContactTag.mutate({
                                  contactId: selectedContact.id,
                                  name: tagName,
                                })
                              }
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 border-t border-base-300 pt-4">
                          <p className="text-xs font-semibold">
                            Custom parameters
                          </p>
                          {selectedAttributes.map((attribute) => (
                            <p
                              key={attribute.id}
                              className="text-xs text-base-content/65"
                            >
                              <span className="font-medium text-base-content">
                                {attribute.key}:
                              </span>{" "}
                              {attribute.value}
                            </p>
                          ))}
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              aria-label="Parameter key"
                              className="input input-bordered input-sm min-w-0"
                              placeholder="Key"
                              value={attributeKey}
                              onChange={(event) =>
                                setAttributeKey(event.target.value)
                              }
                            />
                            <input
                              aria-label="Parameter value"
                              className="input input-bordered input-sm min-w-0"
                              placeholder="Value"
                              value={attributeValue}
                              onChange={(event) =>
                                setAttributeValue(event.target.value)
                              }
                            />
                          </div>
                          <button
                            className="btn btn-outline btn-sm w-full"
                            disabled={
                              !attributeKey.trim() ||
                              !attributeValue.trim() ||
                              saveContactAttribute.isPending
                            }
                            onClick={() =>
                              saveContactAttribute.mutate({
                                contactId: selectedContact.id,
                                key: attributeKey,
                                value: attributeValue,
                              })
                            }
                          >
                            Save parameter
                          </button>
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-2 border-t border-base-300 pt-4">
                      <p className="text-xs font-semibold">Internal notes</p>
                      <div className="max-h-28 space-y-2 overflow-y-auto">
                        {selectedNotes.map((note) => (
                          <div
                            key={note.id}
                            className="rounded-lg bg-base-200/60 p-2 text-xs"
                          >
                            <p>{note.body}</p>
                            <p className="mt-1 text-[10px] text-base-content/45">
                              {formatWhatsappTime(note.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <textarea
                        aria-label="Internal note"
                        className="textarea textarea-bordered textarea-sm w-full"
                        placeholder="Only your team can see notes…"
                        value={internalNote}
                        onChange={(event) =>
                          setInternalNote(event.target.value)
                        }
                      />
                      <button
                        className="btn btn-outline btn-sm w-full"
                        disabled={
                          !internalNote.trim() || addInternalNote.isPending
                        }
                        onClick={() =>
                          addInternalNote.mutate({
                            conversationId: selectedConversation.id,
                            body: internalNote,
                          })
                        }
                      >
                        Add note
                      </button>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : (
            <div className="p-10">
              <Empty text="No conversations yet. Send a WhatsApp message to your connected number and it will appear here." />
            </div>
          )}
        </section>
      ) : null}
      {activeSection === "Contacts" ? (
        <Panel title="Contacts" icon={UserRound}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 p-3">
            <p className="text-sm text-base-content/60">
              {data.contacts.length} contact
              {data.contacts.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-outline btn-sm"
                disabled={!data.contacts.length}
                onClick={() => exportWhatsappContacts(data)}
              >
                <Download className="size-4" /> Export
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setForm("contact")}
              >
                <Plus className="size-4" /> Add contact
              </button>
            </div>
          </div>
          {data.contacts.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Tags</th>
                    <th>Marketing</th>
                    <th>Utility</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.map((contactRow) => {
                    const profile = data.contactProfiles.find(
                      (item) => item.contactId === contactRow.id,
                    );
                    const tagIds = new Set(
                      data.contactTagAssignments
                        .filter((item) => item.contactId === contactRow.id)
                        .map((item) => item.tagId),
                    );
                    return (
                      <tr key={contactRow.id}>
                        <td className="font-medium">
                          {[contactRow.firstName, contactRow.lastName]
                            .filter(Boolean)
                            .join(" ") || "WhatsApp contact"}
                        </td>
                        <td>
                          {contactRow.whatsappPhone || contactRow.phone || "—"}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {data.tags
                              .filter((tag) => tagIds.has(tag.id))
                              .map((tag) => (
                                <span
                                  key={tag.id}
                                  className="badge badge-ghost badge-sm"
                                >
                                  {tag.name}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td>{profile?.marketingOptIn ? "Opted in" : "No"}</td>
                        <td>{profile?.utilityOptIn ? "Opted in" : "No"}</td>
                        <td>
                          {new Date(contactRow.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Contacts linked from WhatsApp conversations will appear here." />
          )}
        </Panel>
      ) : null}
      {activeSection === "Templates" ? (
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
      ) : null}
      {activeSection === "Campaigns" ? (
        <Panel title="Campaigns" icon={MessageCircleMore}>
          <div className="border-b border-base-300 p-3">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setForm("campaign")}
            >
              <Plus className="size-4" /> Campaign
            </button>
          </div>
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
      ) : null}
      {activeSection === "Automation" ? (
        <Panel title="Automations" icon={Bot}>
          <div className="border-b border-base-300 p-3">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setForm("automation")}
            >
              <Plus className="size-4" /> Automation
            </button>
          </div>
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
      ) : null}
      {activeSection === "Order Requests" ? (
        <Panel title="Order requests" icon={FileText}>
          <div className="border-b border-base-300 p-3">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setForm("order")}
            >
              <Plus className="size-4" /> Order request
            </button>
          </div>
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
      ) : null}
      {activeSection === "AI Assistant" ? (
        <Panel title="AI Assistant" icon={Bot}>
          <Empty text="Connect Claude Haiku from Integrations to enable tenant-specific assisted replies." />
        </Panel>
      ) : null}
      {activeSection === "Settings" ? (
        <Panel title="WhatsApp connection" icon={Cable}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">
                {data.connections[0]?.displayPhoneNumber ||
                  "No WhatsApp number connected"}
              </p>
              <p className="text-sm text-base-content/55">
                {data.connections[0]?.status || "Not configured"}
              </p>
            </div>
            {data.connections.length ? (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setForm("connection-update")}
              >
                Update connection
              </button>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </Workspace>
  );
}

function ContactToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-sm"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export function VoiceWorkspace() {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [agentName, setAgentName] = useState("Digital Urgency Assistant");
  const [credentialReference, setCredentialReference] =
    useState("OPENSEO_VOICE");
  const [recordingConversationId, setRecordingConversationId] = useState<
    string | null
  >(null);
  const [continuousConversationId, setContinuousConversationId] = useState<
    string | null
  >(null);
  const continuousRef = useRef<string | null>(null);
  const recorderRef = useRef<{
    recorder: MediaRecorder;
    chunks: Blob[];
    conversationId: string;
    stream: MediaStream;
    audioContext?: AudioContext;
    animationFrame?: number;
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
      setAgentName("Digital Urgency Assistant");
      setCredentialReference("OPENSEO_VOICE");
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
    onSuccess: async (result, variables) => {
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
        audio.addEventListener("ended", () => {
          if (continuousRef.current === variables.conversationId) {
            void beginRecording(variables.conversationId, true);
          }
        });
        await audio.play().catch(() => {
          toast.warning(
            "The reply is ready, but browser audio playback was blocked.",
          );
          if (continuousRef.current === variables.conversationId) {
            void beginRecording(variables.conversationId, true);
          }
        });
      } else if (continuousRef.current === variables.conversationId) {
        void beginRecording(variables.conversationId, true);
      }
    },
    onError: showError,
  });
  const beginRecording = async (conversationId: string, continuous = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorder = new MediaRecorder(stream);
      const state: {
        recorder: MediaRecorder;
        chunks: Blob[];
        conversationId: string;
        stream: MediaStream;
        audioContext?: AudioContext;
        animationFrame?: number;
      } = { recorder, chunks: [], conversationId, stream };
      recorderRef.current = state;
      recorder.ondataavailable = (event) => {
        if (event.data.size) state.chunks.push(event.data);
      };
      recorder.onstop = async () => {
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
        await state.audioContext?.close();
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
      if (continuous) {
        continuousRef.current = conversationId;
        setContinuousConversationId(conversationId);
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        state.audioContext = audioContext;
        const levels = new Uint8Array(analyser.frequencyBinCount);
        const startedAt = Date.now();
        let heardSpeech = false;
        let quietSince: number | null = null;
        const listen = () => {
          if (recorder.state !== "recording") return;
          analyser.getByteFrequencyData(levels);
          const average =
            levels.reduce((total, value) => total + value, 0) / levels.length;
          if (average > 14) {
            heardSpeech = true;
            quietSince = null;
          } else if (heardSpeech) {
            quietSince ??= Date.now();
            if (Date.now() - quietSince > 1100) {
              recorder.stop();
              return;
            }
          }
          if (Date.now() - startedAt > 30_000) {
            recorder.stop();
            return;
          }
          state.animationFrame = requestAnimationFrame(listen);
        };
        listen();
      }
    } catch (error) {
      continuousRef.current = null;
      setContinuousConversationId(null);
      showError(error);
    }
  };
  const stopRecording = (endContinuous = false) => {
    if (endContinuous) {
      continuousRef.current = null;
      setContinuousConversationId(null);
    }
    recorderRef.current?.recorder.stop();
  };
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorBox error={query.error} />;
  return (
    <Workspace
      title="Voice Agent"
      subtitle="Browser voice assistants now; telephony remains a separate provider capability."
      actions={null}
    >
      {adding ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Agent name</span>
              <input
                className="input input-bordered input-sm"
                value={agentName}
                onChange={(event) => setAgentName(event.currentTarget.value)}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs">
                Railway credential reference
              </span>
              <input
                className="input input-bordered input-sm"
                value={credentialReference}
                onChange={(event) =>
                  setCredentialReference(event.currentTarget.value)
                }
              />
            </label>
            <button
              className="btn btn-primary btn-sm self-end"
              disabled={!agentName.trim() || !credentialReference.trim()}
              onClick={() =>
                mutation.mutate({
                  name: agentName.trim(),
                  speechToTextProvider: "deepgram",
                  textToSpeechProvider: "deepgram",
                  modelProvider: "anthropic",
                  credentialReference: credentialReference.trim(),
                })
              }
            >
              Create agent
            </button>
          </div>
          <p className="mt-2 text-xs text-base-content/55">
            Uses Deepgram for listening and speech, Anthropic for answers, and
            learns durable lessons from this organization&apos;s conversations.
          </p>
        </div>
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
                            ? stopRecording(
                                continuousConversationId === conversation.id,
                              )
                            : beginRecording(conversation.id)
                        }
                      >
                        {recordingConversationId === conversation.id
                          ? "Stop recording"
                          : "Record"}
                      </button>
                      <button
                        className={`btn btn-xs ${continuousConversationId === conversation.id ? "btn-error" : "btn-outline"}`}
                        onClick={() =>
                          continuousConversationId === conversation.id
                            ? stopRecording(true)
                            : beginRecording(conversation.id, true)
                        }
                      >
                        {continuousConversationId === conversation.id
                          ? "Stop conversation"
                          : "Conversation mode"}
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
                {messages
                  .toReversed()
                  .slice(-20)
                  .map((message) => (
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
          payload: { message: "Digital Urgency signed webhook test" },
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
  compact = false,
}: {
  title: string;
  subtitle: string;
  actions: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-5"}>
      {!compact ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-base leading-6 text-base-content/65">
              {subtitle}
            </p>
          </div>
          <div className="flex gap-2">{actions}</div>
        </div>
      ) : null}
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

type FieldMeta = { label: string; hint?: string };

/**
 * Labels and hints for the connection forms. Both providers share one form,
 * so each hint says which provider a field belongs to and where its value
 * comes from — the questions an operator asks while filling it in.
 */
const CONNECTION_FIELD_META: Record<string, FieldMeta> = {
  provider: {
    label: "Provider",
    hint: "meta_cloud for a number on Meta's Cloud API. twilio for a WhatsApp sender in a Twilio account.",
  },
  connectionId: {
    label: "Connection",
    hint: "Filled in from the connection being updated.",
  },
  displayPhoneNumber: {
    label: "Phone number",
    hint: "International format, e.g. +61400000000. Leave blank on an update to keep the stored one.",
  },
  phoneNumberId: {
    label: "Phone number ID (Meta only)",
    hint: "From WhatsApp Manager in Meta Business Suite. Leave empty for Twilio.",
  },
  businessAccountId: {
    label: "Business account ID (Meta only)",
    hint: "The WhatsApp Business Account ID in Meta Business Manager. Leave empty for Twilio.",
  },
  accessToken: {
    label: "Access token (Meta) or Auth token (Twilio)",
    hint: "Meta: a permanent system-user token. Twilio: the Auth Token under Account settings → API keys & tokens, in the account that owns the sender. Never shown again after saving.",
  },
  externalAccountId: {
    label: "Account SID (Twilio only)",
    hint: "The Twilio Account SID that owns the sender, starting with AC. A subaccount SID is fine. Leave empty for Meta.",
  },
  credentialReference: {
    label: "Credential reference (optional)",
    hint: "A note for your team on where this secret is kept.",
  },
};

function placeholderFor(field: string) {
  return field === "body"
    ? "Write a message…"
    : field.replace(/([A-Z])/g, " $1");
}

function SimpleForm({
  fields,
  select,
  submitLabel = "Save",
  isSubmitting = false,
  resetOnSubmit = false,
  stacked = false,
  meta,
  defaults,
  locked,
  onSubmit,
}: {
  fields: string[];
  select?: { name: string; options: string[] };
  submitLabel?: string;
  isSubmitting?: boolean;
  resetOnSubmit?: boolean;
  /** One field per row with a label and hint, for forms people read slowly. */
  stacked?: boolean;
  meta?: Record<string, FieldMeta>;
  defaults?: Record<string, string | undefined>;
  /** Fields shown for context but not editable. */
  locked?: readonly string[];
  onSubmit: (values: Record<string, string>) => void;
}) {
  const frame = "rounded-xl border border-primary/30 bg-primary/5 p-4";
  const wrap = (field: string, control: React.ReactNode) => {
    if (!stacked) return control;
    const info = meta?.[field];
    return (
      <label key={field} className="form-control w-full">
        <span className="mb-1 text-sm font-medium">
          {info?.label ?? placeholderFor(field)}
        </span>
        {control}
        {info?.hint ? (
          <span className="mt-1 text-xs text-base-content/60">{info.hint}</span>
        ) : null}
      </label>
    );
  };
  return (
    <form
      className={
        stacked
          ? `grid max-w-2xl gap-3 ${frame}`
          : `flex flex-wrap gap-2 ${frame}`
      }
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const values = Object.fromEntries(
          [...fields, ...(select ? [select.name] : [])].map((name) => [
            name,
            fieldValue(data, name),
          ]),
        );
        onSubmit(values);
        if (resetOnSubmit) event.currentTarget.reset();
      }}
    >
      {select
        ? wrap(
            select.name,
            <select
              name={select.name}
              defaultValue={defaults?.[select.name]}
              className={`select select-bordered select-sm ${stacked ? "w-full" : ""}`}
            >
              {select.options.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>,
          )
        : null}
      {fields.map((field, index) =>
        wrap(
          field,
          <input
            key={field}
            name={field}
            required={index === 0}
            // A token is masked as it is typed and kept out of the browser's
            // autofill store. It is never rendered back: the server returns
            // which credentials are set, not their values.
            type={SECRET_FIELDS.has(field) ? "password" : "text"}
            autoComplete={SECRET_FIELDS.has(field) ? "off" : undefined}
            disabled={isSubmitting}
            readOnly={locked?.includes(field)}
            defaultValue={defaults?.[field]}
            className={
              stacked
                ? "input input-bordered input-sm w-full"
                : "input input-bordered input-sm min-w-44 flex-1"
            }
            placeholder={placeholderFor(field)}
          />,
        ),
      )}
      <div className={stacked ? "flex justify-end" : "contents"}>
        <button className="btn btn-primary btn-sm" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : submitLabel}
        </button>
      </div>
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

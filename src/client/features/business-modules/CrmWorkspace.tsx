import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, CalendarDays, Inbox, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmCompany,
  createCrmContact,
  createCrmInquiry,
  createCrmMeeting,
  getCrmWorkspace,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function CrmWorkspace() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<
    "contact" | "company" | "inquiry" | "meeting" | null
  >(null);
  const query = useQuery({
    queryKey: ["crm", "workspace"],
    queryFn: () => getCrmWorkspace(),
  });
  const contactMutation = useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }) => createCrmContact({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Contact created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const companyMutation = useMutation({
    mutationFn: (data: { name: string; website?: string; phone?: string }) =>
      createCrmCompany({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Company created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const inquiryMutation = useMutation({
    mutationFn: (data: {
      title: string;
      product?: string;
      description?: string;
      targetValueCents: number;
    }) => createCrmInquiry({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Inquiry created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const meetingMutation = useMutation({
    mutationFn: (data: {
      title: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      meetingUrl?: string;
    }) => createCrmMeeting({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "workspace"] });
      setMode(null);
      toast.success("Meeting scheduled");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (query.isLoading)
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  if (query.isError)
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-sm text-base-content/60">
            One organization-wide directory for customers, prospects, and
            companies.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMode("meeting")}
          >
            <CalendarDays className="size-4" /> Meeting
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMode("inquiry")}
          >
            <Inbox className="size-4" /> Inquiry
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setMode("company")}
          >
            <Building2 className="size-4" /> Company
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setMode("contact")}
          >
            <Plus className="size-4" /> Contact
          </button>
        </div>
      </div>
      {mode === "contact" ? (
        <InlineForm
          fields={["firstName", "lastName", "email", "phone"]}
          pending={contactMutation.isPending}
          onSubmit={(data) =>
            contactMutation.mutate({
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
            })
          }
        />
      ) : null}
      {mode === "company" ? (
        <InlineForm
          fields={["name", "website", "phone"]}
          pending={companyMutation.isPending}
          onSubmit={(data) =>
            companyMutation.mutate({
              name: data.name,
              website: data.website,
              phone: data.phone,
            })
          }
        />
      ) : null}
      {mode === "inquiry" ? (
        <InlineForm
          fields={["title", "product", "targetValue", "description"]}
          pending={inquiryMutation.isPending}
          onSubmit={(data) =>
            inquiryMutation.mutate({
              title: data.title,
              product: data.product,
              description: data.description,
              targetValueCents: Math.round(Number(data.targetValue || 0) * 100),
            })
          }
        />
      ) : null}
      {mode === "meeting" ? (
        <InlineForm
          fields={["title", "startsAt", "endsAt", "location", "meetingUrl"]}
          pending={meetingMutation.isPending}
          onSubmit={(data) =>
            meetingMutation.mutate({
              title: data.title,
              startsAt: new Date(data.startsAt).toISOString(),
              endsAt: data.endsAt
                ? new Date(data.endsAt).toISOString()
                : undefined,
              location: data.location,
              meetingUrl: data.meetingUrl,
            })
          }
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Contacts{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.contacts.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.contacts.length ? (
              query.data!.contacts.map(({ contact, company }) => (
                <div key={contact.id} className="flex items-center gap-3 p-4">
                  <span className="rounded-full bg-base-200 p-2">
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="truncate text-xs text-base-content/50">
                      {company?.name ??
                        contact.email ??
                        contact.phone ??
                        "No contact details"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No contacts yet" />
            )}
          </div>
        </section>
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Companies{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.companies.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.companies.length ? (
              query.data!.companies.map((company) => (
                <div key={company.id} className="flex items-center gap-3 p-4">
                  <span className="rounded-lg bg-base-200 p-2">
                    <Building2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{company.name}</p>
                    <p className="truncate text-xs text-base-content/50">
                      {company.website ?? company.phone ?? "No company details"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No companies yet" />
            )}
          </div>
        </section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Inquiries{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.inquiries.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.inquiries.length ? (
              query.data!.inquiries.map((inquiry) => (
                <div key={inquiry.id} className="p-4">
                  <p className="font-medium">{inquiry.title}</p>
                  <p className="text-xs text-base-content/50">
                    {inquiry.product ?? "General"} · {inquiry.status}
                  </p>
                </div>
              ))
            ) : (
              <Empty text="No inquiries yet" />
            )}
          </div>
        </section>
        <section className="rounded-xl border border-base-300">
          <div className="border-b border-base-300 p-4">
            <h2 className="font-semibold">
              Meetings{" "}
              <span className="badge badge-sm ml-1">
                {query.data!.meetings.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-base-300">
            {query.data!.meetings.length ? (
              query.data!.meetings.map((meeting) => (
                <div key={meeting.id} className="p-4">
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-xs text-base-content/50">
                    {new Date(meeting.startsAt).toLocaleString()} ·{" "}
                    {meeting.status}
                  </p>
                </div>
              ))
            ) : (
              <Empty text="No meetings scheduled" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function InlineForm({
  fields,
  pending,
  onSubmit,
}: {
  fields: string[];
  pending: boolean;
  onSubmit: (data: Record<string, string>) => void;
}) {
  return (
    <form
      className="flex flex-wrap gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit(
          Object.fromEntries(
            fields.map((field) => [field, fieldValue(form, field)]),
          ),
        );
      }}
    >
      {fields.map((field, index) => (
        <input
          key={field}
          name={field}
          type={
            field === "startsAt" || field === "endsAt"
              ? "datetime-local"
              : "text"
          }
          required={index === 0}
          className="input input-bordered input-sm min-w-40 flex-1"
          placeholder={field.replace(/([A-Z])/g, " $1")}
        />
      ))}
      <button className="btn btn-primary btn-sm" disabled={pending}>
        Save
      </button>
    </form>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-base-content/40">{text}</p>;
}

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

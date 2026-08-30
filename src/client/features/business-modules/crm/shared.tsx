import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmCompany,
  createCrmContact,
  createCrmInquiry,
  createCrmMeeting,
  getCrmWorkspace,
  promoteCrmInquiry,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const WORKSPACE_KEY = ["crm", "workspace"];

type CrmFormMode = "contact" | "company" | "inquiry" | "meeting" | null;

/**
 * Every CRM view reads the same workspace payload. React Query dedupes it, so
 * moving between the sections in the sidebar costs no extra request.
 */
export function useCrmWorkspace() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CrmFormMode>(null);
  const query = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => getCrmWorkspace(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });

  const settled = (message: string) => ({
    onSuccess: async () => {
      await invalidate();
      setMode(null);
      toast.success(message);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const contactMutation = useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }) => createCrmContact({ data }),
    ...settled("Contact created"),
  });
  const companyMutation = useMutation({
    mutationFn: (data: { name: string; website?: string; phone?: string }) =>
      createCrmCompany({ data }),
    ...settled("Company created"),
  });
  const inquiryMutation = useMutation({
    mutationFn: (data: {
      title: string;
      product?: string;
      description?: string;
      targetValueCents: number;
    }) => createCrmInquiry({ data }),
    ...settled("Inquiry created"),
  });
  const meetingMutation = useMutation({
    mutationFn: (data: {
      title: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      meetingUrl?: string;
    }) => createCrmMeeting({ data }),
    ...settled("Meeting scheduled"),
  });
  const promoteInquiryMutation = useMutation({
    mutationFn: (inquiryId: string) =>
      promoteCrmInquiry({ data: { inquiryId, priority: "medium" } }),
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
      ]);
      toast.success("Inquiry promoted to the Leads pipeline");
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  return {
    query,
    mode,
    setMode,
    contactMutation,
    companyMutation,
    inquiryMutation,
    meetingMutation,
    promoteInquiryMutation,
  };
}

export function CrmQueryState({
  query,
}: {
  query: ReturnType<typeof useCrmWorkspace>["query"];
}) {
  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  return (
    <div className="alert alert-error">
      {getStandardErrorMessage(query.error)}
    </div>
  );
}

export function CrmStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-base-content/60">{text}</p>;
}

export function CrmPanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-base-300">
      <div className="border-b border-base-300 px-4 py-3.5">
        <h2 className="text-base font-semibold">
          {title} <span className="badge badge-sm ml-1">{count}</span>
        </h2>
      </div>
      <div className="divide-y divide-base-300">{children}</div>
    </section>
  );
}

type Workspace = NonNullable<
  ReturnType<typeof useCrmWorkspace>["query"]["data"]
>;

export function ContactRows({ workspace }: { workspace: Workspace }) {
  if (!workspace.contacts.length) return <Empty text="No contacts yet" />;
  return (
    <>
      {workspace.contacts.map(({ contact, company }) => (
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
      ))}
    </>
  );
}

export function CompanyRows({ workspace }: { workspace: Workspace }) {
  if (!workspace.companies.length) return <Empty text="No companies yet" />;
  return (
    <>
      {workspace.companies.map((company) => (
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
      ))}
    </>
  );
}

export function InquiryRows({
  workspace,
  onPromote,
  promoting,
}: {
  workspace: Workspace;
  onPromote: (inquiryId: string) => void;
  promoting: boolean;
}) {
  if (!workspace.inquiries.length) return <Empty text="No inquiries yet" />;
  return (
    <>
      {workspace.inquiries.map((inquiry) => (
        <div
          key={inquiry.id}
          className="flex items-center justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{inquiry.title}</p>
            <p className="text-xs text-base-content/50">
              {inquiry.product ?? "General"} · {inquiry.status}
            </p>
          </div>
          {inquiry.status === "open" ? (
            <button
              className="btn btn-primary btn-xs"
              disabled={promoting}
              onClick={() => onPromote(inquiry.id)}
            >
              Promote to lead
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function MeetingRows({ workspace }: { workspace: Workspace }) {
  if (!workspace.meetings.length) return <Empty text="No meetings scheduled" />;
  return (
    <>
      {workspace.meetings.map((meeting) => (
        <div key={meeting.id} className="p-4">
          <p className="font-medium">{meeting.title}</p>
          <p className="text-xs text-base-content/50">
            {new Date(meeting.startsAt).toLocaleString()} · {meeting.status}
          </p>
        </div>
      ))}
    </>
  );
}

export function InlineForm({
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
      className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const data: Record<string, string> = {};
        for (const field of fields) data[field] = fieldValue(form, field);
        onSubmit(data);
      }}
    >
      {fields.map((field) => (
        <input
          key={field}
          name={field}
          placeholder={field}
          className="input input-bordered input-sm flex-1"
          required={field === fields[0]}
        />
      ))}
      <button className="btn btn-primary btn-sm" disabled={pending}>
        Save
      </button>
    </form>
  );
}

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

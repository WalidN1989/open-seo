import {
  Building2,
  CalendarDays,
  Inbox,
  Plus,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import "./overview.css";
import {
  CompanyRows,
  ContactRows,
  CrmPanel,
  CrmQueryState,
  InlineForm,
  InquiryRows,
  MeetingRows,
  useCrmWorkspace,
} from "./shared";

type Crm = ReturnType<typeof useCrmWorkspace>;

/**
 * Title, create actions and the inline form, shared by every CRM section so a
 * user can add a record without first navigating back to the overview.
 */
function CrmHeader({
  crm,
  title,
  description,
}: {
  crm: Crm;
  title: string;
  description: string;
}) {
  const { mode, setMode } = crm;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-base leading-6 text-base-content/65">
            {description}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMode(mode === "meeting" ? null : "meeting")}
          >
            <CalendarDays className="size-4" /> Meeting
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMode(mode === "inquiry" ? null : "inquiry")}
          >
            <Inbox className="size-4" /> Inquiry
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setMode(mode === "company" ? null : "company")}
          >
            <Building2 className="size-4" /> Company
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setMode(mode === "contact" ? null : "contact")}
          >
            <Plus className="size-4" /> Contact
          </button>
        </div>
      </div>
      <CrmForms crm={crm} />
    </div>
  );
}

function CrmForms({ crm }: { crm: Crm }) {
  const {
    mode,
    contactMutation,
    companyMutation,
    inquiryMutation,
    meetingMutation,
  } = crm;
  if (mode === "contact") {
    return (
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
    );
  }
  if (mode === "company") {
    return (
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
    );
  }
  if (mode === "inquiry") {
    return (
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
    );
  }
  if (mode === "meeting") {
    return (
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
    );
  }
  return null;
}

function useCrmView() {
  const crm = useCrmWorkspace();
  return { crm, workspace: crm.query.data };
}

export function CrmOverviewView() {
  const { crm, workspace } = useCrmView();
  if (!workspace) return <CrmQueryState query={crm.query} />;

  const openInquiries = workspace.inquiries.filter(
    (inquiry) => inquiry.status === "open",
  );
  const now = new Date().toISOString();
  const upcomingMeetings = workspace.meetings.filter(
    (meeting) => meeting.status === "scheduled" && meeting.startsAt >= now,
  );

  return (
    <div className="crm-overview space-y-5">
      <CrmHeader
        crm={crm}
        title="CRM"
        description="Your relationships, conversations and next steps."
      />
      <div className="crm-overview-stats">
        {(
          [
            {
              label: "Contacts",
              value: workspace.contacts.length,
              icon: Users,
              to: "/modules/crm/contacts",
              tone: "blue",
            },
            {
              label: "Companies",
              value: workspace.companies.length,
              icon: Building2,
              to: "/modules/crm/companies",
              tone: "teal",
            },
            {
              label: "Open inquiries",
              value: openInquiries.length,
              icon: Inbox,
              to: "/modules/crm/inquiries",
              tone: "amber",
            },
            {
              label: "Upcoming meetings",
              value: upcomingMeetings.length,
              icon: CalendarDays,
              to: "/modules/crm/meetings",
              tone: "violet",
            },
          ] as const
        ).map(({ label, value, icon: Icon, to, tone }) => (
          <Link
            key={label}
            to={to}
            className="crm-overview-stat"
            data-tone={tone}
          >
            <span className="crm-overview-stat-icon">
              <Icon className="size-5" />
            </span>
            <ArrowUpRight className="size-4 opacity-40 ml-auto" />
            <strong>{value}</strong>
            <span className="crm-overview-stat-label">{label}</span>
          </Link>
        ))}
      </div>
      <div className="crm-overview-panels">
        <CrmPanel title="Contacts" count={workspace.contacts.length}>
          <div className="crm-overview-list">
            <ContactRows workspace={workspace} />
          </div>
          <Link to="/modules/crm/contacts" className="crm-overview-more">
            View all contacts <ArrowUpRight className="size-4" />
          </Link>
        </CrmPanel>
        <CrmPanel title="Companies" count={workspace.companies.length}>
          <div className="crm-overview-list">
            <CompanyRows workspace={workspace} />
          </div>
          <Link to="/modules/crm/companies" className="crm-overview-more">
            View all companies <ArrowUpRight className="size-4" />
          </Link>
        </CrmPanel>
        <CrmPanel title="Inquiries" count={workspace.inquiries.length}>
          <div className="crm-overview-list">
            <InquiryRows
              workspace={workspace}
              promoting={crm.promoteInquiryMutation.isPending}
              onPromote={(id) => crm.promoteInquiryMutation.mutate(id)}
            />
          </div>
        </CrmPanel>
        <CrmPanel title="Meetings" count={workspace.meetings.length}>
          <div className="crm-overview-list">
            <MeetingRows workspace={workspace} />
          </div>
        </CrmPanel>
      </div>
    </div>
  );
}

export function CrmContactsView() {
  const { crm, workspace } = useCrmView();
  if (!workspace) return <CrmQueryState query={crm.query} />;
  return (
    <div className="space-y-6">
      <CrmHeader
        crm={crm}
        title="Contacts"
        description="Every person your organization deals with, in one directory."
      />
      <CrmPanel title="Contacts" count={workspace.contacts.length}>
        <ContactRows workspace={workspace} />
      </CrmPanel>
    </div>
  );
}

export function CrmCompaniesView() {
  const { crm, workspace } = useCrmView();
  if (!workspace) return <CrmQueryState query={crm.query} />;
  return (
    <div className="space-y-6">
      <CrmHeader
        crm={crm}
        title="Companies"
        description="The organizations behind your contacts, inquiries, and deals."
      />
      <CrmPanel title="Companies" count={workspace.companies.length}>
        <CompanyRows workspace={workspace} />
      </CrmPanel>
    </div>
  );
}

export function CrmInquiriesView() {
  const { crm, workspace } = useCrmView();
  if (!workspace) return <CrmQueryState query={crm.query} />;
  return (
    <div className="space-y-6">
      <CrmHeader
        crm={crm}
        title="Inquiries"
        description="Incoming interest, ready to promote into the Leads pipeline."
      />
      <CrmPanel title="Inquiries" count={workspace.inquiries.length}>
        <InquiryRows
          workspace={workspace}
          promoting={crm.promoteInquiryMutation.isPending}
          onPromote={(id) => crm.promoteInquiryMutation.mutate(id)}
        />
      </CrmPanel>
    </div>
  );
}

export function CrmMeetingsView() {
  const { crm, workspace } = useCrmView();
  if (!workspace) return <CrmQueryState query={crm.query} />;
  return (
    <div className="space-y-6">
      <CrmHeader
        crm={crm}
        title="Meetings"
        description="Scheduled conversations across the organization."
      />
      <CrmPanel title="Meetings" count={workspace.meetings.length}>
        <MeetingRows workspace={workspace} />
      </CrmPanel>
    </div>
  );
}

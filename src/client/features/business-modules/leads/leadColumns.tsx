import { Mail, MessageCircle, Phone } from "lucide-react";
import {
  DUE_TONE_CLASS,
  HEALTH_META,
  PRIORITY_META,
  computeHealth,
  dueInfo,
  formatMinorUnits,
  timeAgo,
  type LeadHealth,
  type LeadPriority,
} from "@/shared/leads-command";

export type LeadRow = {
  lead: {
    id: string;
    title: string;
    category: string | null;
    source: string | null;
    status: string;
    priority: LeadPriority;
    valueCents: number;
    leadScore: number;
    nextAction: string | null;
    nextActionDue: string | null;
    notes: string | null;
    lastActivityAt: string | null;
    assignedMemberId: string | null;
    updatedAt: string;
    createdAt: string;
  };
  contact: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    whatsappPhone: string | null;
  } | null;
  company: {
    name: string;
    website: string | null;
    industry: string | null;
    country: string | null;
  } | null;
  stage: { name: string } | null;
};

export type ColumnKey =
  | "company"
  | "contact"
  | "comms"
  | "product"
  | "category"
  | "website"
  | "stage"
  | "health"
  | "priority"
  | "owner"
  | "due"
  | "activity"
  | "next"
  | "summary"
  | "value"
  | "score"
  | "source"
  | "country"
  | "industry";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  width: number;
  sortable?: boolean;
  defaultHidden?: boolean;
  numeric?: boolean;
};

export const LEAD_COLUMNS: readonly ColumnDef[] = [
  { key: "company", label: "Company", width: 200, sortable: true },
  { key: "contact", label: "Contact", width: 150, sortable: true },
  // Beside Contact on purpose: reaching WhatsApp or the phone is the most
  // frequent action, and at the far right of a wide table it is the hardest.
  { key: "comms", label: "Comms", width: 96 },
  { key: "product", label: "Opportunity", width: 200, sortable: true },
  { key: "category", label: "Category", width: 150 },
  { key: "website", label: "Website", width: 160 },
  { key: "stage", label: "Stage", width: 130, sortable: true },
  { key: "health", label: "Health", width: 96, sortable: true },
  { key: "priority", label: "Priority", width: 104, sortable: true },
  { key: "owner", label: "Owner", width: 140, sortable: true },
  { key: "due", label: "Due", width: 104, sortable: true },
  { key: "activity", label: "Last activity", width: 118, sortable: true },
  { key: "next", label: "Next action", width: 180 },
  { key: "summary", label: "Summary", width: 240 },
  { key: "value", label: "Value", width: 100, sortable: true, numeric: true },
  { key: "score", label: "Score", width: 80, sortable: true, numeric: true },
  { key: "source", label: "Source", width: 110, defaultHidden: true },
  { key: "country", label: "Country", width: 110, defaultHidden: true },
  { key: "industry", label: "Industry", width: 140, defaultHidden: true },
];

export type MemberLookup = Map<string, string>;

export function contactName(row: LeadRow): string {
  if (!row.contact) return "";
  return [row.contact.firstName, row.contact.lastName]
    .filter(Boolean)
    .join(" ");
}

export function leadHealth(row: LeadRow): LeadHealth {
  return computeHealth({
    status: row.lead.status,
    leadScore: row.lead.leadScore,
    lastActivityAt: row.lead.lastActivityAt,
    updatedAt: row.lead.updatedAt,
    createdAt: row.lead.createdAt,
  });
}

/**
 * The value a column sorts and filters on. Kept separate from the cell so a
 * column that renders links or badges still sorts on something meaningful.
 */
const CELL_VALUES: Record<
  ColumnKey,
  (row: LeadRow, members: MemberLookup) => string | number
> = {
  company: (row) => row.company?.name ?? "",
  contact: (row) => contactName(row),
  comms: (row) => row.contact?.email ?? row.contact?.phone ?? "",
  product: (row) => row.lead.title,
  category: (row) => row.lead.category ?? "",
  website: (row) => row.company?.website ?? "",
  stage: (row) => row.stage?.name ?? "",
  health: (row) => HEALTH_META[leadHealth(row)].order,
  priority: (row) => PRIORITY_META[row.lead.priority].order,
  owner: (row, members) =>
    row.lead.assignedMemberId
      ? (members.get(row.lead.assignedMemberId) ?? "")
      : "",
  // No due date sorts last rather than first: an unscheduled lead is not more
  // urgent than one due tomorrow.
  due: (row) =>
    row.lead.nextActionDue
      ? new Date(row.lead.nextActionDue).getTime()
      : Number.MAX_SAFE_INTEGER,
  activity: (row) =>
    row.lead.lastActivityAt ? new Date(row.lead.lastActivityAt).getTime() : 0,
  next: (row) => row.lead.nextAction ?? "",
  summary: (row) => row.lead.notes ?? "",
  value: (row) => row.lead.valueCents,
  score: (row) => row.lead.leadScore,
  source: (row) => row.lead.source ?? "",
  country: (row) => row.company?.country ?? "",
  industry: (row) => row.company?.industry ?? "",
};

export function cellValue(
  row: LeadRow,
  key: ColumnKey,
  members: MemberLookup,
): string | number {
  return CELL_VALUES[key](row, members);
}

const EMPTY = <span className="text-base-content/25">—</span>;

function CommsCell({ row }: { row: LeadRow }) {
  const contact = row.contact;
  if (!contact) return EMPTY;
  const whatsapp = contact.whatsappPhone ?? contact.phone;
  return (
    <span className="flex items-center gap-1.5">
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          title={contact.email}
          className="text-base-content/50 hover:text-primary"
          onClick={(event) => event.stopPropagation()}
        >
          <Mail className="size-3.5" />
        </a>
      ) : null}
      {contact.phone ? (
        <a
          href={`tel:${contact.phone}`}
          title={contact.phone}
          className="text-base-content/50 hover:text-primary"
          onClick={(event) => event.stopPropagation()}
        >
          <Phone className="size-3.5" />
        </a>
      ) : null}
      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp ${whatsapp}`}
          className="text-base-content/50 hover:text-success"
          onClick={(event) => event.stopPropagation()}
        >
          <MessageCircle className="size-3.5" />
        </a>
      ) : null}
      {!contact.email && !contact.phone ? EMPTY : null}
    </span>
  );
}

function truncated(text: string | null) {
  if (!text) return EMPTY;
  return (
    <span className="block truncate" title={text}>
      {text}
    </span>
  );
}

export function LeadCell({
  row,
  column,
  members,
}: {
  row: LeadRow;
  column: ColumnKey;
  members: MemberLookup;
}) {
  switch (column) {
    case "company":
      return row.company ? (
        <span className="block truncate font-medium" title={row.company.name}>
          {row.company.name}
        </span>
      ) : (
        EMPTY
      );
    case "contact":
      return truncated(contactName(row) || null);
    case "comms":
      return <CommsCell row={row} />;
    case "product":
      return truncated(row.lead.title);
    case "category":
      return truncated(row.lead.category);
    case "website": {
      const website = row.company?.website;
      if (!website) return EMPTY;
      const href = website.startsWith("http") ? website : `https://${website}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-primary hover:underline"
          title={website}
          onClick={(event) => event.stopPropagation()}
        >
          {website.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    }
    case "stage":
      return row.stage ? (
        <span className="badge badge-ghost badge-sm max-w-full truncate">
          {row.stage.name}
        </span>
      ) : (
        EMPTY
      );
    case "health": {
      const health = HEALTH_META[leadHealth(row)];
      return (
        <span
          className={health.className}
          title="Computed from how long this lead has been quiet"
        >
          {health.label}
        </span>
      );
    }
    case "priority": {
      const priority = PRIORITY_META[row.lead.priority];
      return (
        <span className={`badge badge-sm ${priority.className}`}>
          {priority.label}
        </span>
      );
    }
    case "owner":
      return truncated(
        row.lead.assignedMemberId
          ? (members.get(row.lead.assignedMemberId) ?? null)
          : null,
      );
    case "due": {
      const due = dueInfo(row.lead.nextActionDue);
      if (!due) return EMPTY;
      return <span className={DUE_TONE_CLASS[due.tone]}>{due.label}</span>;
    }
    case "activity":
      return (
        <span className="text-base-content/60">
          {timeAgo(row.lead.lastActivityAt ?? row.lead.updatedAt)}
        </span>
      );
    case "next":
      return truncated(row.lead.nextAction);
    case "summary":
      return truncated(row.lead.notes);
    case "value":
      return (
        <span className="tabular-nums">
          {formatMinorUnits(row.lead.valueCents)}
        </span>
      );
    case "score":
      return <span className="tabular-nums">{row.lead.leadScore}</span>;
    case "source":
      return truncated(row.lead.source);
    case "country":
      return truncated(row.company?.country ?? null);
    case "industry":
      return truncated(row.company?.industry ?? null);
  }
}

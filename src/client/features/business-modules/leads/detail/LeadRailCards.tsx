import {
  CheckCircle2,
  Mail,
  MessageCircle,
  Phone,
  XCircle,
} from "lucide-react";
import { timeAgo } from "@/shared/leads-command";
import { whenLabel } from "@/shared/lead-journal";
import { outreachState } from "./journalEntries";
import type { LeadDetail } from "./useLeadDetail";

type Activity = LeadDetail["activities"][number] | null;

function OutreachRow({
  icon,
  label,
  activity,
  never,
}: {
  icon: React.ReactNode;
  label: string;
  activity: Activity;
  never: string;
}) {
  const sent = activity?.outcome === "sent";
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 text-base-content/50">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-base-content/55">
          {activity ? whenLabel(activity.occurredAt) : never}
        </div>
      </div>
      {activity ? (
        sent ? (
          <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3" /> Sent
          </span>
        ) : (
          <span
            className="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700"
            title={activity.notes ?? undefined}
          >
            <XCircle className="size-3" /> Failed
          </span>
        )
      ) : (
        <span className="rounded bg-base-200 px-1.5 py-0.5 text-[10px] font-bold text-base-content/50">
          Not sent
        </span>
      )}
    </div>
  );
}

/** Did the automations reach this person? Answered without opening anything. */
export function OutreachCard({ detail }: { detail: LeadDetail }) {
  const state = outreachState(detail);
  return (
    <div className="rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 p-3 text-sm font-semibold">
        Outreach
      </div>
      <div className="divide-y divide-base-200 px-3">
        <OutreachRow
          icon={<MessageCircle className="size-4" />}
          label="WhatsApp thank-you"
          activity={state.whatsapp}
          never="Not sent yet"
        />
        <OutreachRow
          icon={<Mail className="size-4" />}
          label="Recap email"
          activity={state.email}
          never="Not sent yet"
        />
        <div className="flex items-start gap-2.5 py-2">
          <Phone className="mt-0.5 size-4 text-base-content/50" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {detail.calls.length} call{detail.calls.length === 1 ? "" : "s"}{" "}
              with the voice agent
            </div>
            <div className="text-xs text-base-content/55">
              {state.call
                ? `Last ${timeAgo(state.call.createdAt)} ago`
                : "No calls yet"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function initials(first: string, last: string | null) {
  return `${first[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function ContactCard({ detail }: { detail: LeadDetail }) {
  const contact = detail.contact;
  if (!contact) return null;
  const whatsapp = contact.whatsappPhone ?? contact.phone;
  const action =
    "grid size-7 place-items-center rounded text-base-content/60 hover:bg-base-200";
  return (
    <div className="rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 p-3 text-sm font-semibold">
        Contact
      </div>
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {initials(contact.firstName, contact.lastName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
          </div>
          <div className="truncate text-xs text-base-content/55">
            {contact.email ?? contact.phone ?? "No details"}
          </div>
        </div>
        <div className="flex">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className={action}
              title={contact.email}
            >
              <Mail className="size-3.5" />
            </a>
          ) : null}
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${action} hover:text-[#25D366]`}
              title={`WhatsApp ${whatsapp}`}
            >
              <MessageCircle className="size-3.5" />
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className={action}
              title={contact.phone}
            >
              <Phone className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CompanyCard({ detail }: { detail: LeadDetail }) {
  const company = detail.company;
  const rows = [
    ["Website", company?.website],
    ["Industry", company?.industry],
    ["Country", company?.country],
    ["Source", detail.lead.source],
    ["Category", detail.lead.category],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  if (!company && rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 p-3 text-sm font-semibold">
        Company Information
      </div>
      <dl className="space-y-1.5 p-3 text-sm">
        {rows.length === 0 ? (
          <div className="text-base-content/50">No company details yet.</div>
        ) : (
          rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-base-content/55">{label}</dt>
              <dd className="truncate text-right">
                {label === "Website" ? (
                  <a
                    href={value.startsWith("http") ? value : `https://${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link link-primary"
                  >
                    {value}
                  </a>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))
        )}
      </dl>
    </div>
  );
}

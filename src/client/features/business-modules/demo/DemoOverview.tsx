import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { getDemoOverview } from "@/serverFunctions/team";
import {
  ContactsTable,
  LeadsTable,
  MeetingsList,
  MessagesList,
  OrdersTable,
  Panel,
  ProductsTable,
  QuotesTable,
} from "./DemoTables";

/**
 * A worked example of the client's own business, shown while their workspace
 * is still empty.
 *
 * Every figure here is invented, and the page says so at the top and never
 * lets it out of sight: a client who mistakes this for their own trading
 * would be reading numbers nobody measured. It is a tour, not a report.
 */
export function DemoOverview() {
  const demo = useQuery({
    queryKey: ["team", "demo-overview"],
    queryFn: () => getDemoOverview(),
  });

  if (demo.isLoading) {
    return <div className="p-6 text-sm text-base-content/60">Loading…</div>;
  }
  if (!demo.data) return null;
  const { overview, preview } = demo.data;
  const traffic = overview.traffic;
  const busiest = Math.max(...traffic.days.map((day) => day.sessions), 1);

  return (
    <div className="space-y-4">
      <div className="alert border border-warning/40 bg-warning/10 text-sm">
        <FlaskConical className="size-4 shrink-0" />
        <div>
          <p className="font-medium">
            Sample data — an example of a {overview.trade} business
          </p>
          <p className="text-xs text-base-content/70">
            {preview
              ? "You are previewing what a client on sample data sees. Your own workspace is unaffected."
              : `None of these figures are ${overview.workspace}'s. They are here to show what each part of the system does once your own accounts are connected.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {overview.headline.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-base-300 bg-base-100 p-3"
          >
            <div className="text-xs text-base-content/60">{tile.label}</div>
            <div className="mt-1 text-lg font-semibold">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Leads" note="who has asked about you">
          <LeadsTable rows={overview.leads} />
        </Panel>
        <Panel title="Quotations" note="what you have priced">
          <QuotesTable rows={overview.quotations} />
        </Panel>
        <Panel title="Contacts" note="people on file">
          <ContactsTable rows={overview.contacts} />
        </Panel>
        <Panel title="Meetings & call-backs" note="what is booked">
          <MeetingsList rows={overview.meetings} />
        </Panel>
        <Panel title="Messages" note="SMS and WhatsApp">
          <MessagesList rows={overview.messages} />
        </Panel>
        <Panel title="Inquiries" note="what customers ask most">
          <ul className="space-y-2 text-sm text-base-content/80">
            {overview.inquiries.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Website visits" note="last 14 days">
        <div className="flex h-28 items-end gap-1">
          {traffic.days.map((day) => (
            <div
              key={day.date}
              className="flex-1 rounded-t bg-primary/70"
              style={{ height: `${(day.sessions / busiest) * 100}%` }}
              title={`${day.date}: ${day.sessions} visits`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70">
          {traffic.channels.map((channel) => (
            <span key={channel.channel}>
              {channel.channel} {channel.share}%
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Products & inventory" note="what you sell">
          <ProductsTable rows={overview.products} />
        </Panel>
        <Panel title="Orders" note="recent">
          <OrdersTable rows={overview.orders} />
        </Panel>
      </div>
    </div>
  );
}

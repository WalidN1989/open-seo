import type { ReactNode } from "react";

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note ? (
          <span className="text-xs text-base-content/50">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

type Lead = {
  name: string;
  wants: string;
  stage: string;
  suburb: string;
  createdAt: string;
};

export function LeadsTable({ rows }: { rows: Lead[] }) {
  return (
    <table className="table table-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.name}-${row.createdAt}`}>
            <td>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-base-content/60">{row.wants}</div>
            </td>
            <td className="whitespace-nowrap text-xs">{row.suburb}</td>
            <td className="whitespace-nowrap">
              <span className="badge badge-ghost badge-sm">{row.stage}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Quote = {
  number: string;
  client: string;
  total: string;
  status: string;
  sentAt: string;
};

export function QuotesTable({ rows }: { rows: Quote[] }) {
  return (
    <table className="table table-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.number}>
            <td className="whitespace-nowrap font-mono text-xs">
              {row.number}
            </td>
            <td>{row.client}</td>
            <td className="whitespace-nowrap text-right">{row.total}</td>
            <td className="whitespace-nowrap">
              <span className="badge badge-ghost badge-sm">{row.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Contact = {
  name: string;
  phone: string;
  orders: number;
  lastContactedAt: string;
};

export function ContactsTable({ rows }: { rows: Contact[] }) {
  return (
    <table className="table table-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.phone}>
            <td>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-base-content/60">{row.phone}</div>
            </td>
            <td className="whitespace-nowrap text-right text-xs">
              {row.orders} orders
            </td>
            <td className="whitespace-nowrap text-xs text-base-content/60">
              {day(row.lastContactedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Meeting = { with: string; kind: string; at: string };

export function MeetingsList({ rows }: { rows: Meeting[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li
          key={`${row.with}-${row.at}`}
          className="flex justify-between gap-3"
        >
          <span>
            <span className="font-medium">{row.kind}</span> with {row.with}
          </span>
          <span className="whitespace-nowrap text-xs text-base-content/60">
            {day(row.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Message = { from: string; text: string; channel: string; at: string };

export function MessagesList({ rows }: { rows: Message[] }) {
  return (
    <ul className="space-y-3 text-sm">
      {rows.map((row) => (
        <li key={`${row.from}-${row.at}`}>
          <div className="flex justify-between gap-3">
            <span className="font-medium">{row.from}</span>
            <span className="whitespace-nowrap text-xs text-base-content/60">
              {row.channel} · {day(row.at)}
            </span>
          </div>
          <p className="text-xs text-base-content/70">{row.text}</p>
        </li>
      ))}
    </ul>
  );
}

type Product = {
  name: string;
  price: string;
  onHand: number;
  status: string;
  soldThisMonth: number;
};

export function ProductsTable({ rows }: { rows: Product[] }) {
  return (
    <table className="table table-sm">
      <thead>
        <tr>
          <th>Item</th>
          <th className="text-right">Price</th>
          <th className="text-right">In stock</th>
          <th className="text-right">Sold</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <div>{row.name}</div>
              <div className="text-xs text-base-content/60">{row.status}</div>
            </td>
            <td className="whitespace-nowrap text-right">{row.price}</td>
            <td className="text-right">{row.onHand}</td>
            <td className="text-right">{row.soldThisMonth}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Order = {
  number: string;
  customer: string;
  total: string;
  status: string;
  placedAt: string;
};

export function OrdersTable({ rows }: { rows: Order[] }) {
  return (
    <table className="table table-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.number}>
            <td className="whitespace-nowrap font-mono text-xs">
              {row.number}
            </td>
            <td>{row.customer}</td>
            <td className="whitespace-nowrap text-right">{row.total}</td>
            <td className="whitespace-nowrap">
              <span className="badge badge-ghost badge-sm">{row.status}</span>
            </td>
            <td className="whitespace-nowrap text-xs text-base-content/60">
              {day(row.placedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

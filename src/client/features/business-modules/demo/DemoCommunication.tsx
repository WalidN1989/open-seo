import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./DemoTables";

/**
 * What the phone and WhatsApp did — the part of the system a spreadsheet
 * cannot do, so it is the part a business owner is shown first.
 *
 * Colour is a label here, never a scale: each tile carries its own words and
 * its number stays in ordinary ink, so the tiles read correctly in either
 * theme and to anyone who cannot separate the hues.
 */

const TONES: Record<string, string> = {
  voice: "#2563eb",
  orders: "#16a34a",
  stock: "#d97706",
  whatsapp: "#7c3aed",
  afterHours: "#0891b2",
};

const SERIES = [
  { key: "calls", name: "Calls answered", color: TONES.voice },
  { key: "voiceOrders", name: "Orders by voice", color: TONES.orders },
  { key: "whatsapp", name: "WhatsApp chats", color: TONES.whatsapp },
  { key: "outOfStock", name: "Out of stock asked", color: TONES.stock },
];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function CommunicationTiles({
  tiles,
}: {
  tiles: { label: string; value: string; tone: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const color = TONES[tile.tone] ?? TONES.voice;
        return (
          <div
            key={tile.label}
            className="rounded-lg border border-base-300 p-3"
            style={{
              borderLeft: `3px solid ${color}`,
              background: `${color}14`,
            }}
          >
            <div className="flex items-center gap-1.5 text-xs text-base-content/70">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: color }}
              />
              {tile.label}
            </div>
            <div className="mt-1 text-xl font-semibold">{tile.value}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CommunicationChart({
  days,
}: {
  days: {
    date: string;
    calls: number;
    voiceOrders: number;
    outOfStock: number;
    whatsapp: number;
  }[];
}) {
  return (
    <Panel title="Voice & WhatsApp" note="last 14 days">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={days}
            margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          >
            <CartesianGrid strokeOpacity={0.15} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={18}
            />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(value) =>
                typeof value === "string" ? shortDate(value) : ""
              }
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function LocationsTable({
  rows,
}: {
  rows: { name: string; calls: number; orders: number; afterHours: number }[];
}) {
  return (
    <table className="table table-sm">
      <thead>
        <tr>
          <th>Branch</th>
          <th className="text-right">Calls</th>
          <th className="text-right">Orders</th>
          <th className="text-right">After hours</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-medium">{row.name}</td>
            <td className="text-right">{row.calls}</td>
            <td className="text-right">{row.orders}</td>
            <td className="text-right">{row.afterHours}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function VoiceCallsTable({
  rows,
}: {
  rows: {
    caller: string;
    number: string;
    location: string;
    intent: string;
    outcome: string;
    minutes: number;
    at: string;
  }[];
}) {
  return (
    <table className="table table-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.number}-${row.at}`}>
            <td>
              <div className="font-medium">{row.caller}</div>
              <div className="text-xs text-base-content/60">
                {row.number} · {row.location}
              </div>
            </td>
            <td className="text-xs">{row.intent}</td>
            <td className="whitespace-nowrap">
              <span
                className="badge badge-sm border-0 text-base-content"
                style={{
                  background: `${
                    row.outcome.startsWith("Order")
                      ? TONES.orders
                      : row.outcome.startsWith("Out of stock")
                        ? TONES.stock
                        : TONES.voice
                  }22`,
                }}
              >
                {row.outcome}
              </span>
            </td>
            <td className="whitespace-nowrap text-xs text-base-content/60">
              {row.minutes} min · {shortDate(row.at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RestockTable({
  rows,
}: {
  rows: { item: string; asked: number; lastAskedBy: string; state: string }[];
}) {
  return (
    <table className="table table-sm">
      <thead>
        <tr>
          <th>Asked for, not in stock</th>
          <th className="text-right">Times</th>
          <th>Where it went</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.item}>
            <td>
              <div>{row.item}</div>
              <div className="text-xs text-base-content/60">
                last asked by {row.lastAskedBy}
              </div>
            </td>
            <td className="text-right font-semibold">{row.asked}</td>
            <td className="whitespace-nowrap text-xs">{row.state}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

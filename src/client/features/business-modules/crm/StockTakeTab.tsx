import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, CloudOff, Play, Trash2 } from "lucide-react";
import {
  createInventoryAudit,
  listCountableProducts,
  publishInventoryAudit,
  recordInventoryAuditCount,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  countedLines,
  markSent,
  pending,
  removeLine,
  scan,
  setCount,
  startSession,
  summary,
  type StockTakeState,
} from "./stockTakeSession";

/**
 * Counting stock with a scanner.
 *
 * The count lives in the browser while it happens, so a dropped connection,
 * a closed laptop or a reload costs nothing, and the job can be left and
 * picked up later. Counts are pushed to the server whenever it is reachable;
 * what has not reached it yet is shown, never hidden.
 *
 * Nothing changes stock here. The session becomes an audit, and an audit is
 * published — reviewed first, by whoever may publish.
 */

const SAVED_SESSION = "stock-take:session";
const CATALOGUE_KEY = ["commerce", "countable-products"] as const;

/** What a resumed session must look like; anything else is started afresh. */
const savedSessionSchema = z.object({
  auditId: z.string().min(1),
  name: z.string(),
  lines: z.record(
    z.string(),
    z.object({
      productId: z.string(),
      name: z.string(),
      sku: z.string(),
      systemStock: z.number(),
      counted: z.number(),
      unsent: z.boolean(),
    }),
  ),
  order: z.array(z.string()),
  unknown: z.array(z.string()),
});

function readSaved(): StockTakeState | null {
  try {
    const raw = localStorage.getItem(SAVED_SESSION);
    if (!raw) return null;
    const parsed = savedSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function save(state: StockTakeState | null) {
  try {
    if (state) localStorage.setItem(SAVED_SESSION, JSON.stringify(state));
    else localStorage.removeItem(SAVED_SESSION);
  } catch {
    // A browser refusing storage still counts; it just cannot be resumed.
  }
}

export function StockTakeTab() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StockTakeState | null>(() =>
    typeof window === "undefined" ? null : readSaved(),
  );
  const [online, setOnline] = useState(true);
  const [name, setName] = useState("");
  const scanBox = useRef<HTMLInputElement>(null);

  // The catalogue is read once and kept, so scanning works with no signal.
  const catalogue = useQuery({
    queryKey: CATALOGUE_KEY,
    queryFn: () => listCountableProducts(),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
  const products = catalogue.data ?? [];

  useEffect(() => save(session), [session]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const start = useMutation({
    mutationFn: (sessionName: string) =>
      createInventoryAudit({
        data: {
          name: sessionName,
          note: "Counted with a scanner",
        },
      }),
    onSuccess: (audit) => {
      setSession(startSession(audit.id, audit.name));
      setName("");
      scanBox.current?.focus();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const publish = useMutation({
    mutationFn: (auditId: string) =>
      publishInventoryAudit({ data: { auditId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commerce"] });
      setSession(null);
      toast.success("Stock updated from the count");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  // Counts are pushed as they happen, and retried whenever the connection
  // comes back. The server takes the whole count, not a difference, so
  // sending the same line twice is harmless.
  useEffect(() => {
    if (!session || !online) return;
    const outstanding = pending(session);
    if (outstanding.length === 0) return;
    let cancelled = false;
    void (async () => {
      const saved: { productId: string; counted: number }[] = [];
      for (const line of outstanding) {
        try {
          await recordInventoryAuditCount({
            data: {
              auditId: session.auditId,
              productId: line.productId,
              countedQuantity: line.counted,
            },
          });
          saved.push(line);
        } catch {
          break;
        }
      }
      if (!cancelled && saved.length) {
        setSession((current) => (current ? markSent(current, saved) : current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, online]);

  if (!session) {
    return (
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const chosen =
            name.trim() ||
            `Stock take ${new Date().toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}`;
          start.mutate(chosen);
        }}
      >
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">Start a stock take</span>
          <input
            className="input input-bordered input-sm w-72"
            placeholder="e.g. September count"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm" disabled={start.isPending}>
          <Play className="size-4" /> Start
        </button>
        <p className="w-full text-sm text-base-content/60">
          Scanning works without a connection. Counts are kept on this device
          and sent when it is back.
        </p>
      </form>
    );
  }

  const lines = countedLines(session);
  const totals = summary(session);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-base-300 p-4">
        <Barcode className="size-5 text-base-content/60" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{session.name}</p>
          <p className="text-xs text-base-content/60">
            {totals.products} product{totals.products === 1 ? "" : "s"} ·{" "}
            {totals.scanned} scanned · {totals.discrepancies} differ from stock
            {totals.unsent > 0 ? ` · ${totals.unsent} not yet saved` : ""}
          </p>
        </div>
        {!online ? (
          <span className="flex items-center gap-1 text-xs text-warning">
            <CloudOff className="size-4" /> Offline — counting continues
          </span>
        ) : null}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (
              window.confirm("Leave this count? It stays as a draft audit.")
            ) {
              setSession(null);
            }
          }}
        >
          Close session
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={
            publish.isPending || lines.length === 0 || totals.unsent > 0
          }
          title={
            totals.unsent > 0
              ? "Waiting for the last counts to be saved"
              : undefined
          }
          onClick={() => {
            if (window.confirm("Update stock to the counted quantities?")) {
              publish.mutate(session.auditId);
            }
          }}
        >
          Publish &amp; update stock
        </button>
      </div>

      <input
        ref={scanBox}
        autoFocus
        className="input input-bordered w-full font-mono"
        placeholder="Scan barcode here…"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const code = event.currentTarget.value;
          event.currentTarget.value = "";
          if (!code.trim()) return;
          const result = scan(session, products, code);
          setSession(result.state);
          if (!result.matched) {
            toast.error(
              `No product has the barcode ${code.trim()}. Add it to the product, then scan again.`,
            );
          }
        }}
      />

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
          Scan the first item. Each scan of the same barcode adds one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">In stock</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Difference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productId}>
                  <td className="max-w-xs truncate">{line.name}</td>
                  <td className="font-mono text-xs">{line.sku}</td>
                  <td className="text-right">{line.systemStock}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      className="input input-bordered input-xs w-20 text-right"
                      value={line.counted}
                      min={0}
                      onChange={(event) =>
                        setSession(
                          setCount(
                            session,
                            line.productId,
                            Number(event.target.value),
                          ),
                        )
                      }
                    />
                  </td>
                  <td
                    className={`text-right font-medium ${
                      line.difference === 0
                        ? "text-base-content/50"
                        : line.difference > 0
                          ? "text-success"
                          : "text-error"
                    }`}
                  >
                    {line.difference > 0
                      ? `+${line.difference}`
                      : line.difference}
                  </td>
                  <td className="text-right">
                    <button
                      className="btn btn-ghost btn-xs"
                      aria-label={`Remove ${line.name}`}
                      onClick={() =>
                        setSession(removeLine(session, line.productId))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {session.unknown.length > 0 ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Not recognised: {session.unknown.join(", ")}. Add each barcode to its
          product under Products, then scan again.
        </p>
      ) : null}
    </div>
  );
}

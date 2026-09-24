import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, CloudOff, Play } from "lucide-react";
import {
  createInventoryAudit,
  getInventoryAudit,
  listCountableProducts,
  publishInventoryAudit,
  recordInventoryAuditCount,
  submitInventoryAudit,
} from "@/serverFunctions/commerce";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  countedLines,
  markSent,
  pending,
  scan,
  startSession,
  summary,
  type StockTakeState,
} from "./stockTakeSession";
import { StockTakeLines } from "./StockTakeLines";

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

function readSaved(storageKey: string): StockTakeState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = savedSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function save(state: StockTakeState | null, storageKey: string) {
  try {
    if (state) localStorage.setItem(storageKey, JSON.stringify(state));
    else localStorage.removeItem(storageKey);
  } catch {
    // A browser refusing storage still counts; it just cannot be resumed.
  }
}

async function validateLegacyCount(legacy: StockTakeState, branchId: string) {
  const result = await getInventoryAudit({
    data: { auditId: legacy.auditId },
  });
  if (result.audit.branchId !== branchId || result.audit.status !== "draft")
    throw new Error(
      "This saved count belongs to another branch or has already been submitted.",
    );
}

export function StockTakeTab({
  branchId,
  branchName,
  onActiveChange,
}: {
  branchId: string;
  branchName: string;
  onActiveChange?: (active: boolean) => void;
}) {
  const storageKey = `${SAVED_SESSION}:${branchId}`;
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StockTakeState | null>(() =>
    typeof window === "undefined" ? null : readSaved(storageKey),
  );
  const [legacy, setLegacy] = useState(() =>
    typeof window !== "undefined" && branchId.startsWith("default:")
      ? readSaved(SAVED_SESSION)
      : null,
  );
  const [online, setOnline] = useState(true);
  const [name, setName] = useState("");
  const scanBox = useRef<HTMLInputElement>(null);

  // The catalogue is read once and kept, so scanning works with no signal.
  const catalogue = useQuery({
    queryKey: [...CATALOGUE_KEY, branchId],
    queryFn: () => listCountableProducts({ data: { branchId } }),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
  });
  const products = catalogue.data ?? [];

  useEffect(() => save(session, storageKey), [session, storageKey]);
  useEffect(
    () => onActiveChange?.(Boolean(session)),
    [onActiveChange, session],
  );

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

  const resumeLegacy = useMutation({
    mutationFn: async () => {
      if (!legacy) return;
      await validateLegacyCount(legacy, branchId);
      setSession(legacy);
      save(legacy, storageKey);
      localStorage.removeItem(SAVED_SESSION);
      setLegacy(null);
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const start = useMutation({
    mutationFn: (sessionName: string) =>
      createInventoryAudit({
        data: {
          branchId,
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

  // Whoever may publish sees Publish; whoever may only count sees Submit.
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    staleTime: 5 * 60_000,
  });
  const mayPublish =
    access.data?.find((module) => module.key === "crm")?.permission === "admin";

  const submit = useMutation({
    mutationFn: (auditId: string) =>
      submitInventoryAudit({ data: { auditId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["commerce"] });
      setSession(null);
      toast.success("Sent to the owner to review");
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
        className="space-y-3 rounded-xl border border-base-300 p-4"
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
        <h2 className="flex items-center gap-2 font-semibold">
          <Barcode className="size-4 text-base-content/60" /> Stock take — scan
          and count
        </h2>
        <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">
          Location: <strong>{branchName}</strong>
        </div>
        {legacy ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={resumeLegacy.isPending}
            onClick={() => resumeLegacy.mutate()}
          >
            Resume previous count
          </button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input input-bordered flex-1 sm:min-w-80"
            placeholder="Name this count, e.g. September count"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="btn btn-primary" disabled={start.isPending}>
            <Play className="size-4" /> Start new
          </button>
        </div>
        <p className="text-sm text-base-content/60">
          Scanning works without a connection, and a count can be left and
          picked up later. Counts are kept on this device and sent when it is
          back online.
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
            Counting at {branchName}. This location is locked until the count is
            submitted or published.
          </p>
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
            publish.isPending ||
            submit.isPending ||
            lines.length === 0 ||
            totals.unsent > 0
          }
          title={
            totals.unsent > 0
              ? "Waiting for the last counts to be saved"
              : undefined
          }
          onClick={() => {
            if (!mayPublish) {
              submit.mutate(session.auditId);
              return;
            }
            if (window.confirm("Update stock to the counted quantities?")) {
              publish.mutate(session.auditId);
            }
          }}
        >
          {mayPublish ? "Publish & update stock" : "Submit for review"}
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

      <StockTakeLines session={session} setSession={setSession} lines={lines} />

      {session.unknown.length > 0 ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Not recognised: {session.unknown.join(", ")}. Add each barcode to its
          product under Products, then scan again.
        </p>
      ) : null}
    </div>
  );
}

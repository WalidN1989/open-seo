import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  importLegacyOrders,
  configureOrderCourier,
} from "@/serverFunctions/orders";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function LegacyOrderImport({ connectionId }: { connectionId: string }) {
  const [ordersCsv, setOrdersCsv] = useState("");
  const [linesCsv, setLinesCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [apiKey, setKey] = useState("");
  const client = useQueryClient();
  const readFile = async (
    file: File | undefined,
    setValue: (value: string) => void,
  ) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error("Use a CSV smaller than 5 MB.");
      return;
    }
    setValue(await file.text());
  };
  const importHistory = async () => {
    setBusy(true);
    try {
      let offset: number | null = 0;
      while (offset !== null) {
        const result: {
          imported: number;
          total: number;
          nextOffset: number | null;
        } = await importLegacyOrders({
          data: { connectionId, ordersCsv, linesCsv, offset },
        });
        setProgress(
          `${result.nextOffset ?? result.total} / ${result.total} orders imported`,
        );
        offset = result.nextOffset;
      }
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(
        "Zoho history mirrored. Existing operations remain in Zoho.",
      );
    } catch (error) {
      toast.error(getStandardErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const saveCourier = async () => {
    setBusy(true);
    try {
      await configureOrderCourier({ data: { connectionId, apiKey } });
      setKey("");
      toast.success("Citypak tracking key saved.");
    } catch (error) {
      toast.error(getStandardErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded-lg border border-base-300 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Import existing Zoho orders and tracking
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p>
          Download both “Export CSV” and “Export Line Items” from Zoho Orders,
          then choose them here. Imports preserve history and tracking without
          sending invoices, taking stock or creating waybills.
        </p>
        <label className="block">
          Orders CSV
          <input
            aria-label="Zoho Orders CSV"
            className="file-input file-input-bordered file-input-sm block"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              void readFile(event.target.files?.[0], setOrdersCsv);
            }}
          />
        </label>
        <label className="block">
          Line Items CSV
          <input
            aria-label="Zoho Line Items CSV"
            className="file-input file-input-bordered file-input-sm block"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              void readFile(event.target.files?.[0], setLinesCsv);
            }}
          />
        </label>
        <button
          className="btn btn-outline btn-sm"
          disabled={busy || !ordersCsv || !linesCsv}
          onClick={() => {
            void importHistory();
          }}
        >
          Import Zoho history
        </button>
        <p>{progress}</p>
        <p>
          To refresh existing Citypak tracking, enter its API key. This enables
          tracking reads only.
        </p>
        <input
          type="password"
          autoComplete="off"
          aria-label="Citypak API key"
          className="input input-bordered input-sm"
          value={apiKey}
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          className="btn btn-outline btn-sm"
          disabled={busy || !apiKey.trim()}
          onClick={() => {
            void saveCourier();
          }}
        >
          Save tracking connection
        </button>
      </div>
    </details>
  );
}

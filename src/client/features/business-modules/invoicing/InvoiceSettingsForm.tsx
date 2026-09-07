import { useState } from "react";
import { useSaveSettings, type IssuerSettings } from "./invoicingQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/** Logos are stored inline, so keep them small enough to sit in a row. */
const MAX_LOGO_BYTES = 250_000;

export function InvoiceSettingsForm({
  settings,
}: {
  settings: IssuerSettings;
}) {
  const [form, setForm] = useState(settings);
  const [logoError, setLogoError] = useState<string | null>(null);
  const save = useSaveSettings();
  const set = <K extends keyof IssuerSettings>(
    key: K,
    value: IssuerSettings[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const readLogo = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("That image is too large — use one under 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setLogoError(null);
      set("logoUrl", String(reader.result));
    });
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <section className="grid gap-3 md:grid-cols-2">
        <label className="form-control md:col-span-2">
          <span className="label-text">Legal name</span>
          <input
            className="input input-bordered"
            value={form.legalName}
            onChange={(event) => set("legalName", event.target.value)}
            placeholder="The registered name, not the trading name"
          />
        </label>
        <label className="form-control md:col-span-2">
          <span className="label-text">Address</span>
          <textarea
            className="textarea textarea-bordered"
            rows={3}
            value={form.addressLines}
            onChange={(event) => set("addressLines", event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Email</span>
          <input
            className="input input-bordered"
            value={form.email ?? ""}
            onChange={(event) => set("email", event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Phone</span>
          <input
            className="input input-bordered"
            value={form.phone ?? ""}
            onChange={(event) => set("phone", event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Registration label</span>
          <input
            className="input input-bordered"
            value={form.taxIdLabel ?? ""}
            onChange={(event) => set("taxIdLabel", event.target.value)}
            placeholder="ABN, VAT, Business Reg. No."
          />
        </label>
        <label className="form-control">
          <span className="label-text">Registration number</span>
          <input
            className="input input-bordered"
            value={form.taxIdValue ?? ""}
            onChange={(event) => set("taxIdValue", event.target.value)}
          />
        </label>
      </section>

      <section className="rounded-lg border border-base-300 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="checkbox mt-1"
            checked={form.taxRegistered}
            onChange={(event) => set("taxRegistered", event.target.checked)}
          />
          <span>
            <span className="font-medium">Registered to charge tax</span>
            <span className="mt-1 block text-sm text-base-content/65">
              Leave this off unless you are registered. Only a registered
              business may title a document &ldquo;Tax Invoice&rdquo; or add a
              tax line — with it off, invoices are titled
              &ldquo;Invoice&rdquo; and charge no tax.
            </span>
          </span>
        </label>
        {form.taxRegistered ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <span className="label-text">Tax label</span>
              <input
                className="input input-bordered"
                value={form.taxLabel ?? ""}
                onChange={(event) => set("taxLabel", event.target.value)}
                placeholder="GST"
              />
            </label>
            <label className="form-control">
              <span className="label-text">Rate %</span>
              <input
                className="input input-bordered"
                type="number"
                value={form.taxRatePercent}
                onChange={(event) =>
                  set("taxRatePercent", Number(event.target.value) || 0)
                }
              />
            </label>
          </div>
        ) : (
          <label className="form-control mt-3">
            <span className="label-text">Note shown on the invoice</span>
            <input
              className="input input-bordered"
              value={form.taxNote ?? ""}
              onChange={(event) => set("taxNote", event.target.value)}
              placeholder="No GST has been charged."
            />
          </label>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <label className="form-control">
          <span className="label-text">Default currency</span>
          <input
            className="input input-bordered"
            maxLength={3}
            value={form.defaultCurrency}
            onChange={(event) =>
              set("defaultCurrency", event.target.value.toUpperCase().slice(0, 3))
            }
          />
        </label>
        <label className="form-control">
          <span className="label-text">Payment terms (days)</span>
          <input
            type="number"
            className="input input-bordered"
            value={form.paymentTermsDays}
            onChange={(event) =>
              set("paymentTermsDays", Number(event.target.value) || 0)
            }
          />
        </label>
        <label className="form-control">
          <span className="label-text">Invoice prefix</span>
          <input
            className="input input-bordered"
            value={form.invoicePrefix}
            onChange={(event) => set("invoicePrefix", event.target.value)}
          />
        </label>
      </section>

      <label className="form-control">
        <span className="label-text">Bank details</span>
        <textarea
          className="textarea textarea-bordered"
          rows={5}
          value={form.bankDetails ?? ""}
          onChange={(event) => set("bankDetails", event.target.value)}
          placeholder={
            "Account name:\nBank:\nBranch:\nAccount number:\nSWIFT:"
          }
        />
      </label>

      <label className="form-control">
        <span className="label-text">Payment instructions</span>
        <textarea
          className="textarea textarea-bordered"
          rows={2}
          value={form.paymentInstructions ?? ""}
          onChange={(event) => set("paymentInstructions", event.target.value)}
          placeholder="Please quote the invoice number with your transfer."
        />
      </label>

      <section className="space-y-2">
        <span className="label-text">Logo</span>
        <div className="flex items-center gap-4">
          {form.logoUrl ? (
            <img
              src={form.logoUrl}
              alt=""
              className="max-h-12 rounded bg-white p-1"
            />
          ) : (
            <span className="text-sm text-base-content/60">
              No logo — your legal name is used instead.
            </span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="file-input file-input-bordered file-input-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readLogo(file);
            }}
          />
          {form.logoUrl ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => set("logoUrl", null)}
            >
              Remove
            </button>
          ) : null}
        </div>
        {logoError ? <p className="text-sm text-error">{logoError}</p> : null}
      </section>

      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate(form)}
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {save.isSuccess ? (
          <span className="text-sm text-success">Saved.</span>
        ) : null}
        {save.isError ? (
          <span className="text-sm text-error">
            {getStandardErrorMessage(save.error)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

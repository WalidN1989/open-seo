import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setBusinessCurrency } from "@/serverFunctions/commerce";
import { CURRENCIES, currencyName, isCurrencyCode } from "@/shared/currencies";
import {
  CURRENCY_KEY,
  useWorkspaceCurrency,
} from "@/client/hooks/useWorkspaceCurrency";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const OTHER = "__other__";

/**
 * The workspace currency. Every price, order total and pipeline figure is
 * shown in it, so it lives here rather than being set per product.
 */
export function CurrencySettings() {
  const queryClient = useQueryClient();
  const { currency } = useWorkspaceCurrency();
  const known = CURRENCIES.some((item) => item.code === currency);

  const [selected, setSelected] = useState(known ? currency : OTHER);
  const [custom, setCustom] = useState(known ? "" : currency);

  // The saved value arrives after the first render, so adopt it once it does
  // rather than leaving the picker showing the default.
  useEffect(() => {
    setSelected(known ? currency : OTHER);
    setCustom(known ? "" : currency);
  }, [currency, known]);

  const chosen = selected === OTHER ? custom.trim().toUpperCase() : selected;
  const valid = isCurrencyCode(chosen);
  const changed = chosen !== currency;

  const save = useMutation({
    mutationFn: () => setBusinessCurrency({ data: { currency: chosen } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: CURRENCY_KEY });
      toast.success(`Amounts now shown in ${currencyName(result.currency)}`);
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">Currency</h2>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <p className="text-sm">Workspace currency</p>
          <p className="mt-1 text-sm text-base-content/60">
            Used for products, orders, inventory value and the sales pipeline.
            Changing it relabels existing amounts — it does not convert them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="select select-bordered select-sm"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.name}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>

          {selected === OTHER ? (
            <input
              className="input input-bordered input-sm w-28 font-mono uppercase"
              value={custom}
              maxLength={3}
              placeholder="XOF"
              onChange={(event) => setCustom(event.target.value)}
              aria-label="Currency code"
            />
          ) : null}

          <button
            className="btn btn-primary btn-sm"
            disabled={!valid || !changed || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Save
          </button>
        </div>
      </div>
      {selected === OTHER && custom.length > 0 && !valid ? (
        <p className="text-sm text-error">
          Use a three-letter currency code, such as LKR.
        </p>
      ) : null}
    </section>
  );
}

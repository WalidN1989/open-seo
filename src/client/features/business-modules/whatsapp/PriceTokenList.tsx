import { useState } from "react";
import type { AssistantConfig } from "./assistantQuery";

const VISIBLE_TOKENS = 40;

/** A catalogue can run to thousands of items; show a page and let them search. */
export function PriceTokenList({
  tokens,
}: {
  tokens: AssistantConfig["priceTokens"];
}) {
  const [filter, setFilter] = useState("");
  const term = filter.trim().toLowerCase();
  const matching = term
    ? tokens.filter((token) => token.name.toLowerCase().includes(term))
    : tokens;
  const shown = matching.slice(0, VISIBLE_TOKENS);
  return (
    <div className="grid gap-3">
      {tokens.length > VISIBLE_TOKENS ? (
        <input
          className="input input-bordered input-sm w-full max-w-sm"
          placeholder={`Search ${tokens.length} priced products…`}
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {shown.map((token) => (
          <span
            key={token.name}
            className="badge badge-outline gap-1 py-3 text-xs"
            title={`{{price:${token.name}}}`}
          >
            {token.name} · {token.price}
          </span>
        ))}
      </div>
      {matching.length > shown.length ? (
        <p className="text-xs text-base-content/50">
          Showing {shown.length} of {matching.length}. Type to narrow it down;
          every product still works as a token.
        </p>
      ) : null}
    </div>
  );
}

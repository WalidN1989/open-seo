import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";

/**
 * Record that research was bought.
 *
 * Called from inside the meter, so a new module cannot buy research without
 * this happening — the guarantee is structural rather than a habit. Twice now
 * the app has spent money on research it showed once and never stored, and
 * both times the fix was to patch one more call site. This is the fix that
 * does not need a next time.
 *
 * Never allowed to fail the call it is recording. The customer paid for search
 * results, not for bookkeeping, and a ledger write that throws would turn a
 * successful purchase into an error with the money already gone.
 *
 * The database is imported inside the function, not at the top. This module is
 * reached from the vendor client, which is a plain HTTP wrapper that several
 * tests build without a worker runtime — a top-level import would drag the
 * database into all of them.
 */

/** Keep the argument record small: an input can carry a hundred keywords. */
const MAX_INPUT_CHARS = 4000;

function describeInput(input: unknown): string | null {
  try {
    const json = JSON.stringify(input);
    if (!json) return null;
    return json.length > MAX_INPUT_CHARS
      ? `${json.slice(0, MAX_INPUT_CHARS)}…`
      : json;
  } catch {
    return null;
  }
}

export async function recordResearchPurchase(input: {
  customer: BillingCustomerContext;
  endpoint: string;
  creditFeature?: CreditFeature;
  args: unknown;
  outcome: "ok" | "failed";
}) {
  try {
    const [{ db }, { researchPurchases }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ]);
    await db.insert(researchPurchases).values({
      id: crypto.randomUUID(),
      organizationId: input.customer.organizationId,
      projectId: input.customer.projectId ?? null,
      userId: input.customer.userId,
      endpoint: input.endpoint,
      creditFeature: input.creditFeature ?? null,
      inputJson: describeInput(input.args),
      outcome: input.outcome,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("dataforseo.purchase-ledger failed:", error);
  }
}

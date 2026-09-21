import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { commerceBranches, commerceInventoryBalances } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import type { BranchInput } from "@/types/schemas/commerce";

/** Stable per-tenant home for pre-branch stock and legacy integrations. */
function defaultId(organizationId: string) {
  return `default:${organizationId}`;
}

async function resolve(organizationId: string, branchId?: string) {
  const selectedId = branchId ?? defaultId(organizationId);
  const query = db
    .select()
    .from(commerceBranches)
    .where(
      and(
        eq(commerceBranches.id, selectedId),
        eq(commerceBranches.organizationId, organizationId),
      ),
    )
    .limit(1);
  let [branch] = await query;
  if (!branch && selectedId === defaultId(organizationId)) {
    await db
      .insert(commerceBranches)
      .values({ id: selectedId, organizationId, name: "Default branch" })
      .onConflictDoNothing();
    [branch] = await query;
  }
  if (!branch) throw new AppError("NOT_FOUND", "Branch not found.");
  return branch;
}

async function list(organizationId: string) {
  await resolve(organizationId);
  return db
    .select()
    .from(commerceBranches)
    .where(eq(commerceBranches.organizationId, organizationId))
    .orderBy(commerceBranches.name);
}

async function save(organizationId: string, input: BranchInput) {
  const { id, ...fields } = input;
  if (id) {
    await resolve(organizationId, id);
    const [branch] = await db
      .update(commerceBranches)
      .set(fields)
      .where(
        and(
          eq(commerceBranches.id, id),
          eq(commerceBranches.organizationId, organizationId),
        ),
      )
      .returning();
    return branch;
  }
  const [branch] = await db
    .insert(commerceBranches)
    .values({ id: crypto.randomUUID(), organizationId, ...fields })
    .returning();
  return branch;
}

async function productStock(organizationId: string, productId: string) {
  await resolve(organizationId);
  return db
    .select({
      branch: commerceBranches,
      quantityOnHand: commerceInventoryBalances.quantityOnHand,
      updatedAt: commerceInventoryBalances.updatedAt,
    })
    .from(commerceBranches)
    .leftJoin(
      commerceInventoryBalances,
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.branchId, commerceBranches.id),
        eq(commerceInventoryBalances.productId, productId),
      ),
    )
    .where(eq(commerceBranches.organizationId, organizationId))
    .orderBy(commerceBranches.name);
}

export const BranchRepository = {
  defaultId,
  resolve,
  list,
  save,
  productStock,
};

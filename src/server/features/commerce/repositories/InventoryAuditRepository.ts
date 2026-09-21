import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceInventoryAuditItems,
  commerceInventoryAudits,
  commerceProducts,
} from "@/db/schema";
import { BranchRepository } from "./BranchRepository";

async function createAudit(
  organizationId: string,
  input: {
    name: string;
    note?: string | null;
    createdByUserId: string;
    branchId?: string;
  },
) {
  const branch = await BranchRepository.resolve(organizationId, input.branchId);
  const [row] = await db
    .insert(commerceInventoryAudits)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      branchId: branch.id,
      name: input.name,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  return row;
}

async function listAudits(
  organizationId: string,
  limit: number,
  branchId = BranchRepository.defaultId(organizationId),
) {
  return db
    .select()
    .from(commerceInventoryAudits)
    .where(
      and(
        eq(commerceInventoryAudits.organizationId, organizationId),
        eq(commerceInventoryAudits.branchId, branchId),
      ),
    )
    .orderBy(desc(commerceInventoryAudits.createdAt))
    .limit(limit);
}

async function getAudit(organizationId: string, auditId: string) {
  const [row] = await db
    .select()
    .from(commerceInventoryAudits)
    .where(
      and(
        eq(commerceInventoryAudits.id, auditId),
        eq(commerceInventoryAudits.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listAuditItems(organizationId: string, auditId: string) {
  return db
    .select({
      item: commerceInventoryAuditItems,
      product: commerceProducts,
    })
    .from(commerceInventoryAuditItems)
    .innerJoin(
      commerceProducts,
      eq(commerceProducts.id, commerceInventoryAuditItems.productId),
    )
    .where(
      and(
        eq(commerceInventoryAuditItems.organizationId, organizationId),
        eq(commerceInventoryAuditItems.auditId, auditId),
      ),
    );
}

async function upsertAuditItem(
  organizationId: string,
  input: {
    auditId: string;
    productId: string;
    expectedQuantity: number;
    countedQuantity: number;
  },
) {
  const [row] = await db
    .insert(commerceInventoryAuditItems)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .onConflictDoUpdate({
      target: [
        commerceInventoryAuditItems.auditId,
        commerceInventoryAuditItems.productId,
      ],
      set: {
        expectedQuantity: input.expectedQuantity,
        countedQuantity: input.countedQuantity,
      },
    })
    .returning();
  return row;
}

async function setAuditStatus(
  organizationId: string,
  auditId: string,
  status: "draft" | "submitted" | "published" | "reverted",
) {
  const now = new Date().toISOString();
  const [row] = await db
    .update(commerceInventoryAudits)
    .set({
      status,
      updatedAt: now,
      publishedAt: status === "published" ? now : undefined,
      revertedAt: status === "reverted" ? now : undefined,
    })
    .where(
      and(
        eq(commerceInventoryAudits.id, auditId),
        eq(commerceInventoryAudits.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export const InventoryAuditRepository = {
  createAudit,
  listAudits,
  getAudit,
  listAuditItems,
  upsertAuditItem,
  setAuditStatus,
};

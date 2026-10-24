import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrders } from "@/db/schema";

async function customerOrder(
  organizationId: string,
  orderNumber: string | string[],
  phone: string,
) {
  const orders = await db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        inArray(
          commerceOrders.orderNumber,
          typeof orderNumber === "string" ? [orderNumber] : orderNumber,
        ),
        eq(commerceOrders.customerPhone, phone),
      ),
    )
    .limit(2);
  return orders.length === 1 ? orders[0] : null;
}

/** The channel supplies the sender; customers cannot choose another phone. */
async function customerOrders(organizationId: string, phone: string) {
  return db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.customerPhone, phone),
      ),
    )
    .orderBy(desc(commerceOrders.createdAt), desc(commerceOrders.id))
    .limit(6);
}

export const CustomerOrderRepository = { customerOrder, customerOrders };

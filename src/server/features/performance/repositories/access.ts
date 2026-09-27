import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientLogins } from "@/db/schema";

export async function hasClientLogin(userId: string) {
  return (
    (
      await db
        .select({ id: clientLogins.id })
        .from(clientLogins)
        .where(eq(clientLogins.userId, userId))
        .limit(1)
    ).length > 0
  );
}

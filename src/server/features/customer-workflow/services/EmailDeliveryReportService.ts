import { z } from "zod";
import { graphRequest } from "@/server/features/email/providers/microsoft";
import { EmailRepository } from "@/server/features/email/repositories/EmailRepository";
const pageSchema = z.object({
  value: z.array(
    z.object({
      id: z.string(),
      subject: z.string().nullish(),
      bodyPreview: z.string().nullish(),
      receivedDateTime: z.string().optional(),
      from: z
        .object({ emailAddress: z.object({ address: z.string() }) })
        .nullish(),
    }),
  ),
  "@odata.nextLink": z.string().optional(),
});
/** Read-only inspection, never sends mail or invokes a model. Reports remain evidence, not proof of delivery. */
async function scan(organizationId: string, since: string) {
  const account = await EmailRepository.getAccount(organizationId);
  if (!account || account.status !== "connected")
    return { status: "unavailable", reports: [], truncated: false };
  if (account.provider !== "microsoft")
    return { status: "provider_webhooks", reports: [], truncated: false };
  try {
    const folders = await Promise.all(
      ["inbox", "junkemail", "deleteditems"].map(async (folder) => {
        const url = new URL(
          `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages`,
        );
        url.searchParams.set(
          "$select",
          "id,subject,bodyPreview,receivedDateTime,from",
        );
        url.searchParams.set("$filter", `receivedDateTime ge ${since}`);
        url.searchParams.set("$orderby", "receivedDateTime desc");
        url.searchParams.set("$top", "100");
        const response = await graphRequest(account, url.toString());
        const page = pageSchema.parse(await response.json());
        return {
          folder,
          truncated: Boolean(page["@odata.nextLink"]),
          reports: page.value
            .filter((m) =>
              /undeliverable|delivery (?:status notification|has failed|failure)|returned mail|failure notice|non.?delivery report/i.test(
                m.subject ?? "",
              ),
            )
            .map((m) => ({
              id: m.id,
              folder,
              subject: m.subject ?? "Delivery report",
              sender: m.from?.emailAddress.address ?? null,
              receivedAt: m.receivedDateTime ?? null,
              reason: m.bodyPreview ?? null,
              status: "reported_failure",
              linkedMessageId: null,
            })),
        };
      }),
    );
    return {
      status: "checked",
      reports: folders.flatMap((f) => f.reports),
      truncated: folders.some((f) => f.truncated),
    };
  } catch {
    return {
      status: "unavailable",
      reports: [],
      truncated: false,
      error:
        "Microsoft delivery-report folders could not be checked. Attention required.",
    };
  }
}
export const EmailDeliveryReportService = { scan };

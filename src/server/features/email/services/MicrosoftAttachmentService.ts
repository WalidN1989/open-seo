import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { graphRequest } from "../providers/microsoft";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
  type EmailMessageRow,
} from "../repositories/EmailRepository";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string().nullable().optional(),
  size: z.number().nonnegative(),
  isInline: z.boolean().optional(),
  "@odata.type": z.string().optional(),
});
const pageSchema = z.object({
  value: z.array(attachmentSchema),
  "@odata.nextLink": z.string().optional(),
});

async function microsoftMessage(
  organizationId: string,
  userId: string,
  messageId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "email");
  const [account, message] = await Promise.all([
    Repo.getAccount(organizationId),
    Repo.getMessage(organizationId, messageId),
  ]);
  if (
    !account ||
    account.provider !== "microsoft" ||
    account.status !== "connected" ||
    !message ||
    message.accountId !== account.id ||
    !message.externalMessageId ||
    message.externalMessageId.startsWith("microsoft-sent:")
  ) {
    throw new AppError("NOT_FOUND", "Microsoft email message not found.");
  }
  return { account, message };
}

async function attachmentList(
  account: EmailAccountRow,
  message: EmailMessageRow,
) {
  const base = `/me/messages/${encodeURIComponent(message.externalMessageId!)}/attachments`;
  const url = new URL(`https://graph.microsoft.com/v1.0${base}`);
  url.searchParams.set("$select", "id,name,contentType,size,isInline");
  let next: string | undefined = url.toString();
  const files: z.infer<typeof attachmentSchema>[] = [];
  for (let page = 0; next && page < 10; page += 1) {
    const response = await graphRequest(account, next);
    const batch = pageSchema.parse(await response.json());
    files.push(...batch.value);
    next = batch["@odata.nextLink"];
  }
  if (next)
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Too many attachments to list.",
    );
  return files;
}

export async function listMicrosoftAttachments(
  organizationId: string,
  userId: string,
  messageId: string,
) {
  const { account, message } = await microsoftMessage(
    organizationId,
    userId,
    messageId,
  );
  return (await attachmentList(account, message))
    .filter(
      (file) => file["@odata.type"] !== "#microsoft.graph.referenceAttachment",
    )
    .map(({ id, name, contentType, size, isInline }) => ({
      id,
      name,
      contentType: contentType || "application/octet-stream",
      size,
      isInline: Boolean(isInline),
    }));
}

export async function openMicrosoftAttachment(
  organizationId: string,
  userId: string,
  messageId: string,
  attachmentId: string,
) {
  const { account, message } = await microsoftMessage(
    organizationId,
    userId,
    messageId,
  );
  const file = (await attachmentList(account, message)).find(
    (item) =>
      item.id === attachmentId &&
      item["@odata.type"] !== "#microsoft.graph.referenceAttachment",
  );
  if (!file) throw new AppError("NOT_FOUND", "Email attachment not found.");
  const response = await graphRequest(
    account,
    `/me/messages/${encodeURIComponent(message.externalMessageId!)}/attachments/${encodeURIComponent(file.id)}/$value`,
  );
  return { response, file };
}

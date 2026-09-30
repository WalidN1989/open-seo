import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { EmailRepository } from "../repositories/EmailRepository";
import {
  categoryFor,
  FORM_SUBJECT,
  identifyCustomer,
  leadTitle,
  notesFor,
} from "./EmailCrmIngestParser";

async function ingestAccount(
  account: Awaited<ReturnType<typeof EmailRepository.getAccount>>,
) {
  if (!account)
    return { linked: 0, createdContacts: 0, createdLeads: 0, skipped: 0 };
  const stages = await CrmService.ensureStages(account.organizationId);
  const threads = (
    await EmailRepository.listThreads(account.organizationId, 500)
  ).toReversed();
  let linked = 0;
  let createdContacts = 0;
  let createdLeads = 0;
  let skipped = 0;
  for (const thread of threads) {
    const messages = await EmailRepository.listMessages(
      account.organizationId,
      thread.id,
    );
    const identity = identifyCustomer(
      thread.subject ?? "Email inquiry",
      messages,
      account.address,
    );
    if (!identity) {
      skipped += 1;
      continue;
    }
    let contact = await CrmRepository.findContactByEmail(
      account.organizationId,
      identity.email,
    );
    if (!contact) {
      contact = await CrmRepository.createContact(account.organizationId, {
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phone,
      });
      createdContacts += 1;
    } else if (
      FORM_SUBJECT.test(thread.subject ?? "") ||
      (identity.phone && !contact.phone)
    ) {
      contact =
        (await CrmRepository.updateContactDetails(
          account.organizationId,
          contact.id,
          {
            ...(FORM_SUBJECT.test(thread.subject ?? "")
              ? {
                  firstName: identity.firstName,
                  lastName: identity.lastName ?? null,
                }
              : {}),
            ...(identity.phone ? { phone: identity.phone } : {}),
          },
        )) ?? contact;
    }
    if (thread.contactId !== contact.id) {
      await EmailRepository.setThreadContact(
        account.organizationId,
        thread.id,
        contact.id,
      );
      linked += 1;
    }
    if (
      await CrmRepository.findLeadByContact(account.organizationId, contact.id)
    )
      continue;
    const text = [
      thread.subject,
      ...messages.map((message) => message.textBody),
    ].join("\n");
    const latest = messages.at(-1);
    await CrmRepository.createLead(account.organizationId, {
      title: leadTitle(identity, thread.subject ?? "Email inquiry"),
      contactId: contact.id,
      stageId: stages[0]?.id,
      source: FORM_SUBJECT.test(thread.subject ?? "")
        ? "Website email inquiry"
        : "Email inquiry",
      category: categoryFor(text),
      priority: "medium",
      valueCents: 0,
      nextAction:
        latest?.direction === "inbound"
          ? "Pending — not yet responded"
          : "Waiting for customer response",
      notes: notesFor(identity, messages),
    });
    createdLeads += 1;
  }
  return { linked, createdContacts, createdLeads, skipped };
}

async function run() {
  const results = [];
  for (const account of await EmailRepository.listConnectedByProvider(
    "microsoft",
  )) {
    results.push({ accountId: account.id, ...(await ingestAccount(account)) });
  }
  return results;
}

export const EmailCrmIngestService = { run, ingestAccount };

import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { InvoiceRepository } from "@/server/features/invoicing/repositories/InvoiceRepository";

/**
 * Which workspace's identity goes on the letterhead.
 *
 * The report picker deliberately reaches across every workspace the person
 * belongs to, because each client project owns its own workspace. The
 * letterhead has to reach the same way, or you get the thing that actually
 * happened: standing in the client's workspace, generating a report, and
 * handing the client a document with their own name where the agency's should
 * be — with nothing on screen saying so.
 *
 * The rule, in order:
 *  1. The workspace you are in, if it has company details. Explicit beats
 *     clever, and an agency that fills its own details in gets what it typed.
 *  2. Otherwise the one other workspace of yours that has them. One is not a
 *     guess; it is the only answer available.
 *  3. Otherwise nothing, and the caller falls back to the workspace name.
 *
 * Two or more candidates is left alone on purpose. Picking one would be a coin
 * toss printed on a client's document, and the screen asks instead.
 */
export type Letterhead = {
  settings: Awaited<ReturnType<typeof InvoiceRepository.getSettings>>;
  /** The workspace the details came from, when it is not the current one. */
  borrowedFrom: string | null;
  /** More than one candidate, so nothing was chosen. */
  ambiguous: boolean;
};

export async function resolveLetterhead(
  organizationId: string,
  userId: string,
): Promise<Letterhead> {
  const own = await InvoiceRepository.getSettings(organizationId);
  if (own?.legalName?.trim()) {
    return { settings: own, borrowedFrom: null, ambiguous: false };
  }

  const memberships = await AuthRepository.listOrganizationsForUser(userId);
  const others = memberships.filter((org) => org.id !== organizationId);
  const candidates: Array<{ id: string; name: string; settings: typeof own }> =
    [];
  for (const org of others) {
    const settings = await InvoiceRepository.getSettings(org.id);
    if (settings?.legalName?.trim()) {
      candidates.push({ id: org.id, name: org.name, settings });
    }
  }

  const [only] = candidates;
  if (candidates.length === 1 && only) {
    return {
      settings: only.settings,
      borrowedFrom: only.name,
      ambiguous: false,
    };
  }
  return {
    settings: own,
    borrowedFrom: null,
    ambiguous: candidates.length > 1,
  };
}

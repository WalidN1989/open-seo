import { slugify, toHex } from "./org-slug";

/**
 * Each project owns an organization of its own.
 *
 * Every business table — products, integrations, CRM, WhatsApp, voice — is
 * scoped by organization and nothing else. Sharing one organization across an
 * agency's clients therefore puts all of their data in one pile, which is what
 * made one client's Shopify visible from another client's workspace. Giving
 * each project its own organization makes the isolation that already exists
 * apply between clients, without a schema change or a new filter on any query.
 *
 * The project switcher then switches the active organization with it, so
 * "which client am I looking at" and "whose data can this request see" are the
 * same question with the same answer.
 */

type OrganizationCreateInput = {
  name: string;
  slug: string;
  userId: string;
};

type OrganizationCreator = (
  input: OrganizationCreateInput,
) => Promise<{ id: string }>;

/**
 * Slugs are unique across the whole deployment, and two agencies can both have
 * a client called "Acme". The random suffix keeps the readable part readable
 * while making a collision between unrelated tenants impossible.
 */
function organizationSlugForProject(projectName: string) {
  const base = slugify(projectName.trim()) || "project";
  return `${base}-${toHex(crypto.randomUUID()).slice(0, 12)}`;
}

export async function createOrganizationForProject(input: {
  userId: string;
  projectName: string;
  createOrganization: OrganizationCreator;
}): Promise<string> {
  const organization = await input.createOrganization({
    name: input.projectName.trim() || "Project",
    slug: organizationSlugForProject(input.projectName),
    userId: input.userId,
  });
  return organization.id;
}

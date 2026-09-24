export async function tellTheOwner(
  organizationId: string,
  submittedByUserId: string,
  count: { name: string; counted: number; discrepancies: number },
) {
  // Imported here rather than at the top: the mail and env modules drag the
  // worker runtime in with them, and counting stock must not depend on it.
  const [
    { BusinessModuleRepository },
    { sendClientActionEmail },
    { getOptionalEnvValue },
  ] = await Promise.all([
    import("@/server/features/business-modules/repositories/BusinessModuleRepository"),
    import("@/server/email/transactional"),
    import("@/server/lib/runtime-env"),
  ]);
  const members = await BusinessModuleRepository.listMembers(organizationId);
  const owner = members.find((row) => row.role === "owner") ?? null;
  // Nobody to tell, or the owner counted it themselves: no email.
  if (!owner?.email || owner.userId === submittedByUserId) return;
  const counter = members.find((row) => row.userId === submittedByUserId);
  const baseUrl = await getOptionalEnvValue("BETTER_AUTH_URL");
  await sendClientActionEmail({
    email: owner.email,
    subject: `Stock count ready to review: ${count.name}`,
    heading: "A stock count is waiting for you",
    body: [
      `${counter?.name ?? "Someone"} finished counting "${count.name}".`,
      count.discrepancies > 0
        ? `${count.discrepancies} of ${count.counted} products came out different from what stock says. Nothing has changed yet — stock only moves when you publish it.`
        : `All ${count.counted} products matched what stock says. Nothing has changed yet — stock only moves when you publish it.`,
    ],
    buttonLabel: "Review the count",
    actionUrl: `${baseUrl ?? "https://seo.digitalurgency.com.au"}/modules/crm/inventory`,
    footer: "Digital Urgency · Inventory",
  });
}

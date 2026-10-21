/** Numeric variables shared by both shipment utility templates. */
export function supportsShipmentVariables(
  template: { body: string; externalTemplateId: string | null } | null,
) {
  if (!template?.externalTemplateId) return false;
  const variables: string[] = template.body.match(/{{[^}]+}}/g) || [];
  const expected = ["{{1}}", "{{2}}", "{{3}}"];
  return (
    expected.every((v) => variables.includes(v)) &&
    variables.every((v) => expected.includes(v))
  );
}

/** Pieces the printable invoice and quote share. */

export function Lines({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      {value
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => (
          <div key={index}>{line}</div>
        ))}
    </>
  );
}

export function longDate(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function quantityLabel(quantityMilli: number) {
  const value = quantityMilli / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

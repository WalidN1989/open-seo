/** SQLite's timestamp default is UTC, even though it omits the zone. */
export function parseWhatsappTimestamp(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(
    value.replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
      "$1T$2Z",
    ),
  );
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function formatWhatsappTimestamp(value?: string | null) {
  const timestamp = parseWhatsappTimestamp(value);
  if (timestamp === null) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

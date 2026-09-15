/** Monday to Friday, 9am to 5pm where the business is. */
export function inWorkingHours(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return false;
  }
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return !["Sat", "Sun"].includes(weekday) && hour >= 9 && hour < 17;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const RANGE =
  /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\s*[–—-]\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})\.?$/i;

function monthIndex(name: string) {
  return MONTHS.findIndex(
    (month) => month.toLowerCase() === name.toLowerCase(),
  );
}
function calendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day
    ? date
    : null;
}
function shift(date: Date, months: number) {
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0),
  );
  const originalLast = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day =
    date.getUTCDate() === originalLast
      ? lastDay.getUTCDate()
      : Math.min(date.getUTCDate(), lastDay.getUTCDate());
  return new Date(
    Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), day),
  );
}

/** Align a monthly billing range's ending month with the invoice's issue month. */
export function monthlyServicePeriod(
  period: string | null | undefined,
  issueDate: string,
): string | null {
  const match = period?.trim().match(RANGE);
  const issue = issueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !issue) return null;
  const startMonth = monthIndex(match[2]);
  const endMonth = monthIndex(match[5]);
  const endYear = Number(match[6]);
  const startYear = match[3]
    ? Number(match[3])
    : endYear - (startMonth > endMonth ? 1 : 0);
  const start = calendarDate(startYear, startMonth, Number(match[1]));
  const end = calendarDate(endYear, endMonth, Number(match[4]));
  const issued = calendarDate(
    Number(issue[1]),
    Number(issue[2]) - 1,
    Number(issue[3]),
  );
  if (startMonth < 0 || endMonth < 0 || !start || !end || !issued) return null;
  const span = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  // Only monthly periods can move automatically; arbitrary notes and longer contracts stay editable.
  if (span < 28 || span > 31) return null;
  const months =
    (issued.getUTCFullYear() - endYear) * 12 + issued.getUTCMonth() - endMonth;
  const nextStart = shift(start, months);
  const nextEnd = shift(end, months);
  const startSuffix =
    nextStart.getUTCFullYear() === nextEnd.getUTCFullYear()
      ? ""
      : ` ${nextStart.getUTCFullYear()}`;
  return `${nextStart.getUTCDate()} ${MONTHS[nextStart.getUTCMonth()]}${startSuffix}–${nextEnd.getUTCDate()} ${MONTHS[nextEnd.getUTCMonth()]} ${nextEnd.getUTCFullYear()}`;
}

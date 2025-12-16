/**
 * Gets current time in user's timezone as a formatted string
 * @param timezone IANA timezone identifier (e.g., "Asia/Makassar", "Europe/Moscow")
 * @returns Formatted date and time string in user's timezone
 */
export function getUserTime(timezone: string): string {
  const now = new Date();

  // Format the date and time in user's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  const second = parts.find((p) => p.type === "second")?.value;

  // Format: YYYY-MM-DD HH:MM:SS (timezone)
  return `${year}-${month}-${day} ${hour}:${minute}:${second} (${timezone})`;
}

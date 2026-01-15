import { ScheduleSnooze } from "@/prisma/generated/client";

/**
 * Formats a snooze for display in the reminders list
 *
 * Example output:
 * ⏰ позвонить Кнопе
 * 📅 15 января 2026 г. (в четверг) в 16:47
 */
export function formatSnoozeList(
  snooze: ScheduleSnooze & {
    schedule: { id: string; emoji: string | null; message: string } | null;
  },
  timezone: string
): string {
  const emoji = snooze.schedule?.emoji || "⏰";
  const message = snooze.message;

  try {
    // Format date in Russian locale
    const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });

    const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const dateParts = dateFormatter.formatToParts(snooze.runAt);
    const timeParts = timeFormatter.formatToParts(snooze.runAt);

    const day = dateParts.find((p) => p.type === "day")?.value || "";
    const month = dateParts.find((p) => p.type === "month")?.value || "";
    const year = dateParts.find((p) => p.type === "year")?.value || "";
    const weekday = dateParts.find((p) => p.type === "weekday")?.value || "";

    const hour = timeParts.find((p) => p.type === "hour")?.value || "";
    const minute = timeParts.find((p) => p.type === "minute")?.value || "";

    // Format: "15 января 2026 г. (в четверг) в 16:47"
    const formattedDate = `${day} ${month} ${year} г. (в ${weekday}) в ${hour}:${minute}`;

    return `${emoji} ${message}\n📅 ${formattedDate}`;
  } catch (error) {
    // Fallback to simple format
    const fallbackDate = snooze.runAt.toLocaleString("ru-RU", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${emoji} ${message}\n📅 ${fallbackDate}`;
  }
}

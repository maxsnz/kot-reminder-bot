import { Schedule } from "@/prisma/generated/client";
import { formatScheduleDate } from "./formatScheduleDate";

/**
 * Formats a confirmation message for schedule actions
 * @param schedule The schedule object
 * @param timezone User's timezone (IANA identifier)
 * @param action The action performed: 'create', 'update', or 'cancel'
 * @returns Formatted confirmation message with emojis
 */
export function formatScheduleConfirmation(
  schedule: Schedule,
  timezone: string,
  action: "create" | "update" | "cancel"
): string {
  const formattedDate = formatScheduleDate(schedule, timezone);

  let statusEmoji: string;
  let statusText: string;

  if (action === "cancel") {
    statusEmoji = "❌";
    statusText = "Напоминание отменено.";
  } else {
    statusEmoji = "✅";
    statusText = "Напоминание запланировано.";
  }

  // Format the message with emojis
  return `${statusEmoji} ${statusText}\n\n📅 ${formattedDate}\n📝 ${schedule.message}`;
}

/**
 * Formats a confirmation message for snooze actions
 * @param runAt Date when the snooze will execute
 * @param message The reminder message
 * @param timezone User's timezone (IANA identifier)
 * @returns Formatted confirmation message with emojis
 */
export function formatSnoozeConfirmation(
  runAt: Date,
  message: string,
  timezone: string
): string {
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

    const dateParts = dateFormatter.formatToParts(runAt);
    const timeParts = timeFormatter.formatToParts(runAt);

    const day = dateParts.find((p) => p.type === "day")?.value || "";
    const month = dateParts.find((p) => p.type === "month")?.value || "";
    const year = dateParts.find((p) => p.type === "year")?.value || "";
    const weekday = dateParts.find((p) => p.type === "weekday")?.value || "";

    const hour = timeParts.find((p) => p.type === "hour")?.value || "";
    const minute = timeParts.find((p) => p.type === "minute")?.value || "";

    // Format: "15 января 2026 г. (в четверг) в 16:47"
    const formattedDate = `${day} ${month} ${year} г. (в ${weekday}) в ${hour}:${minute}`;

    return `✅ Напоминание отложено.\n\n📅 ${formattedDate}\n📝 ${message}`;
  } catch (error) {
    // Fallback to simple format
    const fallbackDate = runAt.toLocaleString("ru-RU", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `✅ Напоминание отложено.\n\n📅 ${fallbackDate}\n📝 ${message}`;
  }
}

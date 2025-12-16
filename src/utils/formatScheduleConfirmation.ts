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

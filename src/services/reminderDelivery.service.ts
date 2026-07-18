import { Schedule, User, MessageRole } from "@/prisma/generated/client";
import { MessageService } from "./message.service";
import { ChatMessageService } from "./chatMessage.service";
import { FocusService } from "./focus.service";
import { UserService } from "./user.service";
import { ScheduleService } from "./schedule.service";
import { createSnoozeKeyboard } from "@/utils/createSnoozeKeyboard";
import { getNextRunAt } from "@/utils/getNextRunAt";
import { logger } from "@/utils/logger";

/**
 * Sends reminder messages to users and records them. Shared by the
 * schedule-reminder worker (normal, on-time delivery) and the timezone-change
 * flow (catch-up delivery for occurrences that fell into the past).
 */
export class ReminderDeliveryService {
  constructor(
    private messageService: MessageService,
    private chatMessageService: ChatMessageService,
    private focusService: FocusService,
    private userService: UserService,
    private scheduleService: ScheduleService
  ) {}

  /**
   * Send the reminder message to the user and record it as a system message.
   * Does NOT (re)schedule the next run — callers handle scheduling separately.
   */
  async deliver(schedule: Schedule, user: User): Promise<void> {
    const inlineKeyboard = createSnoozeKeyboard(schedule.id);
    const message = `${schedule.emoji ?? ""} ${schedule.message}`;

    const sentMessage = await this.messageService.sendMessageWithInlineKeyboard(
      user.chatId,
      message,
      inlineKeyboard
    );

    if (sentMessage) {
      logger.info(
        { userId: user.id, scheduleId: schedule.id, reminderText: message },
        `Sent message to user ${user.username}: ${message}`
      );
    } else {
      logger.warn(
        { userId: user.id, scheduleId: schedule.id },
        "Failed to send message to user for schedule, continuing anyway"
      );
    }

    const focus = await this.focusService.findByScheduleId(schedule.id);

    // text is stored as the raw schedule.message (without emoji) so it can be
    // matched later as a delivery marker — see getLastReminderDeliveryAt.
    await this.chatMessageService.createMessage({
      userId: user.id,
      telegramChatId: user.chatId.toString(),
      telegramMessageId: sentMessage?.message_id?.toString() ?? null,
      role: MessageRole.system,
      text: schedule.message,
      scheduleId: schedule.id,
      focusId: focus?.id ?? null,
    });

    if (focus) {
      await this.userService.setFocus(user.id, focus.id);
    }
  }

  /**
   * After a timezone change, deliver reminders whose (re-anchored) time now
   * lies in the past and were never sent. Sends at most one catch-up per
   * schedule (collapsing multiple missed occurrences into a single ping);
   * delivery is recorded so repeated timezone changes don't re-fire it.
   */
  async fireMissedForUser(userId: string, timezone: string): Promise<void> {
    const user = await this.userService.findById(userId);
    const schedules = await this.scheduleService.findActiveByUserId(userId);
    const now = new Date();

    for (const schedule of schedules) {
      try {
        const lastDeliveredAt =
          (await this.chatMessageService.getLastReminderDeliveryAt(
            schedule.id,
            schedule.message
          )) ?? schedule.createdAt;

        // First occurrence due strictly after the last delivery. If it is
        // already in the past, that occurrence was missed (the timezone shift
        // moved it behind "now") and never delivered — send it immediately.
        const missedAt = getNextRunAt(lastDeliveredAt, schedule, timezone);
        if (missedAt && missedAt.getTime() <= now.getTime()) {
          logger.info(
            {
              scheduleId: schedule.id,
              userId,
              missedAt: missedAt.toISOString(),
            },
            "Delivering missed reminder after timezone change"
          );
          await this.deliver(schedule, user);
        }
      } catch (error) {
        logger.error(
          { err: error, scheduleId: schedule.id, userId },
          "Failed to deliver missed reminder"
        );
        // Continue with the rest even if one fails
      }
    }
  }
}

import { Task } from "graphile-worker";
import { ScheduleSnoozeService } from "@/services/scheduleSnooze.service";
import { MessageService } from "@/services/message.service";
import { createSnoozeKeyboard } from "@/utils/createSnoozeKeyboard";
import { logger } from "@/utils/logger";

interface ScheduleSnoozeJobData {
  snoozeId: string;
}

export function createScheduleSnoozeTask(
  scheduleSnoozeService: ScheduleSnoozeService,
  messageService: MessageService
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as ScheduleSnoozeJobData;
    const { snoozeId } = jobData;

    // logger.info({ snoozeId }, "Processing schedule snooze");

    try {
      const snooze = await scheduleSnoozeService.findByIdWithRelations(
        snoozeId
      );
      if (!snooze) {
        logger.error({ snoozeId }, "Snooze not found");
        return;
      }

      if (!snooze.user) {
        logger.error({ snoozeId }, "User not found for snooze");
        await scheduleSnoozeService.deleteSnooze(snoozeId);
        return;
      }

      if (!snooze.schedule) {
        logger.error({ snoozeId }, "Schedule not found for snooze");
        await scheduleSnoozeService.deleteSnooze(snoozeId);
        return;
      }

      const user = snooze.user;
      const schedule = snooze.schedule;

      // Create inline keyboard with snooze buttons
      const inlineKeyboard = createSnoozeKeyboard(schedule.id);

      const message = `${schedule.emoji ?? ""} ${snooze.message}`;

      // Send snooze reminder message with inline keyboard buttons
      const sentMessage = await messageService.sendMessageWithInlineKeyboard(
        user.chatId,
        message,
        inlineKeyboard
      );

      if (sentMessage) {
        logger.info(
          {
            userId: user.id,
            snoozeId: snooze.id,
            scheduleId: schedule.id,
            message,
          },
          `Sent snooze reminder message to user`
        );
      } else {
        logger.warn(
          { userId: user.id, snoozeId: snooze.id, scheduleId: schedule.id },
          "Failed to send snooze reminder message, continuing anyway"
        );
      }

      // Delete snooze after execution (one-time execution)
      await scheduleSnoozeService.deleteSnooze(snoozeId);

      // logger.info({ snoozeId }, "Schedule snooze processed successfully");
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          snoozeId,
        },
        "Failed to process schedule snooze"
      );
      throw error;
    }
  };
}

import { Task } from "graphile-worker";
import { Telegraf } from "telegraf";
import { ScheduleService } from "@/services/schedule.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { FocusService } from "@/services/focus.service";
import { UserService } from "@/services/user.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { getNextRunAt } from "@/utils/getNextRunAt";
import { MessageRole, StatusKind } from "@/prisma/generated/client";
import { logger } from "@/utils/logger";

interface ScheduleReminderJobData {
  scheduleId: string;
  timezone: string;
}

export function createScheduleReminderTask(
  scheduleService: ScheduleService,
  chatMessageService: ChatMessageService,
  focusService: FocusService,
  userService: UserService,
  graphileWorkerService: GraphileWorkerService,
  bot: Telegraf
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as ScheduleReminderJobData;
    const { scheduleId, timezone } = jobData;

    logger.info({ scheduleId }, "Processing schedule reminder");

    try {
      const schedule = await scheduleService.findById(scheduleId);
      if (!schedule) {
        logger.error({ scheduleId }, "Schedule not found");
        return;
      }

      if (schedule.status !== StatusKind.active) {
        logger.info(
          { scheduleId, status: schedule.status },
          "Schedule is not active, skipping"
        );
        return;
      }

      if (!schedule.user) {
        logger.error({ scheduleId }, "User not found for schedule");
        return;
      }

      const user = schedule.user;

      let telegramMessageId: number | undefined;
      try {
        const sentMessage = await bot.telegram.sendMessage(
          user.chatId,
          `${schedule.emoji ?? ""} ${schedule.message}`
        );
        telegramMessageId = sentMessage.message_id;
        logger.info(
          { userId: user.id, scheduleId: schedule.id },
          "Sent message to user for schedule"
        );
      } catch (telegramError) {
        const errorMessage =
          telegramError instanceof Error
            ? telegramError.message
            : String(telegramError);
        logger.error(
          {
            err:
              telegramError instanceof Error
                ? telegramError
                : new Error(String(telegramError)),
            scheduleId,
          },
          "Failed to send Telegram message for schedule"
        );
        throw new Error(`Failed to send Telegram message: ${errorMessage}`);
      }

      const focus = await focusService.findByScheduleId(schedule.id);

      if (focus) {
        await chatMessageService.createMessage({
          userId: user.id,
          telegramChatId: user.chatId.toString(),
          telegramMessageId: telegramMessageId?.toString(),
          role: MessageRole.system,
          text: schedule.message,
          scheduleId: schedule.id,
          focusId: focus.id,
        });

        await userService.setFocus(user.id, focus.id);

        logger.info(
          { userId: user.id, scheduleId: schedule.id, focusId: focus.id },
          "Created system message and updated user focus"
        );
      } else {
        logger.warn(
          { scheduleId: schedule.id },
          "No focus found for schedule, skipping ChatMessage creation"
        );
      }

      const currentTime = new Date();
      const nextRunAt = getNextRunAt(currentTime, schedule, timezone);

      if (nextRunAt) {
        await graphileWorkerService.addJob(
          "schedule-reminder",
          { scheduleId, timezone },
          {
            jobKey: `schedule:${scheduleId}`,
            jobKeyMode: "replace",
            runAt: nextRunAt,
          }
        );
        logger.info(
          {
            scheduleId: schedule.id,
            nextRunAt: nextRunAt.toISOString(),
          },
          "Scheduled next reminder for schedule"
        );
      } else {
        await scheduleService.endSchedule(schedule.id);
        logger.info(
          { scheduleId: schedule.id },
          "Schedule ended (no more runs)"
        );
      }

      logger.info({ scheduleId }, "Schedule reminder processed successfully");
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          scheduleId,
        },
        "Failed to process schedule reminder"
      );
      throw error;
    }
  };
}

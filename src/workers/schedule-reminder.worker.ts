import { Task } from "graphile-worker";
import { ScheduleService } from "@/services/schedule.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { ReminderDeliveryService } from "@/services/reminderDelivery.service";
import { getNextRunAt } from "@/utils/getNextRunAt";
import { StatusKind } from "@/prisma/generated/client";
import { logger } from "@/utils/logger";

interface ScheduleReminderJobData {
  scheduleId: string;
  timezone: string;
}

export function createScheduleReminderTask(
  scheduleService: ScheduleService,
  reminderDeliveryService: ReminderDeliveryService,
  graphileWorkerService: GraphileWorkerService
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as ScheduleReminderJobData;
    const { scheduleId, timezone: payloadTimezone } = jobData;

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

      // Prefer the user's current timezone over the one baked into the job
      // payload, so reminders follow the user after a timezone change.
      const timezone = user.timezone || payloadTimezone;

      await reminderDeliveryService.deliver(schedule, user);

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
      } else {
        await scheduleService.endSchedule(schedule.id);
        logger.debug(
          { scheduleId: schedule.id },
          "Schedule ended (no more runs)"
        );
      }
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

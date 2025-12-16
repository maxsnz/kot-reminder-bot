import { ScheduleService } from "@/services/schedule.service";
import { FocusService } from "@/services/focus.service";
import { UserService } from "@/services/user.service";
import { Schedule } from "@/prisma/generated/client";
import { z } from "zod";
import { ResultCreateSchedule, ResultUpdateSchedule } from "@/bot/prompt";
import { logger } from "@/utils/logger";

export interface ScheduleActionProcessorDependencies {
  scheduleService: ScheduleService;
  focusService: FocusService;
  userService: UserService;
}

export type ScheduleForConfirmation = {
  schedule: Schedule;
  action: "create" | "update" | "cancel";
} | null;

type AIResultAction =
  | z.infer<typeof ResultCreateSchedule>
  | z.infer<typeof ResultUpdateSchedule>
  | { action: "cancel_schedule"; scheduleId: string }
  | { action: "set_timezone"; timezone?: string }
  | { action: "show_user_schedules" }
  | { action: "ask" | "error" };

export class ScheduleActionProcessor {
  constructor(private deps: ScheduleActionProcessorDependencies) {}

  async processAction(
    result: AIResultAction,
    userId: string,
    focusId: string,
    sourceText: string
  ): Promise<ScheduleForConfirmation> {
    switch (result.action) {
      case "create_schedule":
        if (result.schedule) {
          const user = await this.deps.userService.findById(userId);
          if (!user.timezone) {
            logger.error({ userId }, "User has no timezone set");
            break;
          }

          const schedule =
            await this.deps.scheduleService.createScheduleFromAIResponse(
              userId,
              result.schedule,
              sourceText,
              user.timezone
            );
          await this.deps.focusService.setSchedule(focusId, schedule.id);

          return {
            schedule,
            action: "create",
          };
        }
        break;

      case "update_schedule":
        if (result.scheduleId && result.patch) {
          const schedule = await this.deps.scheduleService.findById(
            result.scheduleId
          );
          if (!schedule) {
            logger.error(
              { scheduleId: result.scheduleId },
              "Schedule not found"
            );
            break;
          }

          const user = await this.deps.userService.findById(schedule.userId);
          if (!user.timezone) {
            logger.error(
              { userId: schedule.userId },
              "User has no timezone set"
            );
            break;
          }

          const updatedSchedule =
            await this.deps.scheduleService.updateScheduleFromAIResponse(
              result.scheduleId,
              result.patch,
              user.timezone
            );
          await this.deps.focusService.setSchedule(focusId, result.scheduleId);

          return {
            schedule: updatedSchedule,
            action: "update",
          };
        }
        break;

      case "cancel_schedule":
        if (result.scheduleId) {
          const scheduleToCancel = await this.deps.scheduleService.findById(
            result.scheduleId
          );
          if (scheduleToCancel) {
            await this.deps.scheduleService.cancelSchedule(result.scheduleId);

            return {
              schedule: scheduleToCancel,
              action: "cancel",
            };
          } else {
            logger.error(
              { scheduleId: result.scheduleId },
              "Schedule not found"
            );
          }
        }
        break;

      case "set_timezone":
      case "show_user_schedules":
      case "ask":
      case "error":
        // No schedule actions for these
        break;
    }

    return null;
  }
}

import { Context } from "telegraf";
import { Markup } from "telegraf";
import { UserService } from "@/services/user.service";
import { ScheduleService } from "@/services/schedule.service";
import { ScheduleSnoozeService } from "@/services/scheduleSnooze.service";
import { MessageService } from "@/services/message.service";
import { formatScheduleList } from "@/utils/formatScheduleList";
import { formatSnoozeList } from "@/utils/formatSnoozeList";

export interface UserCommandsHandlerDependencies {
  userService: UserService;
  scheduleService: ScheduleService;
  scheduleSnoozeService: ScheduleSnoozeService;
  messageService: MessageService;
}

export class UserCommandsHandler {
  constructor(private deps: UserCommandsHandlerDependencies) {}

  async handleList(ctx: Context) {
    const chatId = ctx.message?.chat.id;
    if (!chatId || !("text" in ctx.message)) return;

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) {
      await this.deps.messageService.sendMessage(
        chatId,
        `Привет, кажется мы не знакомы. Чтобы начать, пожалуйста, отправь команду /start`
      );
      return;
    }

    const schedules = await this.deps.scheduleService.findActiveByUserId(
      user.id
    );
    const snoozes = await this.deps.scheduleSnoozeService.findActiveByUserId(
      user.id
    );

    if (schedules.length === 0 && snoozes.length === 0) {
      await this.deps.messageService.sendMessage(
        chatId,
        `У тебя нет активных задач`
      );
      return;
    }

    const timezone = user.timezone || "UTC";
    const parts: string[] = [];

    // Add regular schedules with numbers
    if (schedules.length > 0) {
      const schedulesText = schedules
        .map(
          (schedule, index) =>
            `${index + 1}. ${formatScheduleList(schedule, timezone)}`
        )
        .join("\n\n");
      parts.push(`*Активные напоминания:*\n\n${schedulesText}`);
    }

    // Add snoozes separately if they exist
    if (snoozes.length > 0) {
      const snoozesText = snoozes
        .map((snooze) => formatSnoozeList(snooze, timezone))
        .join("\n\n");
      parts.push(`\n*Отложенные напоминания:*\n\n${snoozesText}`);
    }

    const allText = parts.join("\n\n");

    // Build numbered inline buttons for schedules (rows of up to 5)
    const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
    if (schedules.length > 0) {
      let row: ReturnType<typeof Markup.button.callback>[] = [];
      schedules.forEach((schedule, index) => {
        row.push(
          Markup.button.callback(
            `${index + 1}`,
            `schedule_view:${schedule.id}`
          )
        );
        if (row.length === 5) {
          buttons.push(row);
          row = [];
        }
      });
      if (row.length > 0) {
        buttons.push(row);
      }
    }

    await this.deps.messageService.sendMarkdownV2(chatId, allText, {
      reply_markup:
        buttons.length > 0
          ? { inline_keyboard: buttons }
          : undefined,
    });
  }
}

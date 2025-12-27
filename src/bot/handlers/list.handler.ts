import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { ScheduleService } from "@/services/schedule.service";
import { MessageService } from "@/services/message.service";
import { formatScheduleList } from "@/utils/formatScheduleList";

export interface UserCommandsHandlerDependencies {
  userService: UserService;
  scheduleService: ScheduleService;
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
    if (schedules.length === 0) {
      await this.deps.messageService.sendMessage(
        chatId,
        `У тебя нет активных задач`
      );
      return;
    }
    const timezone = user.timezone || "UTC";
    const allSchedules = schedules
      .map((schedule) => formatScheduleList(schedule, timezone))
      .join("\n\n");
    await this.deps.messageService.sendMarkdownV2(chatId, allSchedules);
  }
}

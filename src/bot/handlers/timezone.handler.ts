import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { MessageService } from "@/services/message.service";

export interface TimezoneHandlerDependencies {
  userService: UserService;
  messageService: MessageService;
}

export class TimezoneHandler {
  constructor(private deps: TimezoneHandlerDependencies) {}

  async handle(ctx: Context) {
    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) return;

    // await this.deps.userService.updateUser(user.id, { timezone: null });
    await this.deps.messageService.sendMessage(
      chatId,
      `Твоя текущая таймзона зона: ${
        user.timezone || "неизвестно"
      }. Пожалуйста, напиши мне где ты находишься, мне хватит города и страны`
    );
  }
}

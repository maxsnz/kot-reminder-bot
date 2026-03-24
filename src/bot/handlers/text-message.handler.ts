import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { MessageService } from "@/services/message.service";
import { UserTextInputProcessor } from "@/bot/processors/user-text-input.processor";
import { logger } from "@/utils/logger";

export interface TextMessageHandlerDependencies {
  userService: UserService;
  messageService: MessageService;
  userTextInputProcessor: UserTextInputProcessor;
}

export class TextMessageHandler {
  constructor(private deps: TextMessageHandlerDependencies) {}

  async handle(ctx: Context) {
    try {
      if (!ctx.message || !("text" in ctx.message)) return;

      const chatId = ctx.message.chat.id;
      const messageText = ctx.message.text;
      if (!messageText) return;

      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Привет, кажется мы не знакомы. Чтобы начать, пожалуйста, отправь команду /start`
        );
        return;
      }

      const replyToMessageId = ctx.message.reply_to_message?.message_id?.toString();
      await this.deps.userTextInputProcessor.process(
        user,
        chatId,
        messageText,
        ctx.message.message_id.toString(),
        replyToMessageId
      );
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : new Error(String(e)) },
        "Error handling text message"
      );
      const chatId = ctx.message?.chat.id;
      if (chatId) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Ошибка: ${e instanceof Error ? e.message : "Неизвестная ошибка"}`
        );
      }
    }
  }
}

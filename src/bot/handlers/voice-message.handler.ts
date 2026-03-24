import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { MessageService } from "@/services/message.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { logger } from "@/utils/logger";

export interface VoiceMessageHandlerDependencies {
  userService: UserService;
  messageService: MessageService;
  graphileWorkerService: GraphileWorkerService;
}

export class VoiceMessageHandler {
  constructor(private deps: VoiceMessageHandlerDependencies) {}

  async handle(ctx: Context) {
    try {
      if (!ctx.message || !("voice" in ctx.message)) return;

      const chatId = ctx.message.chat.id;
      const fileId = ctx.message.voice.file_id;
      const telegramMessageId = ctx.message.message_id.toString();

      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Привет, кажется мы не знакомы. Чтобы начать, пожалуйста, отправь команду /start`
        );
        return;
      }

      await this.deps.messageService.sendMessage(chatId, "🎤 Распознаю голосовое...");

      const replyToMessageId = ctx.message.reply_to_message?.message_id?.toString();
      await this.deps.graphileWorkerService.addJob("voice-transcription", {
        userId: user.id,
        chatId,
        fileId,
        telegramMessageId,
        replyToMessageId,
      });
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : new Error(String(e)) },
        "Error handling voice message"
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

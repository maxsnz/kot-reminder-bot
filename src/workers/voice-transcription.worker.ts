import { Task } from "graphile-worker";
import { Telegraf } from "telegraf";
import fetch from "node-fetch";
import { AIService } from "@/services/ai.service";
import { UserService } from "@/services/user.service";
import { MessageService } from "@/services/message.service";
import { UserTextInputProcessor } from "@/bot/processors/user-text-input.processor";
import { logger } from "@/utils/logger";

interface VoiceTranscriptionJobData {
  userId: string;
  chatId: number;
  fileId: string;
  telegramMessageId: string;
  replyToMessageId?: string;
}

export function createVoiceTranscriptionTask(
  aiService: AIService,
  userService: UserService,
  messageService: MessageService,
  userTextInputProcessor: UserTextInputProcessor,
  bot: Telegraf,
  telegramToken: string
): Task {
  return async (payload: unknown) => {
    const { userId, chatId, fileId, telegramMessageId, replyToMessageId } =
      payload as VoiceTranscriptionJobData;

    logger.info({ userId, chatId, fileId }, "Processing voice transcription");

    try {
      // Download voice file from Telegram
      const file = await bot.telegram.getFile(fileId);
      if (!file.file_path) {
        throw new Error("No file_path returned from Telegram");
      }
      const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Transcribe with Whisper
      const transcription = await aiService.transcribeAudio(buffer, "voice.ogg");
      logger.info({ userId, transcription }, "Voice transcribed");

      // Show transcription to user
      await messageService.sendMessage(chatId, `🎤 ${transcription}`);

      const user = await userService.findById(userId);
      if (!user) throw new Error(`User ${userId} not found`);

      await userTextInputProcessor.process(user, chatId, transcription, telegramMessageId, replyToMessageId);
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)), userId, chatId },
        "Failed to process voice transcription"
      );
      await messageService.sendMessage(
        chatId,
        `Ошибка распознавания голосового: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`
      );
      throw error;
    }
  };
}

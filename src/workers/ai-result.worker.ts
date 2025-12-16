import { Task } from "graphile-worker";
import { Telegraf } from "telegraf";
import { AiRequestService } from "@/services/aiRequest.service";
import { AiResultProcessor } from "@/bot/processors/ai-result.processor";
import { logger } from "@/utils/logger";

interface AiResultJobData {
  aiRequestId: string;
}

export function createAiResultTask(
  aiRequestService: AiRequestService,
  aiResultProcessor: AiResultProcessor,
  bot: Telegraf
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as AiResultJobData;
    const { aiRequestId } = jobData;

    let aiRequest = await aiRequestService.findById(aiRequestId);
    if (!aiRequest) {
      logger.error({ aiRequestId }, "AiRequest not found");
      throw new Error(`AiRequest ${aiRequestId} not found`);
    }

    try {
      if (aiRequest.status !== "succeeded") {
        logger.warn(
          { aiRequestId, status: aiRequest.status },
          "AiRequest is not in succeeded status, skipping"
        );
        return;
      }

      await aiResultProcessor.processResult(aiRequest);

      const elapsedTimeSeconds = aiRequest.elapsedTime
        ? Math.round((aiRequest.elapsedTime / 1000) * 10) / 10
        : null;

      logger.info(
        {
          aiRequestId,
          elapsedTime: elapsedTimeSeconds,
          tokens: {
            input: aiRequest.inputTokens,
            output: aiRequest.outputTokens,
            total: aiRequest.totalTokens,
          },
        },
        "AI result processed successfully"
      );
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          aiRequestId,
        },
        "Failed to process AI result"
      );

      try {
        if (!aiRequest) {
          aiRequest = await aiRequestService.findById(aiRequestId);
        }
        if (aiRequest) {
          const promptData = aiRequest.prompt as any;
          const chatId = promptData?.chatId as number;
          if (chatId) {
            const errorMessage =
              error instanceof Error ? error.message : "Неизвестная ошибка";
            await bot.telegram.sendMessage(chatId, `Ошибка: ${errorMessage}`);
          }
        }
      } catch (sendError) {
        logger.error(
          {
            err:
              sendError instanceof Error
                ? sendError
                : new Error(String(sendError)),
            aiRequestId,
          },
          "Failed to send error message to user"
        );
      }

      throw error;
    }
  };
}

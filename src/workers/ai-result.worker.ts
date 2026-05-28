import { Task } from "graphile-worker";
import { AiRequestService } from "@/services/aiRequest.service";
import { AiResultProcessor } from "@/bot/processors/ai-result.processor";
import { MessageService } from "@/services/message.service";
import { logger } from "@/utils/logger";
import { classifyAiError } from "@/utils/classifyAiError";

interface AiResultJobData {
  aiRequestId: string;
}

const USER_ERROR_MESSAGE =
  "🤖 Не удалось обработать запрос. Попробуйте ещё раз чуть позже.";

export function createAiResultTask(
  aiRequestService: AiRequestService,
  aiResultProcessor: AiResultProcessor,
  messageService: MessageService
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          aiRequestId,
        },
        "Failed to process AI result"
      );

      const classification = classifyAiError(errorMessage);

      // Notify the user once, on the first execution of this job. See
      // ai-request.worker.ts for the same rationale.
      const isFirstAttempt = helpers.job.attempts <= 1;
      if (isFirstAttempt) {
        try {
          if (!aiRequest) {
            aiRequest = await aiRequestService.findById(aiRequestId);
          }
          const promptData = aiRequest?.prompt as any;
          const chatId = promptData?.chatId as number | undefined;
          if (chatId) {
            await messageService.sendMessage(chatId, USER_ERROR_MESSAGE);
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
      }

      // Permanent errors won't recover on retry — stop the chain.
      if (classification === "permanent") {
        logger.warn(
          { aiRequestId, errorMessage, classification },
          "Permanent AI-result error, not retrying"
        );
        return;
      }

      // Transient: let Graphile Worker retry.
      throw error;
    }
  };
}

import { Task } from "graphile-worker";
import { Telegraf } from "telegraf";
import { AiRequestService } from "@/services/aiRequest.service";
import { AIService } from "@/services/ai.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { MessageService } from "@/services/message.service";
import { logger } from "@/utils/logger";
import { calculateCost } from "@/utils/costCalculator";
import { classifyAiError } from "@/utils/classifyAiError";

interface AiRequestJobData {
  aiRequestId: string;
}

const USER_ERROR_MESSAGE =
  "🤖 Не удалось обработать запрос. Попробуйте ещё раз чуть позже.";

export function createAiRequestTask(
  aiRequestService: AiRequestService,
  aiService: AIService,
  graphileWorkerService: GraphileWorkerService,
  messageService: MessageService,
  bot: Telegraf
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as AiRequestJobData;
    const { aiRequestId } = jobData;
    const startTime = performance.now();

    logger.info({ aiRequestId }, "Processing AI request");

    let typingInterval: NodeJS.Timeout | null = null;
    // Hoisted so the catch block can reach the user even if the AI call throws.
    let chatId: number | undefined;

    try {
      const aiRequest = await aiRequestService.findById(aiRequestId);
      if (!aiRequest) {
        logger.error({ aiRequestId }, "AiRequest not found");
        throw new Error(`AiRequest ${aiRequestId} not found`);
      }

      if (aiRequest.status !== "queued") {
        logger.warn(
          { aiRequestId, status: aiRequest.status },
          "AiRequest is not in queued status, skipping"
        );
        return;
      }

      await aiRequestService.markProcessing(aiRequestId);

      const promptData = aiRequest.prompt as any;
      if (!promptData || !promptData.prompt) {
        throw new Error("Prompt not found in AiRequest");
      }

      const prompt = promptData.prompt as string;
      chatId = promptData.chatId as number | undefined;

      if (chatId) {
        bot.telegram.sendChatAction(chatId, "typing").catch((err) => {
          logger.warn({ err, chatId }, "Failed to send typing action");
        });

        typingInterval = setInterval(() => {
          bot.telegram.sendChatAction(chatId!, "typing").catch((err) => {
            logger.warn({ err, chatId }, "Failed to send typing action");
          });
        }, 4000);
      }

      const aiResponse = await aiService.processMessage(prompt);

      logger.info(
        {
          aiRequestId,
          fullLLMResponse: aiResponse.fullResponse,
        },
        "Full LLM response received"
      );

      const endTime = performance.now();
      const elapsedTime = Math.round(endTime - startTime);

      const usage = aiResponse.usage;
      const inputTokens = usage?.input_tokens ?? null;
      const outputTokens = usage?.output_tokens ?? null;
      const totalTokens = usage?.total_tokens ?? null;

      const model = aiResponse.model || "gpt-5-nano";
      const cost = calculateCost(model, {
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        totalTokens: totalTokens ?? 0,
      });

      await aiRequestService.markSucceeded(aiRequestId, {
        responseText: aiResponse.result.response ?? null,
        responseJson: aiResponse.result,
        modelName: model,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        elapsedTime,
      });

      logger.info(
        {
          aiRequestId,
          elapsedTime,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
          },
          cost,
          model,
          result: aiResponse.result,
        },
        "AI request processed successfully"
      );

      await graphileWorkerService.addJob("ai-result", {
        aiRequestId,
      });

      logger.debug({ aiRequestId }, "Sent job to ai-result queue");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          aiRequestId,
        },
        "Failed to process AI request"
      );

      const classification = classifyAiError(errorMessage);

      try {
        await aiRequestService.markFailed(aiRequestId, errorMessage);
      } catch (updateError) {
        logger.error(
          {
            err:
              updateError instanceof Error
                ? updateError
                : new Error(String(updateError)),
            aiRequestId,
          },
          "Failed to mark AiRequest as failed"
        );
      }

      // Notify the user once, on the first execution of this job. If we retry,
      // we stay silent — either the retry succeeds (user gets the real answer)
      // or it gives up (the first-attempt message already warned them).
      const isFirstAttempt = helpers.job.attempts <= 1;
      if (isFirstAttempt && chatId) {
        try {
          await messageService.sendMessage(chatId, USER_ERROR_MESSAGE);
        } catch (sendError) {
          logger.error(
            {
              err:
                sendError instanceof Error
                  ? sendError
                  : new Error(String(sendError)),
              aiRequestId,
              chatId,
            },
            "Failed to send error message to user"
          );
        }
      }

      // Permanent errors (quota, billing, auth, parsing) won't recover on
      // retry — return without throwing so Graphile Worker stops trying.
      if (classification === "permanent") {
        logger.warn(
          { aiRequestId, errorMessage, classification },
          "Permanent AI error, not retrying"
        );
        return;
      }

      // Transient: let Graphile Worker retry.
      throw error;
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }
  };
}

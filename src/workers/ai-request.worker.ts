import { Task } from "graphile-worker";
import { Telegraf } from "telegraf";
import { AiRequestService } from "@/services/aiRequest.service";
import { AIService } from "@/services/ai.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { logger } from "@/utils/logger";
import { calculateCost } from "@/utils/costCalculator";

interface AiRequestJobData {
  aiRequestId: string;
}

export function createAiRequestTask(
  aiRequestService: AiRequestService,
  aiService: AIService,
  graphileWorkerService: GraphileWorkerService,
  bot: Telegraf
): Task {
  return async (payload: unknown, helpers) => {
    const jobData = payload as AiRequestJobData;
    const { aiRequestId } = jobData;
    const startTime = performance.now();

    logger.info({ aiRequestId }, "Processing AI request");

    let typingInterval: NodeJS.Timeout | null = null;

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
      const chatId = promptData.chatId as number | undefined;

      if (chatId) {
        bot.telegram.sendChatAction(chatId, "typing").catch((err) => {
          logger.warn({ err, chatId }, "Failed to send typing action");
        });

        typingInterval = setInterval(() => {
          bot.telegram.sendChatAction(chatId, "typing").catch((err) => {
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

      throw error;
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }
  };
}

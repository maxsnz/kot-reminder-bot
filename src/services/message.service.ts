import { Telegraf } from "telegraf";
import { escapeMarkdownV2 } from "@/utils/escapeMarkdownV2";
import type { Message } from "telegraf/types";
import { logger } from "@/utils/logger";

type SendMessageOptions = Parameters<Telegraf["telegram"]["sendMessage"]>[2];

/**
 * Escapes MarkdownV2 special characters while preserving code blocks (triple backticks)
 * Code block delimiters (```) are kept unescaped so Telegram recognizes them
 */
function escapeMarkdownV2PreservingCodeBlocks(text: string): string {
  // Match code blocks: ``` followed by optional language, newline, content, and closing ```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts: Array<{ type: "text" | "code"; content: string }> = [];
  let lastIndex = 0;
  let match;

  // Find all code blocks and split text into parts
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block (escaped)
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }

    // Add code block (with escaped content but unescaped backticks)
    const lang = match[1] || "";
    const content = match[2];
    const escapedContent = escapeMarkdownV2(content);
    parts.push({
      type: "code",
      content: `\`\`\`${lang}\n${escapedContent}\`\`\``,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last code block (escaped)
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.substring(lastIndex),
    });
  }

  // If no code blocks found, escape entire text
  if (parts.length === 0) {
    return escapeMarkdownV2(text);
  }

  // Escape text parts and combine with code blocks
  return parts
    .map((part) =>
      part.type === "text" ? escapeMarkdownV2(part.content) : part.content
    )
    .join("");
}

export class MessageService {
  constructor(private bot: Telegraf) {}

  /**
   * Send a plain text message to a chat
   * @param chatId Telegram chat ID
   * @param text Message text
   * @param options Optional Telegram message options
   * @returns The sent message, or null if sending failed
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<Message.TextMessage | null> {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as any).response !== null
          ? (error as any).response?.error_code
          : undefined;

      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          chatId,
          errorCode,
          messagePreview: text.substring(0, 100),
        },
        "Failed to send message"
      );

      return null;
    }
  }

  /**
   * Send a MarkdownV2 formatted message to a chat
   * Automatically escapes special characters in the text while preserving code blocks
   * If MarkdownV2 parsing fails, automatically falls back to plain text
   * @param chatId Telegram chat ID
   * @param text Message text (will be escaped for MarkdownV2, code blocks preserved)
   * @param options Optional Telegram message options (parse_mode will be overridden)
   * @returns The sent message, or null if sending failed
   */
  async sendMarkdownV2(
    chatId: number,
    text: string,
    options?: Omit<SendMessageOptions, "parse_mode">
  ): Promise<Message.TextMessage | null> {
    try {
      const escapedText = escapeMarkdownV2PreservingCodeBlocks(text);
      return await this.bot.telegram.sendMessage(chatId, escapedText, {
        ...options,
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as any).response !== null
          ? (error as any).response?.error_code
          : undefined;

      // Check if this is a MarkdownV2 parsing error (400 Bad Request with parse error)
      const isParsingError =
        errorCode === 400 &&
        (errorMessage.includes("can't parse entities") ||
          errorMessage.includes("parse") ||
          errorMessage.includes("Bad Request"));

      if (isParsingError) {
        // Fallback to plain text
        logger.warn(
          {
            err: error instanceof Error ? error : new Error(String(error)),
            chatId,
            errorCode,
            messagePreview: text.substring(0, 100),
          },
          "MarkdownV2 parsing error, falling back to plain text"
        );

        try {
          // Send as plain text (options already doesn't include parse_mode)
          return await this.bot.telegram.sendMessage(chatId, text, options);
        } catch (fallbackError) {
          logger.error(
            {
              err:
                fallbackError instanceof Error
                  ? fallbackError
                  : new Error(String(fallbackError)),
              chatId,
              messagePreview: text.substring(0, 100),
            },
            "Failed to send message even with plain text fallback"
          );
          return null;
        }
      }

      // For other errors, log and return null
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          chatId,
          errorCode,
          messagePreview: text.substring(0, 100),
        },
        "Failed to send MarkdownV2 message"
      );

      return null;
    }
  }

  async sendAsCodeBlock(
    chatId: number,
    text: string,
    options?: Omit<SendMessageOptions, "parse_mode">
  ): Promise<Message.TextMessage | null> {
    return await this.bot.telegram.sendMessage(chatId, `\`\`\`${text}\`\`\``, {
      ...options,
      parse_mode: "MarkdownV2",
    });
  }

  async sendJson(
    chatId: number,
    json: any,
    options?: Omit<SendMessageOptions, "parse_mode">
  ): Promise<Message.TextMessage | null> {
    return await this.bot.telegram.sendMessage(
      chatId,
      `\`\`\`json\n${JSON.stringify(json, null, 2)}\`\`\``,
      {
        ...options,
        parse_mode: "MarkdownV2",
      }
    );
  }
}

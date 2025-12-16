import { Telegraf } from "telegraf";
import { escapeMarkdownV2 } from "@/utils/escapeMarkdownV2";
import type { Message } from "telegraf/types";

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
   * @returns The sent message
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<Message.TextMessage> {
    return await this.bot.telegram.sendMessage(chatId, text, options);
  }

  /**
   * Send a MarkdownV2 formatted message to a chat
   * Automatically escapes special characters in the text while preserving code blocks
   * @param chatId Telegram chat ID
   * @param text Message text (will be escaped for MarkdownV2, code blocks preserved)
   * @param options Optional Telegram message options (parse_mode will be overridden)
   * @returns The sent message
   */
  async sendMarkdownV2(
    chatId: number,
    text: string,
    options?: Omit<SendMessageOptions, "parse_mode">
  ): Promise<Message.TextMessage> {
    const escapedText = escapeMarkdownV2PreservingCodeBlocks(text);
    return await this.bot.telegram.sendMessage(chatId, escapedText, {
      ...options,
      parse_mode: "MarkdownV2",
    });
  }
}

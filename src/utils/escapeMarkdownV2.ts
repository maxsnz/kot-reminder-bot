/**
 * Escapes special characters for Telegram MarkdownV2 format
 * Special characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param text Text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
  // Characters that need to be escaped in MarkdownV2
  const specialChars = /[_*\[\]()~`>#+\-=|{}.!]/g;
  return text.replace(specialChars, "\\$&");
}

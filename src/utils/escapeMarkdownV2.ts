/**
 * Escapes special characters for Telegram MarkdownV2 format
 * Special characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * According to Telegram Bot API documentation, these characters must be escaped:
 * - _ (underscore)
 * - * (asterisk)
 * - [ (opening square bracket)
 * - ] (closing square bracket)
 * - ( (opening parenthesis)
 * - ) (closing parenthesis)
 * - ~ (tilde)
 * - ` (backtick)
 * - > (greater than)
 * - # (hash)
 * - + (plus)
 * - - (minus/hyphen)
 * - = (equals)
 * - | (pipe)
 * - { (opening curly brace)
 * - } (closing curly brace)
 * - . (dot)
 * - ! (exclamation mark)
 *
 * @param text Text to escape
 * @returns Escaped text safe for MarkdownV2
 */
export function escapeMarkdownV2(text: string): string {
  // Characters that need to be escaped in MarkdownV2
  // Note: In character class, ] must be escaped or placed first/last
  // We escape it explicitly: \[ and \]
  // Also, - must be escaped or placed first/last to avoid being interpreted as range
  // We place it in the middle after other characters to avoid issues
  const specialChars = /[_*\[\]()~`>#+\-=|{}.!]/g;
  return text.replace(specialChars, "\\$&");
}

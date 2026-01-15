import type { InlineKeyboardMarkup } from "telegraf/types";

/**
 * Creates inline keyboard with snooze buttons for a schedule
 * @param scheduleId Schedule ID to use in callback data
 * @returns InlineKeyboardMarkup with snooze and dismiss buttons
 */
export function createSnoozeKeyboard(scheduleId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        // {
        //   text: "2 минуты",
        //   callback_data: `snooze:${scheduleId}:2`,
        // },
        {
          text: "30 минут",
          callback_data: `snooze:${scheduleId}:30`,
        },
        {
          text: "1 час",
          callback_data: `snooze:${scheduleId}:60`,
        },
        {
          text: "4 часа",
          callback_data: `snooze:${scheduleId}:240`,
        },
        {
          text: "✅",
          callback_data: `dismiss:${scheduleId}`,
        },
      ],
    ],
  };
}

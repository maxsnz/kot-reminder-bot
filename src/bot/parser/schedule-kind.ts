/**
 * Local copy of ScheduleKind enum for use inside the parser.
 * Avoids importing from prompt.ts (which pulls in openai/prisma at test time).
 * Values must stay in sync with the enum in src/bot/prompt.ts.
 */
export enum ScheduleKind {
  one_time = "one_time",
  recurring = "recurring",
}

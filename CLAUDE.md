# Project: Kot Reminder Bot

Telegram bot for scheduling reminders using natural language (AI). Users send text messages, AI parses the intent and creates/updates/cancels scheduled reminders.

## Tech Stack

- **Runtime**: Node.js + TypeScript (ESM, `tsx`)
- **Bot framework**: Telegraf
- **ORM**: Prisma with PostgreSQL
- **Job queue**: Graphile Worker (PostgreSQL-based)
- **AI**: OpenAI API with structured JSON output (Zod schemas)
- **Validation**: Zod
- **Logging**: Pino (+ Logtail in production)

## Request Flow

### Text message (main path)
```
User sends Telegram message
  → text-message.handler.ts         — saves ChatMessage
  → user-text-input.processor.ts    — tries parser first, falls back to AI
    ├─ Parser succeeds → shows confirmation keyboard (confirm / ai / cancel)
    │   → parser-confirm.handler.ts  — handles user's choice
    └─ Parser fails → enqueues "ai-request" job
        → ai-request.worker.ts      — calls OpenAI, gets structured JSON, enqueues "ai-result" job
        → ai-result.worker.ts       — passes result to AiResultProcessor
        → ai-result.processor.ts    — handles AI action, calls ScheduleActionProcessor
        → schedule-action.processor.ts — creates/updates/cancels schedules via ScheduleService
        → replies to user via MessageService
```

### Voice message
```
User sends voice message
  → voice-message.handler.ts        — enqueues "voice-transcription" job
  → voice-transcription.worker.ts   — transcribes via OpenAI Whisper
  → user-text-input.processor.ts    — same flow as text (parser → AI fallback)
```

Scheduled reminders fire via `schedule-reminder.worker.ts`. Snooze is handled by `schedule-snooze.worker.ts`.
Custom snooze input is detected via ForceReply + `messageType: snooze_prompt` in ChatMessage.

## Source Structure

```
src/
  index.ts                        — DI wiring + Graphile Worker startup
  config/
    env.ts                        — typed env vars (dotenv)
    constants.ts
  bot/
    index.ts                      — Telegraf setup, registers all handlers
    prompt.ts                     — SCHEDULE_PROMPT (system), getUserSchedulePrompt (user), Zod response schemas
    types.ts
    handlers/
      text-message.handler.ts     — main user message entry point
      voice-message.handler.ts    — voice message entry point, enqueues transcription
      snooze-callback.handler.ts  — inline keyboard snooze callbacks
      parser-confirm.handler.ts   — parser confirmation keyboard callbacks (confirm/ai/cancel)
      start.handler.ts
      list.handler.ts
      timezone.handler.ts
      admin.handler.ts
    processors/
      user-text-input.processor.ts — core message processing: parser → AI fallback, custom snooze detection
      ai-result.processor.ts      — routes AI action to appropriate handler
      schedule-action.processor.ts — executes schedule CRUD
      prompt-new.ts               — (WIP) new simplified context flow
    parser/
      SPEC.md                     — parser feature spec
      index.ts                    — exports tryParseMessage()
      tokenizer.ts                — tokenizes user text into typed tokens (month abbrevs, ordinal dates)
      parseSnoozeInput.ts         — parses custom snooze duration input (reuses tokenizer)
      fuzzy.ts                    — Levenshtein fuzzy matching
      time-utils.ts               — timezone-aware date helpers
      parser.test.ts              — parser unit tests
      masks/                      — parse masks (relative-time, today-time, tomorrow-time, day-of-week, calendar-date)
  services/
    database.service.ts           — PrismaClient wrapper
    user.service.ts
    schedule.service.ts           — schedule CRUD + Graphile job scheduling
    scheduleSnooze.service.ts
    chatMessage.service.ts        — conversation history
    focus.service.ts              — tracks current conversation context per user
    ai.service.ts                 — OpenAI calls + Whisper transcription
    aiRequest.service.ts          — AiRequest CRUD (tracks cost/tokens)
    graphileWorker.service.ts     — Graphile Worker wrapper
    message.service.ts            — Telegram message sending
    setting.service.ts            — key-value settings in DB
  workers/
    ai-request.worker.ts          — Graphile task: run AI request
    ai-result.worker.ts           — Graphile task: process AI result
    schedule-reminder.worker.ts   — Graphile task: fire reminder to user
    schedule-snooze.worker.ts     — Graphile task: fire snoozed reminder
    voice-transcription.worker.ts — Graphile task: transcribe voice via Whisper
  utils/
    getNextRunAt.ts               — calculates next run time for recurring schedules
    formatScheduleList.ts / formatScheduleDate.ts / formatScheduleConfirmation.ts / formatSnoozeList.ts
    createSnoozeKeyboard.ts       — Telegraf inline keyboard for snooze (fixed options + custom "...")
    getUsername.ts                — extract username from Telegram context
    getUserTime.ts                — formats user local time from UTC + timezone
    costCalculator.ts             — OpenAI token cost calculation
    logger.ts
    escapeMarkdownV2.ts
    generateTable.ts
  prisma/
    schema.prisma                 — source of truth for DB schema
    generated/                    — Prisma generated client (do not edit)
    migrations/
```

## Key Data Models

### User
`id`, `username`, `fullName`, `timezone` (IANA, e.g. `"Europe/Moscow"`), `chatId`, `focusId`

### Schedule
- `kind`: `one_time` | `recurring`
- One-time: `runAtDates: String[]` (YYYY-MM-DD), `runAtTimes: String[]` (HH:MM)
- Recurring: `frequency` (daily/weekly/monthly/yearly), `intervalStep`, `timesOfDay`, `daysOfWeek`, `daysOfMonth`, `monthsOfYear`, `startAtDate`, `endAtDate`
- `status`: `active` | `canceled` | `ended`
- `message` — text sent to user as reminder
- `summary`, `timeSummary`, `actionSummary`, `emoji` — human-readable descriptions

### Focus
Represents the current conversation context for a user. Links to a `Schedule` if the context is about a specific reminder. Each user has one active focus at a time.

### ChatMessage
Stores conversation history. `role`: `user` | `assistant` | `system`. Linked to `Focus` and optionally `Schedule`.
Optional `messageType` field (enum `MessageType`: `snooze_prompt`) — used to track ForceReply context for custom snooze input.

### AiRequest
Tracks every OpenAI call: prompt, response, tokens, cost, status (`queued`→`processing`→`succeeded`/`failed`).

### ScheduleSnooze
A snooze entry with `runAt` (DateTime). Fires reminder again at that time.

### Setting
Simple key-value store in DB.

## AI Response Actions

OpenAI returns structured JSON validated against Zod schemas (see `src/bot/prompt.ts`):

| Action | Description |
|---|---|
| `set_timezone` | Set user timezone (IANA string) |
| `ask` | Request clarification from user |
| `error` | Out-of-domain or ambiguous request |
| `create_schedule` | Create new schedule (one_time or recurring) |
| `update_schedule` | Patch existing schedule by `scheduleId` |
| `cancel_schedule` | Cancel schedule by `scheduleId` |
| `show_user_schedules` | Show user's active schedules |

All responses include `focus: "current" | "new"` — whether the user is continuing the same context or starting fresh.

## Dependency Injection Pattern

All services/processors are instantiated in `src/index.ts` and passed via constructors. No global singletons (except logger). Always inject dependencies explicitly.

## Development Commands

```bash
npm run dev       # tsx watch (hot reload)
npm run server    # production
npm test          # jest
npm run test:watch
npx prisma migrate dev   # create + apply migration
npx prisma generate      # regenerate client after schema change
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TELEGRAM_TOKEN` | Yes | Telegram bot token |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ADMIN_USERNAME` | Yes | Telegram username with admin access |
| `NODE_ENV` | No | `development` (default) or `production` |
| `LOGTAIL_TOKEN` | No | Logtail logging token |
| `LOGTAIL_SOURCE` | No | Logtail source identifier |

## TODO

- New simplified context flow (`src/bot/processors/prompt-new.ts` — WIP)
- Custom user instructions

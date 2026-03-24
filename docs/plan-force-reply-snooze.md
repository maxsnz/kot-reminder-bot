# Plan: Replace customSnoozeState with ForceReply + DB

## Problem

`customSnoozeState` — in-memory TTL-store, который хранит ожидание кастомного снуза.
Недостатки: теряется при рестарте, передаётся через цепочку конструкторов, не масштабируется.

## Proposed Solution

Использовать Telegram `ForceReply` + хранить снуз-промпт как `ChatMessage` в БД.
При ответе пользователя определяем контекст по `reply_to_message.message_id` через запрос в БД.

## New Flow

```
User нажимает "..." (snooze_custom)
  → SnoozeCallbackHandler
      - убирает кнопки с исходного сообщения
      - отправляет "Через сколько напомнить?" с { force_reply: true }
      - сохраняет это сообщение как ChatMessage (role=???, scheduleId=X, telegramMessageId=sentMsg.message_id)

User отвечает (reply) текстом или голосом
  → TextMessageHandler / VoiceMessageHandler
      - видит ctx.message.reply_to_message.message_id
      - передаёт replyToMessageId в UserTextInputProcessor

  → UserTextInputProcessor
      - если replyToMessageId: ищет ChatMessage по telegramMessageId
      - если нашёл и это снуз-промпт → parseSnoozeInput → createSnooze
      - иначе → обычный AI-флоу
```

## What Changes

### `src/bot/handlers/snooze-callback.handler.ts`
- Убрать `customSnoozeState`
- В `snooze_custom`: отправить ForceReply вместо обычного сообщения + `sendMessage(..., { reply_markup: { force_reply: true } })`
- Сохранить отправленное сообщение как `ChatMessage` с `scheduleId` и нужным типом (см. открытый вопрос)
- Убрать обработку `snooze_custom_cancel` (cancel теряет смысл — пользователь просто не отвечает)

### `src/bot/handlers/text-message.handler.ts`
- Передавать `replyToMessageId = ctx.message.reply_to_message?.message_id.toString()` в процессор

### `src/bot/handlers/voice-message.handler.ts`
- Передавать `replyToMessageId` в payload воркера (голос тоже может быть reply)

### `src/workers/voice-transcription.worker.ts`
- Добавить `replyToMessageId` в `VoiceTranscriptionJobData`
- Передавать в `userTextInputProcessor.process()`

### `src/bot/processors/user-text-input.processor.ts`
- Добавить `replyToMessageId?: string` в параметры `process()`
- Заменить `customSnoozeState.get()` на запрос в БД: найти `ChatMessage` по `telegramMessageId = replyToMessageId` + проверить что это снуз-промпт
- Убрать `customSnoozeState` из зависимостей

### `src/bot/index.ts`
- Убрать `CustomSnoozeStateStore`
- Убрать `customSnoozeState` из `UserTextInputProcessor` и `SnoozeCallbackHandler`

### `src/services/chatMessage.service.ts`
- Добавить метод `findByTelegramMessageId(telegramMessageId: string): Promise<ChatMessage | null>`

### DB Migration
- Возможно, нужно добавить индекс на `ChatMessage.telegramMessageId` для быстрого поиска
- Возможно, нужно изменение схемы для типа сообщения (см. открытый вопрос)

## What Is Removed
- `src/bot/state/customSnoozeState.ts` — файл полностью удаляется
- `customSnoozeState` из всех конструкторов и DI-цепочки

---

## ❓ Open Question: как отличить снуз-промпт от других ChatMessage?

При ответе пользователя нужно понять: является ли `reply_to_message` снуз-промптом,
а не обычным ответом бота.

`ChatMessage` уже имеет `scheduleId` и `role`, но `role=system` + `scheduleId != null`
не уникально — другие системные сообщения тоже могут иметь scheduleId.

### Варианты:

**A. Новый `MessageRole` enum-значение: `snooze_prompt`**
```prisma
enum MessageRole {
  user
  assistant
  system
  snooze_prompt  // <-- новое
}
```
- ✅ Явно, типобезопасно, запрос простой
- ❌ Миграция БД, расширение enum

**B. Новое поле `messageType` (отдельный enum или String)**
```prisma
model ChatMessage {
  ...
  messageType String?  // "snooze_prompt" | null
}
```
- ✅ Не трогает существующий `role`, расширяемо
- ❌ Миграция БД, `String` не типобезопасен без enum

**C. Использовать `aiAction Json?` как metadata**
```typescript
aiAction: { type: "snooze_prompt", scheduleId: "..." }
```
- ✅ Без миграции — поле уже есть
- ❌ Семантически неверно (`aiAction` для AI-ответов), неочевидно

**D. Отдельная таблица `SnoozePrompt`**
```prisma
model SnoozePrompt {
  id                String   @id @default(uuid())
  telegramMessageId String   @unique
  scheduleId        String
  chatId            Int
  createdAt         DateTime @default(now())
}
```
- ✅ Чистое разделение ответственности, не засоряет `ChatMessage`
- ❌ Миграция БД, отдельная таблица ради одного use-case

### Предварительный выбор
Вариант **A** (`snooze_prompt` как новый `MessageRole`) — наиболее явный и типобезопасный.
Вариант **D** — если хочется изолировать снуз-флоу полностью.

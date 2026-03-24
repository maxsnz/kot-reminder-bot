# Parser Feature Spec

Первичный парсинг сообщений пользователя без обращения к LLM.
В случае успешного матча — пользователю отправляется запрос на подтверждение.
В случае неудачи — обычный путь через AI.

## Мотивация

Многие запросы пользователей имеют простую и однозначную структуру:
- "через 30 минут пицца"
- "завтра в 10 позвонить маме"
- "в пятницу в 18:00 встреча"

Для таких случаев обращение к LLM избыточно. Парсер позволяет обработать их мгновенно и бесплатно.

---

## Флоу

```
Сообщение пришло в text-message.handler.ts
  │
  ├─ нет TEXT-токена (нет сути напоминания)
  │    → ответ: "Уточните запрос" (без LLM, без парсера)
  │
  ├─ tryParseMessage() → null (нет совпадения с масками)
  │    → обычный путь: ai-request worker → LLM
  │
  ├─ tryParseMessage() → result, но время в прошлом
  │    → обычный путь: LLM
  │
  └─ tryParseMessage() → result ✓
       → отправить сообщение-подтверждение с 3 кнопками
       → ждать callback

Пользователь нажал кнопку (parser-confirm.handler.ts):
  │
  ├─ ❌ Отмена
  │    → убрать кнопки, ничего не делать
  │
  ├─ 🤖 Отправить в AI
  │    → убрать кнопки
  │    → достать оригинальное сообщение по telegramMessageId
  │    → запустить обычный путь: ai-request worker → LLM
  │
  └─ ✅ Подтвердить
       → достать оригинальное сообщение из ChatMessage по telegramMessageId
       → re-parse (детерминированный, результат всегда тот же)
       → если время снова в прошлом (просроченное подтверждение)
       │    → отправить новое сообщение-подтверждение
       └─ иначе → сразу в ScheduleActionProcessor → создать расписание
```

---

## Структура файлов

```
src/bot/parser/
  SPEC.md                     — этот файл
  index.ts                    — экспорт tryParseMessage()
  tokenizer.ts                — разбивка текста на токены
  fuzzy.ts                    — fuzzy-матчинг ключевых слов (Левенштейн)
  masks/
    index.ts                  — реестр масок, функция findMask()
    relative-time.mask.ts     — "через X минут/часов"
    today-time.mask.ts        — "в HH:MM" (сегодня)
    tomorrow-time.mask.ts     — "завтра в HH:MM"
    day-of-week.mask.ts       — "в пятницу в HH:MM"
    [новые маски сюда]
  parser.test.ts              — все тесты парсера
```

### Интеграция в существующие файлы

| Файл | Изменение |
|---|---|
| `src/bot/handlers/text-message.handler.ts` | вызов `tryParseMessage()` перед постановкой в очередь LLM |
| `src/bot/handlers/parser-confirm.handler.ts` | новый файл, обработка callback ❌ / 🤖 / ✅ |
| `src/bot/index.ts` | регистрация `parser-confirm.handler` |

---

## Токенизатор

`tokenizer.ts` принимает строку, возвращает массив `Token[]`.

### Типы токенов

```typescript
type TokenType =
  | 'RELATIVE'    // "через X минут/часов/дней"
  | 'DATE'        // "сегодня" | "завтра" | "послезавтра" | день недели
  | 'TIME'        // "в HH:MM" | "в X утра/вечера" | "утром" | "вечером"
  | 'TEXT'        // всё остальное — суть напоминания

type Token =
  | { type: 'RELATIVE'; minutes: number }
  | { type: 'DATE'; date: 'today' | 'tomorrow' | 'day_after_tomorrow' | DayOfWeek }
  | { type: 'TIME'; hours: number; minutes: number }
  | { type: 'TEXT'; value: string }

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
```

### Порядок токенизации

1. Нормализация: lowercase, trim, схлопнуть множественные пробелы
2. Попытка извлечь RELATIVE-токен (регулярка)
3. Попытка извлечь DATE-токен (fuzzy по словарю)
4. Попытка извлечь TIME-токен (регулярка + fuzzy для слов "утром", "вечером")
5. Остаток текста → TEXT-токен (после удаления стоп-слов: "напомни", "напоминай", "поставь напоминание")

### Числительные времени

Токенизатор понимает как цифры, так и слова:
- `"в десять"` → TIME(10:00)
- `"в полдень"` → TIME(12:00)
- `"в полночь"` → TIME(00:00)

### Неоднозначность времени суток

- `"в 8"` без уточнения — неоднозначно (утро или вечер?). Фолбек в LLM.
- `"в 8 утра"` → TIME(08:00)
- `"в 8 вечера"` → TIME(20:00)
- `"в 8:00"` → TIME(08:00) — явный формат, принимаем
- `"в 14"` → TIME(14:00) — однозначно (>12, значит послеполудня)

---

## Fuzzy-матчинг

`fuzzy.ts` реализует поиск ближайшего слова из словаря с порогом Левенштейна.

```typescript
function findClosest(input: string, dictionary: string[], maxDistance: number): string | null
```

### Словари

**Даты:**
```
сегодня, завтра, послезавтра
понедельник, вторник, среда, четверг, пятница, суббота, воскресенье
в понедельник, во вторник, ...
```

**Время (слова):**
```
утром, утра, вечером, вечера, днём, дня, ночью, ночи
полдень, полночь
```

**Единицы времени (для RELATIVE):**
```
минута, минуту, минуты, минут, мин
час, часа, часов
день, дня, дней
```

### Порог расстояния

| Длина слова | maxDistance |
|---|---|
| ≤ 4 символа | 1 |
| 5–8 символов | 1 |
| > 8 символов | 2 |

---

## Маски

Маска — это объект, который проверяет набор токенов и строит `ResultCreateSchedule`.

```typescript
interface Mask {
  name: string
  // Возвращает true если токены соответствуют этой маске
  match(tokens: Token[]): boolean
  // Строит результат. Получает токены и timezone пользователя.
  // Возвращает null если данных недостаточно (фолбек в LLM).
  build(tokens: Token[], userTimezone: string): ResultCreateSchedule | null
}
```

### Реестр масок (`masks/index.ts`)

Маски перебираются в порядке от **более специфичных** к **менее специфичным**.
Первая подошедшая маска используется.

```
1. relative-time   — RELATIVE + TEXT
2. tomorrow-time   — DATE(tomorrow | day_after_tomorrow) + TIME + TEXT
3. day-of-week     — DATE(dayOfWeek) + TIME + TEXT
4. today-time      — DATE(today) + TIME + TEXT  (или просто TIME + TEXT)
```

### Описание масок

#### `relative-time.mask.ts`
**Примеры:** "через 30 минут пицца", "через 2 часа позвонить"

- Требует: RELATIVE + TEXT
- `build`: `runAtDate = now + minutes`, `runAtTime = HH:MM`

#### `tomorrow-time.mask.ts`
**Примеры:** "завтра в 10 позвонить маме", "послезавтра в 15:00 встреча"

- Требует: DATE(tomorrow | day_after_tomorrow) + TIME + TEXT
- `build`: date = tomorrow/day_after_tomorrow в timezone пользователя

#### `day-of-week.mask.ts`
**Примеры:** "в пятницу в 18 встреча с клиентом", "в понедельник в 9 утра зубной"

- Требует: DATE(dayOfWeek) + TIME + TEXT
- `build`: ближайший такой день недели в будущем (если сегодня пятница и просят пятницу → следующая пятница)

#### `today-time.mask.ts`
**Примеры:** "в 14:00 забрать посылку", "сегодня в 10 утра позвонить"

- Требует: TIME + TEXT (DATE(today) опционален)
- `build`: сегодня в указанное время. Если время в прошлом → возвращает `null` → LLM.

---

## Сообщение-подтверждение

```
Я правильно понял?
📅 Завтра в 10:00
📝 Позвонить маме

[❌ Отмена]  [🤖 Спросить AI]  [✅ Да, верно]
```

Callback data:
- `parser:cancel:{original_telegram_message_id}`
- `parser:ai:{original_telegram_message_id}`
- `parser:confirm:{original_telegram_message_id}`

`original_telegram_message_id` — `telegramMessageId` оригинального сообщения пользователя из `ChatMessage`.

---

## Тесты (`parser.test.ts`)

Тесты покрывают все маски и edge cases. Структура:

```typescript
describe('tokenizer', () => {
  // юнит-тесты токенизатора
})

describe('fuzzy', () => {
  // юнит-тесты fuzzy-матчинга
})

describe('masks', () => {
  describe('relative-time', () => { ... })
  describe('tomorrow-time', () => { ... })
  describe('today-time', () => { ... })
  describe('day-of-week', () => { ... })
})

describe('tryParseMessage', () => {
  // интеграционные тесты: строка → ResultCreateSchedule | null
})
```

### Обязательные тест-кейсы

**relative-time:**
- "через 30 минут пицца" ✓
- "через 2 часа позвонить маме" ✓
- "чрез 30 минут пицца" ✓ (опечатка, fuzzy)
- "через 30 минут" → null (нет TEXT)

**today-time:**
- "в 14:00 забрать посылку" ✓
- "сегодня в 10 утра позвонить" ✓
- "в 8" → null (неоднозначно)
- "в 14:00" → null (нет TEXT)

**tomorrow-time:**
- "завтра в 10 позвонить маме" ✓
- "послезавтра в 15:00 встреча" ✓
- "зафтра в 10 позвонить" ✓ (опечатка)

**day-of-week:**
- "в пятницу в 18:00 встреча" ✓
- "в понедельник в 9 утра зубной" ✓

**edge cases:**
- пустая строка → null
- только TEXT → null (нет времени)
- только TIME без TEXT → null

---

## Добавление новой маски

1. Создать файл `src/bot/parser/masks/my-mask.mask.ts` — реализовать интерфейс `Mask`
2. Добавить в реестр `masks/index.ts` в нужную позицию по специфичности
3. Добавить тест-кейсы в `parser.test.ts`

Больше ничего менять не нужно.

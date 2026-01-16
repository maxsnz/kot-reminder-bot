# Reminder Bot

Telegram bot for scheduling reminders using AI. Processes natural language messages to create and manage scheduled reminders.

## Bot Commands

### User Commands

- `/start` - Start using the bot and register as a user
- `/timezone` - View and update your timezone
- `/list` - Show list of active tasks/reminders

### Admin Commands

(Only available to admin user)

- `/users` - List all users
- `/requests` - List AI requests
- `/health` - System health check
- `/version` - Show bot version
- `/settings` - Manage settings
  - `/settings -set key:value` - Set a setting value
  - `/settings -get key` - Get a setting value
- `/removeallmytasks` - Remove all tasks for current user

### Additional Features

- Regular text messages are processed as requests to create reminders (via AI)
- Snooze callback buttons in reminder messages are handled automatically

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up database:

```bash
npx prisma migrate deploy
```

3. Configure environment variables (see below)

4. Run in development:

```bash
npm run dev
```

5. Run in production:

```bash
npm run server
```

Or using Docker:

```bash
docker-compose up -d
```

## Environment Variables

**Required:**

- `DATABASE_URL` - PostgreSQL connection string
- `TELEGRAM_TOKEN` - Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key
- `ADMIN_USERNAME` - username with access to admin functions

**Optional:**

- `NODE_ENV` - Environment (default: `development`)
- `LOGTAIL_TOKEN` - Logtail logging token
- `LOGTAIL_SOURCE` - Logtail source identifier

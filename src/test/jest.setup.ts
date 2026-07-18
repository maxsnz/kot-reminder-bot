// Provide dummy env vars so modules that import `env` (via logger, etc.)
// can be loaded in unit tests without a real environment.
process.env.DATABASE_URL ??= "postgresql://localhost:5432/test";
process.env.TELEGRAM_TOKEN ??= "test-token";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.ADMIN_USERNAME ??= "test-admin";

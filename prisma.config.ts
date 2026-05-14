import { defineConfig, env } from "prisma/config";

// bun загружает .env автоматически. Раньше тут был `import "dotenv/config";`
// — больше не нужен.

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },

  schema: "./src/prisma/schema.prisma",
});

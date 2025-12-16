import * as dotenv from "dotenv";

dotenv.config();

interface EnvironmentConfig {
  NODE_ENV: string;
  DATABASE_URL: string;
  TELEGRAM_TOKEN: string;
  OPENAI_API_KEY: string;
  LOGTAIL_TOKEN?: string;
  LOGTAIL_SOURCE?: string;
  ADMIN_USERNAME: string;
}

function validateEnv(): EnvironmentConfig {
  const requiredVars = [
    "DATABASE_URL",
    "TELEGRAM_TOKEN",
    "OPENAI_API_KEY",
    "ADMIN_USERNAME",
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }

  const config: EnvironmentConfig = {
    NODE_ENV: process.env.NODE_ENV || "development",
    DATABASE_URL: process.env.DATABASE_URL!,
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME!,
  };

  if (process.env.LOGTAIL_TOKEN) {
    config.LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN;
  }

  if (process.env.LOGTAIL_SOURCE) {
    config.LOGTAIL_SOURCE = process.env.LOGTAIL_SOURCE;
  }

  return config;
}

export const env = validateEnv();
export default env;

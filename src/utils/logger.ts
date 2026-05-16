import pino, { Logger } from "pino";
import env from "../config/env";
import packageJson from "../../package.json";

const isProd = env.NODE_ENV === "production";

// Prod: default JSON-to-stdout transport. Docker captures stdout into
// the container json-file log, Vector tails it and forwards to the
// per-app Better Stack source (see deploy/playbook.yml → vector_source).
// Dev: pino-pretty for readable colourised output.
export const logger: Logger = isProd
  ? pino({
      level: "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        app: packageJson.name,
        version: packageJson.version,
        env: env.NODE_ENV,
      },
    })
  : pino({
      level: "debug",
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        app: packageJson.name,
        version: packageJson.version,
        env: env.NODE_ENV,
      },
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    });

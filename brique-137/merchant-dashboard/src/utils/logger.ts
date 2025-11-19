// ============================================================================
// Winston Logger Configuration
// ============================================================================

import winston from "winston";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "merchant-dashboard" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

/**
 * Brique 113: Winston Logger Configuration
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'sira-inference',
    pod_id: process.env.POD_ID || process.env.HOSTNAME || 'local',
    version: process.env.SERVICE_VERSION || '1.0.0',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

// Suppress debug logs in production
if (process.env.NODE_ENV === 'production') {
  logger.transports.forEach((transport) => {
    if (transport instanceof winston.transports.Console) {
      transport.level = 'info';
    }
  });
}

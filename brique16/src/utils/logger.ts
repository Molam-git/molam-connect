import winston from 'winston';

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'molam-agents-api' },
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Export logger methods
export const log = {
    info: (message: string, meta?: any) => logger.info(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    debug: (message: string, meta?: any) => logger.debug(message, meta)
};
/**
 * Structured Logging System
 * JSON logging with trace correlation
 */

import winston from 'winston';
import { getTraceContext } from './otel';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = process.env.SERVICE_NAME || 'routing-service';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Custom format for structured JSON logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const log: any = {
      ts: info.timestamp,
      level: info.level,
      service: SERVICE_NAME,
      environment: ENVIRONMENT,
      msg: info.message,
    };

    // Add trace context if available
    if (info.trace_id) {
      log.trace_id = info.trace_id;
    }
    if (info.span_id) {
      log.span_id = info.span_id;
    }

    // Add request context
    if (info.idempotency_key) {
      log.idempotency_key = info.idempotency_key;
    }
    if (info.decision_id) {
      log.decision_id = info.decision_id;
    }
    if (info.payment_id) {
      log.payment_id = info.payment_id;
    }
    if (info.user_id) {
      log.user_id = info.user_id;
    }
    if (info.merchant_id) {
      log.merchant_id = info.merchant_id;
    }

    // Add additional fields
    if (info.route) {
      log.route = info.route;
    }
    if (info.duration_ms !== undefined) {
      log.duration_ms = info.duration_ms;
    }
    if (info.error) {
      log.error = info.error;
    }

    // Add custom metadata
    if (info.metadata) {
      Object.assign(log, info.metadata);
    }

    // Add stack trace for errors
    if (info.stack) {
      log.stack = info.stack;
    }

    return JSON.stringify(log);
  })
);

// Create logger
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: structuredFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format:
        ENVIRONMENT === 'development'
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
              winston.format.printf((info) => {
                const traceInfo = info.trace_id ? ` [trace:${info.trace_id.substring(0, 8)}]` : '';
                return `${info.timestamp} ${info.level}${traceInfo}: ${info.message}`;
              })
            )
          : structuredFormat,
    }),

    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
  // Don't exit on error
  exitOnError: false,
});

/**
 * Create child logger with default context
 */
export function createLogger(defaultContext: Record<string, any>) {
  return {
    debug: (message: string, context?: Record<string, any>) =>
      logger.debug(message, { ...defaultContext, ...context, ...getTraceContext({}) }),

    info: (message: string, context?: Record<string, any>) =>
      logger.info(message, { ...defaultContext, ...context, ...getTraceContext({}) }),

    warn: (message: string, context?: Record<string, any>) =>
      logger.warn(message, { ...defaultContext, ...context, ...getTraceContext({}) }),

    error: (message: string, error?: Error, context?: Record<string, any>) =>
      logger.error(message, {
        ...defaultContext,
        ...context,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
        ...getTraceContext({}),
      }),
  };
}

/**
 * Express middleware for request logging
 */
export function requestLoggingMiddleware() {
  return (req: any, res: any, next: Function) => {
    const start = Date.now();

    // Extract context
    const context: any = {
      method: req.method,
      path: req.path,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    };

    if (req.user) {
      context.user_id = req.user.id;
      context.merchant_id = req.user.merchant_id;
    }

    if (req.headers['idempotency-key']) {
      context.idempotency_key = req.headers['idempotency-key'];
    }

    // Log request
    logger.info('Incoming request', { ...context, ...getTraceContext(req) });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;

      const logContext = {
        ...context,
        status: res.statusCode,
        duration_ms: duration,
        ...getTraceContext(req),
      };

      if (res.statusCode >= 500) {
        logger.error('Request failed', undefined, logContext);
      } else if (res.statusCode >= 400) {
        logger.warn('Request error', logContext);
      } else {
        logger.info('Request completed', logContext);
      }
    });

    next();
  };
}

/**
 * Log routing decision
 */
export function logRoutingDecision(context: {
  decision_id: string;
  payment_id?: string;
  merchant_id: string;
  user_id: string;
  route: string;
  reason: string;
  amount: number;
  currency: string;
  country: string;
  duration_ms: number;
  sira_hint?: string;
  idempotency_key?: string;
}) {
  logger.info('Routing decision made', {
    ...context,
    ...getTraceContext({}),
  });
}

/**
 * Log SIRA call
 */
export function logSiraCall(context: {
  merchant_id: string;
  user_id: string;
  duration_ms: number;
  cached: boolean;
  hint?: string;
  error?: Error;
}) {
  if (context.error) {
    logger.warn('SIRA call failed', {
      ...context,
      error: {
        name: context.error.name,
        message: context.error.message,
      },
      ...getTraceContext({}),
    });
  } else {
    logger.debug('SIRA call completed', {
      ...context,
      ...getTraceContext({}),
    });
  }
}

/**
 * Log cache operation
 */
export function logCacheOperation(context: {
  operation: 'get' | 'set' | 'delete';
  type: 'sira_cache' | 'decision_cache';
  hit?: boolean;
  key: string;
  duration_ms?: number;
}) {
  logger.debug('Cache operation', {
    ...context,
    ...getTraceContext({}),
  });
}

/**
 * Log database operation
 */
export function logDbOperation(context: {
  operation: string;
  table?: string;
  duration_ms: number;
  rows_affected?: number;
  error?: Error;
}) {
  if (context.error) {
    logger.error('Database operation failed', context.error, {
      ...context,
      ...getTraceContext({}),
    });
  } else {
    logger.debug('Database operation completed', {
      ...context,
      ...getTraceContext({}),
    });
  }
}

/**
 * Log wallet check
 */
export function logWalletCheck(context: {
  user_id: string;
  currency: string;
  amount: number;
  available: boolean;
  reason?: string;
}) {
  logger.info('Wallet availability check', {
    ...context,
    ...getTraceContext({}),
  });
}

/**
 * Log fallback event
 */
export function logFallback(context: {
  decision_id: string;
  primary_route: string;
  fallback_route: string;
  reason: string;
}) {
  logger.warn('Fallback route used', {
    ...context,
    ...getTraceContext({}),
  });
}

/**
 * Log rule evaluation
 */
export function logRuleEvaluation(context: {
  rule_id?: string;
  rule_type: string;
  matched: boolean;
  priority?: number;
}) {
  logger.debug('Rule evaluation', {
    ...context,
    ...getTraceContext({}),
  });
}

export default {
  logger,
  createLogger,
  requestLoggingMiddleware,
  logRoutingDecision,
  logSiraCall,
  logCacheOperation,
  logDbOperation,
  logWalletCheck,
  logFallback,
  logRuleEvaluation,
};

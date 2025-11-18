/**
 * OpenTelemetry Distributed Tracing
 * End-to-end request tracing across services
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// Configuration
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'molam-routing-service';
const OTEL_EXPORTER_URL = process.env.OTEL_EXPORTER_URL || 'http://localhost:4318/v1/traces';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Create OTLP exporter
const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_URL,
  headers: {
    // Add authentication if required
    // 'Authorization': `Bearer ${process.env.OTEL_AUTH_TOKEN}`
  },
});

// Create resource with service metadata
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable filesystem instrumentation (high volume)
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingPaths: ['/health', '/healthz', '/readyz', '/metrics'],
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-redis-4': {
        enabled: true,
      },
    }),
  ],
});

// Global tracer instance
let tracer: any = null;

/**
 * Start OpenTelemetry tracing
 */
export async function startTracing(): Promise<void> {
  try {
    await sdk.start();
    tracer = trace.getTracer(SERVICE_NAME, '1.0.0');
    console.log('✓ OpenTelemetry tracing initialized');
    console.log(`  Service: ${SERVICE_NAME}`);
    console.log(`  Exporter: ${OTEL_EXPORTER_URL}`);
  } catch (error) {
    console.error('Failed to start OpenTelemetry:', error);
    throw error;
  }
}

/**
 * Shutdown OpenTelemetry gracefully
 */
export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('✓ OpenTelemetry tracing shutdown');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry:', error);
  }
}

/**
 * Get tracer instance
 */
export function getTracer() {
  if (!tracer) {
    tracer = trace.getTracer(SERVICE_NAME, '1.0.0');
  }
  return tracer;
}

/**
 * Create a new span
 */
export function createSpan(name: string, attributes?: Record<string, any>) {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    attributes: attributes || {},
  });
  return span;
}

/**
 * Wrap async function with tracing
 */
export async function traceAsync<T>(
  spanName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName, {
    attributes: attributes || {},
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap synchronous function with tracing
 */
export function traceSync<T>(
  spanName: string,
  fn: () => T,
  attributes?: Record<string, any>
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName, {
    attributes: attributes || {},
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add event to current span
 */
export function addEvent(name: string, attributes?: Record<string, any>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 */
export function setAttribute(key: string, value: any): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Record exception on current span
 */
export function recordException(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Express middleware to add trace context to request
 */
export function traceMiddleware() {
  return (req: any, res: any, next: Function) => {
    const tracer = getTracer();
    const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`);

    // Add request attributes
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.target': req.path,
      'http.host': req.get('host'),
      'http.scheme': req.protocol,
      'http.user_agent': req.get('user-agent'),
    });

    // Add custom attributes
    if (req.user) {
      span.setAttribute('user.id', req.user.id);
      span.setAttribute('user.role', req.user.role);
    }

    if (req.headers['idempotency-key']) {
      span.setAttribute('idempotency.key', req.headers['idempotency-key']);
    }

    // Store span on request for access in handlers
    req.span = span;

    // Add trace ID to response headers
    const spanContext = span.spanContext();
    if (spanContext) {
      res.setHeader('X-Trace-Id', spanContext.traceId);
      res.setHeader('X-Span-Id', spanContext.spanId);
    }

    // End span when response finishes
    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    });

    next();
  };
}

/**
 * Helper to extract trace context from request headers
 */
export function getTraceContext(req: any): { traceId?: string; spanId?: string } {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
}

export default {
  startTracing,
  shutdownTracing,
  getTracer,
  createSpan,
  traceAsync,
  traceSync,
  addEvent,
  setAttribute,
  recordException,
  traceMiddleware,
  getTraceContext,
};

/**
 * BRIQUE 145 — Prometheus Metrics
 */
import { Counter, Histogram, register } from "prom-client";

export const metrics = {
  eventsProcessed: new Counter({
    name: "analytics_events_processed_total",
    help: "Total number of events processed",
    labelNames: ["zone", "country"]
  }),

  kafkaMessagesReceived: new Counter({
    name: "analytics_kafka_messages_received_total",
    help: "Total Kafka messages received",
    labelNames: ["topic"]
  }),

  insertDuration: new Histogram({
    name: "analytics_clickhouse_insert_duration_seconds",
    help: "ClickHouse insert duration",
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
  }),

  errors: new Counter({
    name: "analytics_errors_total",
    help: "Total errors",
    labelNames: ["type"]
  })
};

export { register };
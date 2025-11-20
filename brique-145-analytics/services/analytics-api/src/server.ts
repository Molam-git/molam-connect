/**
 * BRIQUE 145 — Analytics API
 * High-performance read API for ClickHouse aggregates
 */
import express from "express";
import cors from "cors";
import { createClient } from "@clickhouse/client";
import NodeCache from "node-cache";
import dotenv from "dotenv";
import { verifyMolamJwt, requireRole } from "./auth";
import { register } from "prom-client";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || "http://clickhouse:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || ""
});

const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || "10")
});

app.use(cors());
app.use(express.json());

// Auth middleware
app.use(async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "missing_auth" });
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    req.user = await verifyMolamJwt(token);
    next();
  } catch (error: any) {
    return res.status(401).json({ error: "invalid_token", detail: error.message });
  }
});

// Health check
app.get("/healthz", (req, res) => {
  res.json({ ok: true, service: "analytics-api" });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

/**
 * GET /api/analytics/overview
 * Aggregated KPIs with filters
 */
app.get("/api/analytics/overview",
  requireRole(["pay_admin", "finance_ops", "merchant_admin"]),
  async (req: any, res) => {
    const { from, to, zone, country, city, currency } = req.query;

    const cacheKey = `overview:${from}:${to}:${zone}:${country}:${city}:${currency}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const where: string[] = [];
    const params: any = {};

    if (from) {
      where.push("bucket_ts >= {from:DateTime}");
      params.from = from;
    }
    if (to) {
      where.push("bucket_ts <= {to:DateTime}");
      params.to = to;
    }
    if (zone) {
      where.push("zone = {zone:String}");
      params.zone = zone;
    }
    if (country) {
      where.push("country = {country:String}");
      params.country = country;
    }
    if (city) {
      where.push("city = {city:String}");
      params.city = city;
    }
    if (currency) {
      where.push("currency = {currency:String}");
      params.currency = currency;
    }

    const query = `
      SELECT
        sumMerge(gmv) AS gmv,
        countMerge(tx_count) AS tx_count,
        sumMerge(fees_total) AS fees_total,
        sumMerge(refunds_amount) AS refunds_amount,
        countMerge(disputes_count) AS disputes_count
      FROM analytics_agg_minute
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
    `;

    try {
      const result = await clickhouse.query({
        query,
        query_params: params,
        format: "JSONEachRow"
      });

      const data = await result.json<any>();
      const row = data[0] || {
        gmv: 0,
        tx_count: 0,
        fees_total: 0,
        refunds_amount: 0,
        disputes_count: 0
      };

      cache.set(cacheKey, row);
      res.json(row);
    } catch (error: any) {
      console.error("Query error:", error);
      res.status(500).json({ error: "query_failed", detail: error.message });
    }
  }
);

/**
 * GET /api/analytics/by-country
 * Country-level breakdown
 */
app.get("/api/analytics/by-country",
  requireRole(["pay_admin", "finance_ops"]),
  async (req: any, res) => {
    const { from, to, zone } = req.query;

    const where: string[] = [];
    const params: any = {};

    if (from) {
      where.push("bucket_ts >= {from:DateTime}");
      params.from = from;
    }
    if (to) {
      where.push("bucket_ts <= {to:DateTime}");
      params.to = to;
    }
    if (zone) {
      where.push("zone = {zone:String}");
      params.zone = zone;
    }

    const query = `
      SELECT
        country,
        sumMerge(gmv) AS gmv,
        countMerge(tx_count) AS tx_count,
        sumMerge(fees_total) AS fees_total
      FROM analytics_agg_minute
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY country
      ORDER BY gmv DESC
      LIMIT 100
    `;

    try {
      const result = await clickhouse.query({
        query,
        query_params: params,
        format: "JSONEachRow"
      });

      const data = await result.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "query_failed", detail: error.message });
    }
  }
);

/**
 * GET /api/analytics/timeseries
 * Time-series data for charts
 */
app.get("/api/analytics/timeseries",
  requireRole(["pay_admin", "finance_ops", "merchant_admin"]),
  async (req: any, res) => {
    const { from, to, zone, country, granularity = "hour" } = req.query;

    const where: string[] = [];
    const params: any = {};

    if (from) {
      where.push("bucket_ts >= {from:DateTime}");
      params.from = from;
    }
    if (to) {
      where.push("bucket_ts <= {to:DateTime}");
      params.to = to;
    }
    if (zone) {
      where.push("zone = {zone:String}");
      params.zone = zone;
    }
    if (country) {
      where.push("country = {country:String}");
      params.country = country;
    }

    const table = granularity === "day" ? "analytics_agg_day" :
                  granularity === "hour" ? "analytics_agg_hour" :
                  "analytics_agg_minute";

    const query = `
      SELECT
        bucket_ts,
        ${table === "analytics_agg_day" ? "sum(gmv)" : "sumMerge(gmv)"} AS gmv,
        ${table === "analytics_agg_day" ? "sum(tx_count)" : "countMerge(tx_count)"} AS tx_count
      FROM ${table}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY bucket_ts
      ORDER BY bucket_ts ASC
    `;

    try {
      const result = await clickhouse.query({
        query,
        query_params: params,
        format: "JSONEachRow"
      });

      const data = await result.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "query_failed", detail: error.message });
    }
  }
);

app.listen(PORT, () => {
  console.log(`📊 Analytics API running on port ${PORT}`);
});
-- BRIQUE 145 — Real-time Analytics
-- ClickHouse schema for high-performance OLAP analytics
-- Supports millions of events/sec with low-latency aggregations

-- 1) Raw events table (insert-only, columnar compression)
CREATE TABLE IF NOT EXISTS analytics_events_raw
(
    event_time DateTime64(3) CODEC(DoubleDelta, LZ4),
    event_id String,
    tenant_id String,
    tenant_type LowCardinality(String),
    zone LowCardinality(String),
    region LowCardinality(String),
    country LowCardinality(String),
    city String,
    currency LowCardinality(String),
    amount Decimal(20,4),
    fee_molam Decimal(20,4),
    status LowCardinality(String),
    event_type LowCardinality(String),
    metadata String  -- JSON metadata
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (zone, country, toStartOfMinute(event_time), event_id)
TTL event_time + INTERVAL 90 DAY  -- Auto-delete after 90 days
SETTINGS index_granularity = 8192;

-- 2) Minute-level aggregates (using AggregatingMergeTree for incremental updates)
CREATE TABLE IF NOT EXISTS analytics_agg_minute
(
    bucket_ts DateTime,
    zone LowCardinality(String),
    region LowCardinality(String),
    country LowCardinality(String),
    city String,
    currency LowCardinality(String),
    gmv AggregateFunction(sum, Decimal(24,4)),
    tx_count AggregateFunction(count),
    fees_total AggregateFunction(sum, Decimal(24,4)),
    refunds_amount AggregateFunction(sum, Decimal(24,4)),
    disputes_count AggregateFunction(countIf, UInt8)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket_ts)
ORDER BY (zone, country, city, currency, bucket_ts)
TTL bucket_ts + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- 3) Materialized view: raw events → minute aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_events_to_minute
TO analytics_agg_minute
AS
SELECT
    toStartOfMinute(event_time) AS bucket_ts,
    zone,
    region,
    country,
    city,
    currency,
    sumState(amount) AS gmv,
    countState() AS tx_count,
    sumState(fee_molam) AS fees_total,
    sumState(if(event_type = 'refund', amount, 0)) AS refunds_amount,
    countIfState(event_type = 'dispute') AS disputes_count
FROM analytics_events_raw
WHERE status = 'succeeded'
GROUP BY bucket_ts, zone, region, country, city, currency;

-- 4) Hourly aggregates table
CREATE TABLE IF NOT EXISTS analytics_agg_hour
(
    bucket_ts DateTime,
    zone LowCardinality(String),
    region LowCardinality(String),
    country LowCardinality(String),
    city String,
    currency LowCardinality(String),
    gmv Decimal(24,4),
    tx_count UInt64,
    fees_total Decimal(24,4),
    refunds_amount Decimal(24,4),
    disputes_count UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket_ts)
ORDER BY (zone, country, city, currency, bucket_ts)
TTL bucket_ts + INTERVAL 365 DAY;

-- 5) Materialized view: minute → hour aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_minute_to_hour
TO analytics_agg_hour
AS
SELECT
    toStartOfHour(bucket_ts) AS bucket_ts,
    zone,
    region,
    country,
    city,
    currency,
    sumMerge(gmv) AS gmv,
    countMerge(tx_count) AS tx_count,
    sumMerge(fees_total) AS fees_total,
    sumMerge(refunds_amount) AS refunds_amount,
    countMerge(disputes_count) AS disputes_count
FROM analytics_agg_minute
GROUP BY bucket_ts, zone, region, country, city, currency;

-- 6) Daily aggregates table
CREATE TABLE IF NOT EXISTS analytics_agg_day
(
    day Date,
    zone LowCardinality(String),
    region LowCardinality(String),
    country LowCardinality(String),
    city String,
    currency LowCardinality(String),
    gmv Decimal(24,4),
    tx_count UInt64,
    fees_total Decimal(24,4),
    refunds_amount Decimal(24,4),
    disputes_count UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (zone, country, city, currency, day);

-- 7) Materialized view: hour → day aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hour_to_day
TO analytics_agg_day
AS
SELECT
    toDate(bucket_ts) AS day,
    zone,
    region,
    country,
    city,
    currency,
    sum(gmv) AS gmv,
    sum(tx_count) AS tx_count,
    sum(fees_total) AS fees_total,
    sum(refunds_amount) AS refunds_amount,
    sum(disputes_count) AS disputes_count
FROM analytics_agg_hour
GROUP BY day, zone, region, country, city, currency;

-- 8) Country-level summary (for map visualizations)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_country_summary
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket_ts)
ORDER BY (country, bucket_ts)
AS
SELECT
    toStartOfHour(event_time) AS bucket_ts,
    country,
    sum(amount) AS gmv,
    count() AS tx_count,
    sum(fee_molam) AS fees_total
FROM analytics_events_raw
WHERE status = 'succeeded'
GROUP BY bucket_ts, country;
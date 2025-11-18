-- =====================================================================
-- Redis Lua Script: Token Bucket Rate Limiting with Quotas
-- =====================================================================
-- Atomic rate limiting decision using token bucket algorithm + daily quotas
-- Runs in single Redis call for minimal latency (~1ms)
--
-- KEYS:
--   KEYS[1] = rl:tb:{key_id}           -- Token bucket hash
--   KEYS[2] = rl:quota:{key_id}:{date} -- Daily quota counter
--   KEYS[3] = rl:quota_monthly:{key_id}:{month} -- Monthly quota counter
--
-- ARGV:
--   ARGV[1] = now_ms                   -- Current timestamp in milliseconds
--   ARGV[2] = amount                   -- Tokens to consume (usually 1)
--   ARGV[3] = rate_per_second          -- Token refill rate per second
--   ARGV[4] = burst_capacity           -- Maximum burst capacity
--   ARGV[5] = daily_quota              -- Maximum requests per day
--   ARGV[6] = monthly_quota            -- Maximum requests per month
--   ARGV[7] = idempotency_key          -- Optional idempotency key (empty string if none)
--
-- RETURNS: Array
--   [1] allowed           -- 1 = allowed, 0 = denied
--   [2] tokens_remaining  -- Tokens remaining after operation
--   [3] retry_after       -- Seconds to wait before retry (0 if allowed)
--   [4] daily_count       -- Current daily usage count
--   [5] monthly_count     -- Current monthly usage count
--   [6] reason            -- Denial reason: '', 'rate_limit', 'daily_quota', 'monthly_quota'
-- =====================================================================

local key_tb = KEYS[1]
local key_quota_daily = KEYS[2]
local key_quota_monthly = KEYS[3]

local now_ms = tonumber(ARGV[1])
local amount = tonumber(ARGV[2])
local rate_per_sec = tonumber(ARGV[3])
local burst_capacity = tonumber(ARGV[4])
local daily_quota = tonumber(ARGV[5])
local monthly_quota = tonumber(ARGV[6])
local idempotency_key = ARGV[7]

-- =====================================================================
-- 1. Check Idempotency (if provided)
-- =====================================================================

if idempotency_key ~= '' then
  local idem_key = 'rl:idem:' .. idempotency_key
  local idem_exists = redis.call('EXISTS', idem_key)

  if idem_exists == 1 then
    -- Idempotent request already processed, return cached result
    local cached_result = redis.call('GET', idem_key)
    if cached_result then
      -- Return cached result (already allowed, don't double-count)
      local daily_count = tonumber(redis.call('GET', key_quota_daily)) or 0
      local monthly_count = tonumber(redis.call('GET', key_quota_monthly)) or 0
      return {1, 0, 0, daily_count, monthly_count, 'idempotent'}
    end
  end
end

-- =====================================================================
-- 2. Check Daily Quota
-- =====================================================================

local daily_count = tonumber(redis.call('GET', key_quota_daily)) or 0

if daily_count >= daily_quota then
  -- Daily quota exceeded
  return {0, 0, 3600, daily_count, 0, 'daily_quota'}
end

-- =====================================================================
-- 3. Check Monthly Quota
-- =====================================================================

local monthly_count = tonumber(redis.call('GET', key_quota_monthly)) or 0

if monthly_count >= monthly_quota then
  -- Monthly quota exceeded
  return {0, 0, 86400, daily_count, monthly_count, 'monthly_quota'}
end

-- =====================================================================
-- 4. Token Bucket Algorithm
-- =====================================================================

-- Get current token bucket state
local tb = redis.call('HMGET', key_tb, 'tokens', 'last_ts')
local tokens = tonumber(tb[1]) or burst_capacity
local last_ts = tonumber(tb[2]) or now_ms

-- Calculate token refill
local delta_ms = math.max(0, now_ms - last_ts)
local delta_sec = delta_ms / 1000.0
local refill = delta_sec * rate_per_sec

-- Add refilled tokens (capped at burst capacity)
tokens = math.min(burst_capacity, tokens + refill)

-- Update timestamp
last_ts = now_ms

-- Check if enough tokens available
local allowed = false
local retry_after = 0
local reason = ''

if tokens >= amount then
  -- Enough tokens, allow request
  tokens = tokens - amount
  allowed = true
else
  -- Not enough tokens, deny request
  allowed = false
  local tokens_needed = amount - tokens
  retry_after = math.ceil(tokens_needed / rate_per_sec)
  reason = 'rate_limit'
end

-- =====================================================================
-- 5. Persist Token Bucket State
-- =====================================================================

redis.call('HMSET', key_tb, 'tokens', tostring(tokens), 'last_ts', tostring(last_ts))
redis.call('EXPIRE', key_tb, 86400) -- Keep for 24 hours

-- =====================================================================
-- 6. Increment Quotas (only if allowed)
-- =====================================================================

if allowed then
  -- Increment daily quota
  daily_count = redis.call('INCRBY', key_quota_daily, amount)
  redis.call('EXPIRE', key_quota_daily, 86400 * 8) -- Keep for 8 days for analytics

  -- Increment monthly quota
  monthly_count = redis.call('INCRBY', key_quota_monthly, amount)
  redis.call('EXPIRE', key_quota_monthly, 86400 * 40) -- Keep for 40 days

  -- Store idempotency result (if provided)
  if idempotency_key ~= '' then
    local idem_key = 'rl:idem:' .. idempotency_key
    redis.call('SET', idem_key, '1', 'EX', 86400) -- Cache for 24 hours
  end
end

-- =====================================================================
-- 7. Return Result
-- =====================================================================

return {
  allowed and 1 or 0,     -- [1] allowed (1 or 0)
  math.floor(tokens),     -- [2] tokens_remaining
  retry_after,            -- [3] retry_after (seconds)
  daily_count,            -- [4] daily_count
  monthly_count,          -- [5] monthly_count
  reason                  -- [6] reason (empty if allowed)
}

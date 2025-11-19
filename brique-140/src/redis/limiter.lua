-- Redis sliding window + token bucket rate limiter
-- KEYS[1] = "ratelimit:{key_id}:tokens"
-- ARGV[1] = burst_limit
-- ARGV[2] = sustained_per_minute
-- ARGV[3] = now_ms
-- ARGV[4] = token_cost (usually 1)

local tokens_key = KEYS[1]
local burst = tonumber(ARGV[1])
local sustained = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local state = redis.call("HMGET", tokens_key, "tokens", "last_ts")
local tokens = tonumber(state[1]) or burst
local last_ts = tonumber(state[2]) or now

-- Refill logic (linear)
local elapsed = math.max(0, now - last_ts)
local refill_rate_per_ms = sustained / 60000  -- sustained per minute -> per ms
local to_add = elapsed * refill_rate_per_ms
tokens = math.min(burst, tokens + to_add)

if tokens < cost then
  -- Not enough tokens
  redis.call("HMSET", tokens_key, "tokens", tokens, "last_ts", now)
  redis.call("EXPIRE", tokens_key, 3600)
  return {0, tokens}
else
  -- Consume tokens
  tokens = tokens - cost
  redis.call("HMSET", tokens_key, "tokens", tokens, "last_ts", now)
  redis.call("EXPIRE", tokens_key, 3600)
  return {1, tokens}
end

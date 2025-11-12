// src/utils/rateLimiter.ts
import Redis from 'ioredis';
const r = new Redis(process.env.REDIS_URL);

export async function allowRequest(keyId:string, windowSeconds:number, maxTokens:number){
  // token bucket implemented with Lua script or INCR with TTL
  const redisKey = `rl:${keyId}:${Math.floor(Date.now()/1000/windowSeconds)}`;
  const current = await r.incr(redisKey);
  if(current===1) await r.expire(redisKey, windowSeconds);
  return current <= maxTokens;
}

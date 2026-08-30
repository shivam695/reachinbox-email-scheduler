import { redisConnection } from "../queues/connection";

interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  hourWindow: string;
}

// Builds a Redis key like: "email-rate:sender@example.com:2026-08-30-09"
// This means: "how many emails has this sender sent during THIS hour?"
function buildRateLimitKey(sender: string, date: Date): string {
  const hourWindow = date.toISOString().slice(0, 13); // e.g. "2026-08-30T09"
  return `email-rate:${sender}:${hourWindow}`;
}

// Tries to "reserve a slot" to send an email for this sender, right now.
// This is ATOMIC and SAFE even if many workers call it at the exact same time.
export async function tryReserveSendSlot(
  sender: string,
  hourlyLimit: number
): Promise<RateLimitResult> {
  const now = new Date();
  const key = buildRateLimitKey(sender, now);
  const hourWindow = key.split(":").pop() as string;

  // This Lua script runs as ONE atomic step inside Redis itself:
  // 1. Read the current count
  // 2. If it's already at/above the limit, refuse (return 0)
  // 3. Otherwise, increment it and make sure it expires after 1 hour
  const luaScript = `
    local current = tonumber(redis.call("GET", KEYS[1]) or "0")
    local limit = tonumber(ARGV[1])

    if current >= limit then
      return {0, current}
    end

    local newCount = redis.call("INCR", KEYS[1])
    if newCount == 1 then
      redis.call("EXPIRE", KEYS[1], 3600)
    end

    return {1, newCount}
  `;

  const result = (await redisConnection.eval(
    luaScript,
    1,
    key,
    hourlyLimit
  )) as [number, number];

  const [allowedFlag, currentCount] = result;

  return {
    allowed: allowedFlag === 1,
    currentCount,
    limit: hourlyLimit,
    hourWindow,
  };
}
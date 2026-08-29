import { Redis } from "ioredis";

// This is our shared connection to Redis.
// BullMQ requires this special setting: maxRetriesPerRequest must be null.
export const redisConnection = new Redis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});
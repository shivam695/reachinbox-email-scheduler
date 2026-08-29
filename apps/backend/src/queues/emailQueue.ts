import { Queue } from "bullmq";
import { redisConnection } from "./connection";

// This is our "to-do list" for emails.
// Anything added here will be picked up by our worker later.
export const emailQueue = new Queue("email-sending", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // if sending fails, retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 5000, // wait 5s, then 10s, then 20s between retries
    },
    removeOnComplete: 1000, // keep the last 1000 successful jobs (for the dashboard)
    removeOnFail: 5000, // keep the last 5000 failed jobs (for debugging)
  },
});
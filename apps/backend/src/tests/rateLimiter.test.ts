import { tryReserveSendSlot } from "../utils/rateLimiter";
import { redisConnection } from "../queues/connection";

describe("Rate limiter", () => {
  const testSender = "test-rate-limiter@example.com";

  beforeEach(async () => {
    // Clean up any leftover counters from previous test runs
    const keys = await redisConnection.keys(`email-rate:${testSender}:*`);
    if (keys.length > 0) await redisConnection.del(...keys);
  });

  afterAll(async () => {
    await redisConnection.quit();
  });

  it("allows sending when under the limit", async () => {
    const result = await tryReserveSendSlot(testSender, 5);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
  });

  it("blocks sending once the limit is reached", async () => {
    // Use up the limit of 2
    await tryReserveSendSlot(testSender, 2);
    await tryReserveSendSlot(testSender, 2);

    // The 3rd attempt should be blocked
    const result = await tryReserveSendSlot(testSender, 2);
    expect(result.allowed).toBe(false);
    expect(result.currentCount).toBe(2);
  });

  it("is safe under concurrent calls (no over-counting)", async () => {
    // Fire 10 simultaneous requests against a limit of 3
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tryReserveSendSlot(testSender, 3))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(3); // exactly 3 should succeed, never more
  });
});
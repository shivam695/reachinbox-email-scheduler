import { prisma } from "../db/prisma";

describe("Idempotency", () => {
  let testUserId: string;
  let testCampaignId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        googleId: `test-idempotency-${Date.now()}`,
        name: "Idempotency Test User",
        email: `idempotency-test-${Date.now()}@example.com`,
      },
    });
    testUserId = user.id;

    const campaign = await prisma.campaign.create({
      data: {
        userId: testUserId,
        subject: "Test",
        body: "Test",
        sender: "test@example.com",
        startAt: new Date(),
        delayMs: 1000,
        hourlyLimit: 100,
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.email.deleteMany({ where: { campaignId: testCampaignId } });
    await prisma.campaign.delete({ where: { id: testCampaignId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it("rejects a second email with the same idempotency key", async () => {
    const idempotencyKey = `${testCampaignId}:duplicate@example.com`;

    // First insert should succeed
    await prisma.email.create({
      data: {
        campaignId: testCampaignId,
        userId: testUserId,
        recipient: "duplicate@example.com",
        subject: "Test",
        body: "Test",
        sender: "test@example.com",
        scheduledAt: new Date(),
        idempotencyKey,
      },
    });

    // Second insert with the SAME idempotency key must fail
    await expect(
      prisma.email.create({
        data: {
          campaignId: testCampaignId,
          userId: testUserId,
          recipient: "duplicate@example.com",
          subject: "Test",
          body: "Test",
          sender: "test@example.com",
          scheduledAt: new Date(),
          idempotencyKey, // same key again
        },
      })
    ).rejects.toThrow();
  });

  it("marks an already-SENT email so it will not be sent again", async () => {
    const email = await prisma.email.create({
      data: {
        campaignId: testCampaignId,
        userId: testUserId,
        recipient: "already-sent@example.com",
        subject: "Test",
        body: "Test",
        sender: "test@example.com",
        scheduledAt: new Date(),
        idempotencyKey: `${testCampaignId}:already-sent@example.com`,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    // Simulate the worker's atomic claim attempt on an already-SENT email
    const claim = await prisma.email.updateMany({
      where: { id: email.id, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });

    // The claim must fail (count 0) since status is SENT, not SCHEDULED
    expect(claim.count).toBe(0);
  });
});
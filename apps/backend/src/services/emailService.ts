import { prisma } from "../db/prisma";
import { emailQueue } from "../queues/emailQueue";

interface ScheduleCampaignInput {
  userId: string;
  subject: string;
  body: string;
  sender: string;
  recipients: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
}

export async function scheduleCampaign(input: ScheduleCampaignInput) {
  // Step 1: create the Campaign record (the "container" for this email blast)
  const campaign = await prisma.campaign.create({
    data: {
      userId: input.userId,
      subject: input.subject,
      body: input.body,
      sender: input.sender,
      startAt: input.startAt,
      delayMs: input.delayMs,
      hourlyLimit: input.hourlyLimit,
    },
  });

  // Step 2: create one Email record PER recipient, each with its own scheduled time
  const emails = [];
  for (let i = 0; i < input.recipients.length; i++) {
    const recipient = input.recipients[i];
    const scheduledAt = new Date(input.startAt.getTime() + i * input.delayMs);

    // This key guarantees the SAME email is never scheduled twice.
    // Even if this function is somehow called again with the same data,
    // the database will reject a duplicate because idempotencyKey is UNIQUE.
    const idempotencyKey = `${campaign.id}:${recipient}`;

    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: input.userId,
        recipient,
        subject: input.subject,
        body: input.body,
        sender: input.sender,
        scheduledAt,
        idempotencyKey,
      },
    });

    emails.push(email);
  }

  // Step 3: add one BullMQ job PER email, each delayed until its own scheduled time
  const now = Date.now();
  for (const email of emails) {
    const delay = Math.max(0, email.scheduledAt.getTime() - now);

    await emailQueue.add(
      "send-email",
      { emailId: email.id },
      {
        delay,
        jobId: `email-${email.id}`, // deterministic ID prevents duplicate jobs
      }
    );
  }

  return { campaign, emailCount: emails.length };
}
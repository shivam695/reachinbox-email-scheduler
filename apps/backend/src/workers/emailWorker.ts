import { indexEmail } from "../integrations/elasticsearch/elasticsearchService";
import { sendSlackMessage } from "../integrations/slack/slackService";
import { redisConnection as redis } from "../queues/connection";
import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../queues/connection";
import { emailQueue } from "../queues/emailQueue";
import { prisma } from "../db/prisma";
import { sendEmail } from "../integrations/smtp/etherealProvider";
import { tryReserveSendSlot } from "../utils/rateLimiter";

interface EmailJobData {
  emailId: string;
}

const worker = new Worker<EmailJobData>(
  "email-sending",
  async (job) => {
    const { emailId } = job.data;

    const email = await prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      console.log(`Email ${emailId} not found — skipping.`);
      return;
    }

    if (email.status === "SENT") {
      console.log(`Email ${emailId} already sent — skipping (idempotency).`);
      return;
    }

    // RATE LIMIT CHECK — happens BEFORE we claim/process the email
    const hourlyLimit = Number(process.env.MAX_EMAILS_PER_HOUR) || 200;
    const rateLimitResult = await tryReserveSendSlot(email.sender, hourlyLimit);

    if (!rateLimitResult.allowed) {
      console.log(
        `🚫 Rate limit hit for ${email.sender} (${rateLimitResult.currentCount}/${rateLimitResult.limit} this hour). Rescheduling email ${emailId} for next hour.`
      );

      // Calculate when the next hour window starts
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0); // top of the next hour
      const delay = nextHour.getTime() - now.getTime();

      // Re-add this same email as a NEW delayed job for next hour.
      await emailQueue.add(
        "send-email",
        { emailId: email.id },
        {
          delay,
          jobId: `email-${email.id}-retry-${now.getTime()}`,
        }
      );

      // Keep the database's scheduledAt in sync with reality
      await prisma.email.update({
        where: { id: email.id },
        data: { scheduledAt: nextHour },
      });

      // SLACK NOTIFICATION — but only send ONE alert per sender per hour,
      // even if 100 jobs hit the limit at the same time.
      const notifyKey = `slack-rate-limit-notified:${email.sender}:${rateLimitResult.hourWindow}`;
      const isFirstToNotify = await redis.set(notifyKey, "1", "EX", 3600, "NX");

      if (isFirstToNotify) {
        await sendSlackMessage(
          email.userId,
          `🚨 *Email rate limit reached*\n\n*Sender:* ${email.sender}\n*Hourly limit:* ${rateLimitResult.limit}\n*Current window:* ${rateLimitResult.hourWindow}:00\nAdditional emails will be scheduled for the next available window.`
        );
      }

      return; // stop here — do NOT send yet
    }

    // Atomic claim — same idempotency protection as before
    const claim = await prisma.email.updateMany({
      where: { id: emailId, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });

    if (claim.count === 0) {
      console.log(`Email ${emailId} already being processed — skipping.`);
      return;
    }

    console.log(
      `Sending email ${emailId} to ${email.recipient}... (${rateLimitResult.currentCount}/${rateLimitResult.limit} this hour)`
    );
    const result = await sendEmail({
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

        if (result.success) {
      const updatedEmail = await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.messageId,
        },
      });

      await indexEmail({
        id: updatedEmail.id,
        userId: updatedEmail.userId,
        campaignId: updatedEmail.campaignId,
        recipient: updatedEmail.recipient,
        subject: updatedEmail.subject,
        body: updatedEmail.body,
        sender: updatedEmail.sender,
        status: updatedEmail.status,
        scheduledAt: updatedEmail.scheduledAt,
        sentAt: updatedEmail.sentAt,
      });

      console.log(`✅ Email ${emailId} sent! Preview: ${result.previewUrl}`);
    } else {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "FAILED",
          errorMessage: result.error,
        },
      });
      console.log(`❌ Email ${emailId} failed: ${result.error}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
  }
);

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} threw an error:`, err.message);
});

console.log("Email worker is running and listening for jobs...");
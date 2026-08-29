import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../queues/connection";
import { prisma } from "../db/prisma";
import { sendEmail } from "../integrations/smtp/etherealProvider";

interface EmailJobData {
  emailId: string;
}

const worker = new Worker<EmailJobData>(
  "email-sending",
  async (job) => {
    const { emailId } = job.data;

    // Step 1: look up the real email record from the database
    const email = await prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      console.log(`Email ${emailId} not found — skipping.`);
      return;
    }

    // Step 2: IDEMPOTENCY CHECK — if it's already sent, do nothing.
    // This protects us even if the same job somehow runs twice.
    if (email.status === "SENT") {
      console.log(`Email ${emailId} already sent — skipping (idempotency).`);
      return;
    }

    // Step 3: atomically claim this email so no other worker can process it
    // at the same time. This only succeeds if the status is still SCHEDULED.
    const claim = await prisma.email.updateMany({
      where: { id: emailId, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });

    if (claim.count === 0) {
      console.log(`Email ${emailId} already being processed — skipping.`);
      return;
    }

    // Step 4: actually send it
    console.log(`Sending email ${emailId} to ${email.recipient}...`);
    const result = await sendEmail({
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

    // Step 5: record the outcome
    if (result.success) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.messageId,
        },
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
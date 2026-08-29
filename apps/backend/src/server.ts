import "dotenv/config";
import express from "express";
import { prisma } from "./db/prisma";
import { scheduleCampaign } from "./services/emailService";

const app = express();
const PORT = 4000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "ReachInbox backend is alive!" });
});

app.post("/test/create-user", async (req, res) => {
  const user = await prisma.user.create({
    data: {
      googleId: "test-google-id-" + Date.now(),
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
    },
  });
  res.json({ success: true, user });
});

app.get("/test/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json({ count: users.length, users });
});

// Real endpoint: schedule a campaign
app.post("/api/emails/schedule", async (req, res) => {
  try {
    const { userId, subject, body, sender, recipients, startAt, delayMs, hourlyLimit } = req.body;

    const result = await scheduleCampaign({
      userId,
      subject,
      body,
      sender,
      recipients,
      startAt: new Date(startAt),
      delayMs,
      hourlyLimit,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
// Real endpoint: list scheduled emails
app.get("/api/emails/scheduled", async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { status: { in: ["SCHEDULED", "PROCESSING"] } },
    orderBy: { scheduledAt: "asc" },
  });
  res.json({ count: emails.length, emails });
});

// Real endpoint: list sent emails
app.get("/api/emails/sent", async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { status: { in: ["SENT", "FAILED"] } },
    orderBy: { sentAt: "desc" },
  });
  res.json({ count: emails.length, emails });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
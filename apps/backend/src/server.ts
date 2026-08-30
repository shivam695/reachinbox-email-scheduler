import "dotenv/config";
import express from "express";
import { prisma } from "./db/prisma";
import { scheduleCampaign } from "./services/emailService";
import {
  buildSlackAuthorizeUrl,
  exchangeSlackCode,
  saveSlackConnection,
} from "./integrations/slack/slackService";

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

app.get("/api/emails/scheduled", async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { status: { in: ["SCHEDULED", "PROCESSING"] } },
    orderBy: { scheduledAt: "asc" },
  });
  res.json({ count: emails.length, emails });
});

app.get("/api/emails/sent", async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { status: { in: ["SENT", "FAILED"] } },
    orderBy: { sentAt: "desc" },
  });
  res.json({ count: emails.length, emails });
});

// SLACK: Step 1 — redirect user to Slack's approval page
// We pass the userId as "state" so we know who is connecting once Slack sends them back
app.get("/api/slack/connect", (req, res) => {
  const userId = req.query.userId as string;
  const url = `${buildSlackAuthorizeUrl()}&state=${encodeURIComponent(userId)}`;
  res.redirect(url);
});

// SLACK: Step 2 — Slack redirects back here after the user approves
app.get("/api/slack/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string; // we passed this in Step 1

    const slackData = await exchangeSlackCode(code);
    await saveSlackConnection(userId, slackData);

    res.send(
      `<h2>✅ Slack connected to team "${slackData.teamName}"! You can close this tab.</h2>`
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Slack connection failed.");
  }
});

// SLACK: check connection status
app.get("/api/slack/status", async (req, res) => {
  const userId = req.query.userId as string;
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  res.json({ connected: !!connection, teamName: connection?.teamName ?? null });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
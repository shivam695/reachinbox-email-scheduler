import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  findOrCreateUser,
} from "./integrations/google/googleService";
import session from "express-session";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "./queues/emailQueue";
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
// Set up the BullMQ live dashboard at /admin/queues
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

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

// GOOGLE: Step 1 — redirect user to Google's login page
app.get("/api/auth/google", (req, res) => {
  res.redirect(buildGoogleAuthUrl());
});

// GOOGLE: Step 2 — Google redirects back here after login
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateUser(profile);

    // Save this user's id into the session — this is what "logs them in"
    (req.session as any).userId = user.id;

    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Google login failed.");
  }
});

// Check who is currently logged in
app.get("/api/auth/me", async (req, res) => {
  const userId = (req.session as any).userId;

  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  res.json(user);
});

// Log out
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


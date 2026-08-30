import { prisma } from "../../db/prisma";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI!;

// Builds the URL we send the user to, so they can approve access on Slack's website
export function buildSlackAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: "incoming-webhook",
    redirect_uri: SLACK_REDIRECT_URI,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

// Exchanges the temporary "code" Slack gives us for a real, permanent webhook URL
export async function exchangeSlackCode(code: string) {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: SLACK_REDIRECT_URI,
    }),
  });

  const data = (await response.json()) as any;

  if (!data.ok) {
    throw new Error(`Slack OAuth failed: ${data.error}`);
  }

  return {
    accessToken: data.access_token as string,
    teamId: data.team.id as string,
    teamName: data.team.name as string,
    incomingWebhookUrl: data.incoming_webhook.url as string,
    channelId: data.incoming_webhook.channel_id as string,
  };
}

// Saves (or updates) this user's Slack connection in the database
export async function saveSlackConnection(userId: string, slackData: {
  accessToken: string;
  teamId: string;
  teamName: string;
  incomingWebhookUrl: string;
  channelId: string;
}) {
  return prisma.slackConnection.upsert({
    where: { userId },
    create: { userId, ...slackData },
    update: { ...slackData },
  });
}

// Sends an actual message to the user's connected Slack channel.
// If the user hasn't connected Slack, this safely does nothing (no crash).
export async function sendSlackMessage(userId: string, text: string): Promise<void> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });

  if (!connection) {
    console.log(`No Slack connection for user ${userId} — skipping notification.`);
    return;
  }

  const webhookUrl = connection.incomingWebhookUrl;

  try {
    await fetch(webhookUrl as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.log("Failed to send Slack message:", error);
    // We deliberately do NOT throw — a failed Slack notification should never crash email sending
  }
}
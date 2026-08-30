import { google } from "googleapis";
import { prisma } from "../../db/prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

// Builds the URL we send the user to, so they can log in with Google
export function buildGoogleAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
  });
}

// Exchanges the temporary "code" Google gives us for the user's actual profile info
export async function exchangeGoogleCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
  const { data: profile } = await oauth2.userinfo.get();

  return {
    googleId: profile.id as string,
    name: profile.name as string,
    email: profile.email as string,
    avatarUrl: profile.picture as string | undefined,
  };
}

// Creates or updates the user in our database based on their Google profile
export async function findOrCreateUser(profile: {
  googleId: string;
  name: string;
  email: string;
  avatarUrl?: string;
}) {
  return prisma.user.upsert({
    where: { googleId: profile.googleId },
    create: profile,
    update: {
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    },
  });
}
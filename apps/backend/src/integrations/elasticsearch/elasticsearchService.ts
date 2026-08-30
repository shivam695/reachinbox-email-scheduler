import { Client } from "@elastic/elasticsearch";

const client = new Client({ node: "http://localhost:9200" });

const INDEX_NAME = "emails";

// Creates the "emails" index in Elasticsearch if it doesn't already exist.
// Call this once when the server starts up.
export async function ensureEmailIndex() {
  try {
    const exists = await client.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await client.indices.create({ index: INDEX_NAME });
      console.log("Created Elasticsearch index: emails");
    }
  } catch (error) {
    console.log("Elasticsearch not available — search will be disabled:", error);
  }
}

interface EmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
}

// Adds or updates one email document in Elasticsearch.
// If Elasticsearch is down, this fails SILENTLY — it must never break email sending.
export async function indexEmail(email: EmailDocument): Promise<void> {
  try {
    await client.index({
      index: INDEX_NAME,
      id: email.id,
      document: email,
    });
  } catch (error) {
    console.log(`Failed to index email ${email.id} in Elasticsearch:`, error);
  }
}

// Searches emails by text, scoped to one user only.
export async function searchEmails(userId: string, query: string) {
  try {
    const result = await client.search({
      index: INDEX_NAME,
      query: {
        bool: {
          must: [
            { term: { userId } }, // NEVER let a user search another user's emails
            {
              multi_match: {
                query,
                fields: ["subject", "body", "recipient", "sender"],
              },
            },
          ],
        },
      },
    });

    return result.hits.hits.map((hit) => hit._source);
  } catch (error) {
    console.log("Elasticsearch search failed:", error);
    return [];
  }
}
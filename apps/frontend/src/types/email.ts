export interface Email {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED";
  scheduledAt: string;
  sentAt: string | null;
  errorMessage: string | null;
}
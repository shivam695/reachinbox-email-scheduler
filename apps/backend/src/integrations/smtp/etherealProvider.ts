import nodemailer from "nodemailer";

// Create one reusable "mail sender" using our Ethereal test credentials
const transporter = nodemailer.createTransport({
  host: process.env.ETHEREAL_HOST,
  port: Number(process.env.ETHEREAL_PORT),
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASSWORD,
  },
});

interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

// This is the ONE function the rest of our app will call to send an email.
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const info = await transporter.sendMail({
      from: '"ReachInbox Test" <no-reply@reachinbox.test>',
      to: input.to,
      subject: input.subject,
      text: input.body,
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
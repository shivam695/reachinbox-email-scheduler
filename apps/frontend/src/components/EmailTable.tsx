import type { Email } from "../types/email";

interface EmailTableProps {
  emails: Email[];
  loading: boolean;
  mode: "scheduled" | "sent";
}

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-500/20 text-blue-300",
  PROCESSING: "bg-yellow-500/20 text-yellow-300",
  SENT: "bg-green-500/20 text-green-300",
  FAILED: "bg-red-500/20 text-red-300",
  CANCELLED: "bg-slate-500/20 text-slate-300",
};

export default function EmailTable({ emails, loading, mode }: EmailTableProps) {
  if (loading) {
    return (
      <div className="text-slate-400 text-center py-12">Loading emails...</div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-300 font-medium">
          No {mode} emails yet.
        </p>
        <p className="text-slate-500 text-sm mt-1">
          Create your first email campaign to get started.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-700">
          <th className="py-3 pr-4">Email</th>
          <th className="py-3 pr-4">Subject</th>
          <th className="py-3 pr-4">
            {mode === "scheduled" ? "Scheduled Time" : "Sent Time"}
          </th>
          <th className="py-3 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {emails.map((email) => (
          <tr key={email.id} className="border-b border-slate-800">
            <td className="py-3 pr-4 text-white">{email.recipient}</td>
            <td className="py-3 pr-4 text-slate-300">{email.subject}</td>
            <td className="py-3 pr-4 text-slate-400">
              {mode === "scheduled"
                ? new Date(email.scheduledAt).toLocaleString()
                : email.sentAt
                ? new Date(email.sentAt).toLocaleString()
                : "—"}
            </td>
            <td className="py-3 pr-4">
              <span
                className={`px-2 py-1 rounded-md text-xs font-medium ${statusColors[email.status]}`}
              >
                {email.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
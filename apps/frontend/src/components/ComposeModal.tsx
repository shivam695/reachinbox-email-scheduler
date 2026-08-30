import { useState } from "react";
import { api } from "../services/api";

interface ComposeModalProps {
  onClose: () => void;
  onScheduled: () => void;
}

export default function ComposeModal({ onClose, onScheduled }: ComposeModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("sender@reachinbox.test");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [startAt, setStartAt] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // Split by comma, newline, or semicolon — handles CSV or plain text lists
      const candidates = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
      const valid = candidates.filter((c) => EMAIL_REGEX.test(c));
      const invalid = candidates.length - valid.length;

      setRecipients(valid);
      setInvalidCount(invalid);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    setError("");

    if (!subject || !body || recipients.length === 0 || !startAt) {
      setError("Please fill in subject, body, upload recipients, and set a start time.");
      return;
    }
    if (delaySeconds <= 0 || hourlyLimit <= 0) {
      setError("Delay and hourly limit must be greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/emails/schedule", {
        userId: (await api.get("/api/auth/me")).data.id,
        subject,
        body,
        sender,
        recipients,
        startAt: new Date(startAt).toISOString(),
        delayMs: delaySeconds * 1000,
        hourlyLimit,
      });
      onScheduled();
      onClose();
    } catch (err) {
      setError("Failed to schedule campaign. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Compose New Email</h2>

        {error && (
          <div className="bg-red-500/20 text-red-300 text-sm px-3 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none"
              placeholder="Email subject"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none h-24"
              placeholder="Email body"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">Sender</label>
            <input
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">
              Recipients (CSV or .txt file)
            </label>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="w-full text-slate-300 text-sm"
            />
            {recipients.length > 0 && (
              <p className="text-green-400 text-xs mt-1">
                {recipients.length} valid email addresses detected
                {invalidCount > 0 && `, ${invalidCount} invalid addresses ignored`}
              </p>
            )}
          </div>

          <div>
            <label className="text-slate-300 text-sm mb-1 block">Start time</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-300 text-sm mb-1 block">
                Delay between emails (seconds)
              </label>
              <input
                type="number"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">
                Hourly limit
              </label>
              <input
                type="number"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm"
          >
            {submitting ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import EmailTable from "../components/EmailTable";
import ComposeModal from "../components/ComposeModal";
import type { Email } from "../types/email";

export default function Dashboard() {
  const { user, loading: authLoading, refetch } = useAuth();
  const [tab, setTab] = useState<"scheduled" | "sent">("scheduled");
  const [emails, setEmails] = useState<Email[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Email[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchEmails = () => {
    setLoadingEmails(true);
    const endpoint = tab === "scheduled" ? "/api/emails/scheduled" : "/api/emails/sent";
    api
      .get(endpoint)
      .then((res) => setEmails(res.data.emails))
      .catch(() => setEmails([]))
      .finally(() => setLoadingEmails(false));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get("/api/emails/search", {
        params: { userId: user!.id, q: searchQuery },
      });
      setSearchResults(res.data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [tab]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSearch();
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleLogout = async () => {
    await api.post("/api/auth/logout");
    refetch();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        Not logged in.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">ReachInbox</h1>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
          )}
          <div className="text-right">
            <p className="text-white text-sm font-medium">{user.name}</p>
            <p className="text-slate-400 text-xs">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-4 text-slate-400 hover:text-white text-sm border border-slate-600 px-3 py-1.5 rounded-lg"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="p-6 max-w-5xl mx-auto">
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails..."
            className="w-full bg-slate-800 text-white rounded-lg px-4 py-2 outline-none border border-slate-700 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("scheduled")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === "scheduled"
                  ? "bg-white text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Scheduled Emails
            </button>
            <button
              onClick={() => setTab("sent")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === "sent"
                  ? "bg-white text-slate-900"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sent Emails
            </button>
          </div>

          <button
            onClick={() => setShowCompose(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg text-sm"
          >
            + Compose New Email
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl p-4">
          {searchQuery.trim() ? (
            searching ? (
              <div className="text-slate-400 text-center py-12">Searching...</div>
            ) : (
              <EmailTable emails={searchResults || []} loading={false} mode={tab} />
            )
          ) : (
            <EmailTable emails={emails} loading={loadingEmails} mode={tab} />
          )}
        </div>

        {showCompose && (
          <ComposeModal
            onClose={() => setShowCompose(false)}
            onScheduled={fetchEmails}
          />
        )}
      </main>
    </div>
  );
}
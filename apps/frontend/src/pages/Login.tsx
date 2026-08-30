export default function Login() {
  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:4000/api/auth/google";
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 p-10 rounded-2xl shadow-xl text-center">
        <h1 className="text-3xl font-bold text-white mb-2">ReachInbox</h1>
        <p className="text-slate-400 mb-8">Email scheduling, made simple.</p>
        <button
          onClick={handleGoogleLogin}
          className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-lg hover:bg-slate-100 transition"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
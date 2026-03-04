import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in — redirect to home
  if (auth.user && !auth.isLoading) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await auth.login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-mono text-2xl font-medium tracking-tight text-amber-450">
            JobScout
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            portland job matcher
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-875 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-medium text-slate-200 mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-400 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-925 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-400 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-925 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                placeholder="Password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-medium text-slate-925 transition-colors hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

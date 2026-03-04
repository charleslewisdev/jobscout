import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchPipelineStatus, fetchStats, triggerPipeline } from "../api";
import { MatchCard } from "../components/MatchCard";
import { useAuth } from "../context/AuthContext";

export function Dashboard() {
  const { isAdmin } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
  });

  const { data: pipeline } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: (query) =>
      query.state.data?.isRunning ? 2000 : 30000,
  });

  const queryClient = useQueryClient();
  const runPipeline = useMutation({
    mutationFn: () => triggerPipeline(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        loading...
      </div>
    );
  }

  const statusCounts = stats?.matchesByStatus ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Portland job matching overview
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => runPipeline.mutate()}
            disabled={pipeline?.isRunning || runPipeline.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pipeline?.isRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Running...
              </span>
            ) : (
              "Run Pipeline"
            )}
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Candidates" value={stats?.candidateCount ?? 0} />
        <StatCard label="Job Postings" value={stats?.jobCount ?? 0} />
        <StatCard label="Total Matches" value={stats?.matchCount ?? 0} />
        <StatCard
          label="Bookmarked"
          value={statusCounts.bookmarked ?? 0}
          accent
        />
      </div>

      {/* Status breakdown */}
      {Object.keys(statusCounts).length > 0 && (
        <div className="border border-slate-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
            Matches by Status
          </h2>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Link
                key={status}
                to={`/matches?status=${status}`}
                className="flex items-center gap-2 text-sm text-slate-300 hover:text-amber-300 transition-colors"
              >
                <span className="font-mono text-slate-400">{count}</span>
                <span className="text-slate-500">{status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline status */}
      <div className="border border-slate-800 rounded-lg p-4">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
          Pipeline
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 text-sm">
          <div>
            <span className="text-slate-500 text-xs">Status</span>
            <p className="font-mono text-slate-300 mt-0.5">
              {pipeline?.isRunning ? (
                <span className="text-amber-400">running</span>
              ) : (
                "idle"
              )}
            </p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">Last Run</span>
            <p className="font-mono text-slate-300 mt-0.5">
              {pipeline?.completedAt
                ? formatRelativeTime(pipeline.completedAt)
                : "never"}
            </p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">Next Scheduled</span>
            <p className="font-mono text-slate-300 mt-0.5">
              {pipeline?.nextRun
                ? formatRelativeTime(pipeline.nextRun)
                : "—"}
            </p>
          </div>
        </div>
        {pipeline?.lastResult && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400 font-mono">
            <span>fetched: {pipeline.lastResult.totalFetched}</span>
            <span>new: {pipeline.lastResult.totalNew}</span>
            <span>matched: {pipeline.lastResult.totalMatched}</span>
            <span>
              {(pipeline.lastResult.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      {/* Top matches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
            Top Matches
          </h2>
          <div className="space-y-2">
            {stats?.topMatches?.length ? (
              stats.topMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))
            ) : (
              <p className="text-sm text-slate-600">No matches yet</p>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
            Recent Matches
          </h2>
          <div className="space-y-2">
            {stats?.recentMatches?.length ? (
              stats.recentMatches.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))
            ) : (
              <p className="text-sm text-slate-600">No matches yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="border border-slate-800 rounded-lg p-4">
      <p className="text-xs text-slate-500 font-mono">{label}</p>
      <p
        className={`text-2xl font-mono font-bold mt-1 ${accent ? "text-amber-400" : "text-slate-100"}`}
      >
        {value}
      </p>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const absDiff = Math.abs(diff);
  const future = diff < 0;

  if (absDiff < 60_000) return future ? "in <1m" : "<1m ago";
  if (absDiff < 3600_000) {
    const m = Math.floor(absDiff / 60_000);
    return future ? `in ${m}m` : `${m}m ago`;
  }
  if (absDiff < 86400_000) {
    const h = Math.floor(absDiff / 3600_000);
    return future ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.floor(absDiff / 86400_000);
  return future ? `in ${d}d` : `${d}d ago`;
}

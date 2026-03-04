import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSources, toggleSourceEnabled } from "../api";
import type { SourceItem } from "../api";
import { useAuth } from "../context/AuthContext";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function SourceCard({ source, isAdmin }: { source: SourceItem; isAdmin: boolean }) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      toggleSourceEnabled(source.id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  return (
    <div className="border border-slate-800 rounded-lg p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-medium text-slate-200 truncate">
            {source.name}
          </h3>
          <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-slate-800 rounded">
            {source.type}
          </span>
        </div>

        {isAdmin ? (
          <button
            onClick={() => toggleMutation.mutate(!source.isEnabled)}
            disabled={toggleMutation.isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              source.isEnabled ? "bg-amber-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                source.isEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        ) : (
          <span
            className={`px-2 py-0.5 text-[10px] font-mono rounded ${
              source.isEnabled
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-slate-500 bg-slate-800"
            }`}
          >
            {source.isEnabled ? "on" : "off"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4 pt-3 border-t border-slate-800/80">
        <div>
          <span className="text-xs text-slate-500">Status</span>
          <p
            className={`text-xs font-mono mt-0.5 ${
              source.isEnabled ? "text-emerald-400" : "text-slate-600"
            }`}
          >
            {source.isEnabled ? "enabled" : "disabled"}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Last Run</span>
          <p className="text-xs font-mono text-slate-300 mt-0.5">
            {source.lastRunAt ? relativeTime(source.lastRunAt) : "never"}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Last Status</span>
          <p
            className={`text-xs font-mono mt-0.5 ${
              source.lastRunStatus === "error"
                ? "text-red-400"
                : source.lastRunStatus === "success"
                  ? "text-emerald-400"
                  : "text-slate-500"
            }`}
          >
            {source.lastRunStatus ?? "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Items Fetched</span>
          <p className="text-xs font-mono text-slate-300 mt-0.5">
            {source.lastRunItems ?? "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Jobs</span>
          <p className="text-xs font-mono text-slate-300 mt-0.5">
            {source.jobCount.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Matches</span>
          <p className="text-xs font-mono text-slate-300 mt-0.5">
            {source.matchCount.toLocaleString()}
          </p>
        </div>
      </div>

      {source.candidateBreakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1">
          {source.candidateBreakdown.map((cb) => (
            <div key={cb.candidateId} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{cb.candidateName}</span>
              <span className="font-mono text-slate-500">
                {cb.matchCount} matches · avg {cb.avgScore} · top {cb.topScore}
              </span>
            </div>
          ))}
        </div>
      )}

      {source.lastRunErrors && (
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <p className="text-xs font-mono text-red-400">
            {source.lastRunErrors}
          </p>
        </div>
      )}
    </div>
  );
}

export function Sources() {
  const { isAdmin } = useAuth();
  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: fetchSources,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Sources</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Job posting sources and ingestion status
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-slate-500">Loading sources...</div>
      )}

      {sources && sources.length === 0 && (
        <div className="border border-slate-800 rounded-lg px-5 py-8 text-center text-slate-600 text-sm">
          No sources registered. Run the pipeline to populate.
        </div>
      )}

      {sources && sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

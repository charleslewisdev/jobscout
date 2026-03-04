import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchCandidates, toggleCandidateActive } from "../api";

export function Candidates() {
  const queryClient = useQueryClient();

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleCandidateActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Candidates</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage candidate profiles
          </p>
        </div>
        <Link
          to="/candidates/new"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
        >
          + New Candidate
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {candidates?.map((c) => (
          <div
            key={c.id}
            className={`group border rounded-lg p-5 transition-all ${
              c.isActive
                ? "border-slate-800 hover:border-slate-700 hover:bg-slate-800/30"
                : "border-slate-800/50 opacity-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <Link to={`/candidates/${c.id}`} className="flex-1 min-w-0">
                <h2 className="text-base font-medium text-slate-100 group-hover:text-amber-300 transition-colors">
                  {c.name}
                </h2>
              </Link>
              <div className="flex items-center gap-3 ml-3">
                {c.topScore !== null && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">top score</p>
                    <p className="text-lg font-mono font-bold text-amber-400">
                      {c.topScore}
                    </p>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMutation.mutate({
                      id: c.id,
                      isActive: !c.isActive,
                    });
                  }}
                  title={c.isActive ? "Deactivate candidate" : "Activate candidate"}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                    c.isActive ? "bg-amber-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                      c.isActive ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <Link to={`/candidates/${c.id}`}>
              <div className="mt-4 flex gap-4 text-xs font-mono text-slate-400">
                <span>{c.matchCount} matches</span>
                <span className={c.isActive ? "text-emerald-500" : "text-slate-600"}>
                  {c.isActive ? "active" : "inactive"}
                </span>
                {c.notes && (
                  <span className="text-slate-600 truncate">{c.notes}</span>
                )}
              </div>
            </Link>
          </div>
        ))}
      </div>

      {(!candidates || candidates.length === 0) && (
        <p className="text-sm text-slate-600 text-center py-12">
          No candidates yet. Click &quot;+ New Candidate&quot; to add one.
        </p>
      )}
    </div>
  );
}

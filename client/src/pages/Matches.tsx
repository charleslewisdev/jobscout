import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { fetchCandidates, fetchMatches, updateMatchStatus } from "../api";
import type { MatchListItem } from "../api";
import { MatchCard } from "../components/MatchCard";
import { useAuth } from "../context/AuthContext";

const STATUSES = ["new", "bookmarked", "dismissed"];

type SortField = "score" | "pay" | "posted" | "found";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "pay", label: "Pay" },
  { value: "posted", label: "Posted" },
  { value: "found", label: "Found" },
];

function parseSalaryRaw(raw: string): { avg: number; unit: string } | null {
  const dollarNums = [...raw.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) =>
    parseFloat(m[1].replace(/,/g, ""))
  );
  const nums =
    dollarNums.length > 0
      ? dollarNums
      : [...raw.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\b/g)].map((m) =>
          parseFloat(m[1].replace(/,/g, ""))
        );
  if (nums.length === 0) return null;

  const lower = raw.toLowerCase();
  const isHourly = /\/\s*h|per\s*hour|hourly/i.test(lower);
  const isMonthly = /\/\s*mo|per\s*month|monthly/i.test(lower);
  const unit = isHourly ? "hourly" : isMonthly ? "monthly" : "annual";

  const avg = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  const detectedUnit = unit === "annual" && avg < 200 ? "hourly" : unit;

  return { avg, unit: detectedUnit };
}

function normalizeAnnualSalary(m: MatchListItem): number {
  const min = m.jobSalaryMin;
  const max = m.jobSalaryMax;

  if (min != null || max != null) {
    const avg = min != null && max != null ? (min + max) / 2 : (min ?? max)!;
    const unit = m.jobSalaryUnit;
    if (unit === "hourly") return avg * 2080;
    if (unit === "monthly") return avg * 12;
    return avg;
  }

  if (m.jobSalaryRaw) {
    const parsed = parseSalaryRaw(m.jobSalaryRaw);
    if (parsed) {
      if (parsed.unit === "hourly") return parsed.avg * 2080;
      if (parsed.unit === "monthly") return parsed.avg * 12;
      return parsed.avg;
    }
  }

  return -Infinity;
}

function sortMatches(
  matches: MatchListItem[],
  field: SortField,
  dir: SortDir
): MatchListItem[] {
  const sorted = [...matches].sort((a, b) => {
    switch (field) {
      case "score":
        return dir === "asc"
          ? a.confidenceScore - b.confidenceScore
          : b.confidenceScore - a.confidenceScore;
      case "pay": {
        const aVal = normalizeAnnualSalary(a);
        const bVal = normalizeAnnualSalary(b);
        if (aVal === -Infinity && bVal === -Infinity) return 0;
        if (aVal === -Infinity) return 1;
        if (bVal === -Infinity) return -1;
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      case "posted": {
        const aTime = a.jobPostedDate ? new Date(a.jobPostedDate).getTime() : 0;
        const bTime = b.jobPostedDate ? new Date(b.jobPostedDate).getTime() : 0;
        return dir === "asc" ? aTime - bTime : bTime - aTime;
      }
      case "found":
        return dir === "asc"
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
  return sorted;
}

export function Matches() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [minConfidence, setMinConfidence] = useState(0);
  const [showExpired, setShowExpired] = useState(false);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const queryClient = useQueryClient();

  const candidateId = searchParams.get("candidateId") ?? "";
  const statusFilter = searchParams.get("status") ?? "";

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    enabled: isAdmin,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["matches", { candidateId, status: statusFilter, minConfidence, showExpired }],
    queryFn: () =>
      fetchMatches({
        candidateId: candidateId || undefined,
        status: statusFilter || undefined,
        minConfidence: minConfidence || undefined,
        includeExpired: showExpired || undefined,
        limit: 200,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateMatchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });

  const sortedMatches = useMemo(() => {
    if (!data?.matches) return [];
    return sortMatches(data.matches, sortField, sortDir);
  }, [data?.matches, sortField, sortDir]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleStatusChange = (matchId: string, status: string) => {
    statusMutation.mutate({ id: matchId, status });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Matches</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {data ? `${data.total} total` : "Loading..."}
        </p>
      </div>

      {/* Filter bar */}
      <div className="space-y-3 border border-slate-800 rounded-lg p-4">
        {/* Top row: candidate + toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <select
              value={candidateId}
              onChange={(e) => updateFilter("candidateId", e.target.value)}
              className="bg-slate-875 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            >
              <option value="">All candidates</option>
              {candidates?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 font-mono">min</label>
            <input
              type="range"
              min={0}
              max={100}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-24 accent-amber-500"
            />
            <span className="text-xs text-slate-400 font-mono w-6">{minConfidence}</span>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              className="accent-amber-500"
            />
            Expired
          </label>
        </div>

        {/* Status + Sort chips */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Status */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-600 font-mono uppercase mr-1">Status</span>
            <button
              onClick={() => updateFilter("status", "")}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                !statusFilter
                  ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              all
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() =>
                  updateFilter("status", statusFilter === s ? "" : s)
                }
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  statusFilter === s
                    ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <span className="text-slate-800">|</span>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-600 font-mono uppercase mr-1">Sort</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (sortField === opt.value) {
                    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  } else {
                    setSortField(opt.value);
                    setSortDir("desc");
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  sortField === opt.value
                    ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {opt.label}
                {sortField === opt.value && (
                  <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 font-mono text-sm">
          loading...
        </div>
      ) : (
        <div className="space-y-2">
          {sortedMatches.map((m) => (
            <MatchCard key={m.id} match={m} onStatusChange={handleStatusChange} />
          ))}

          {sortedMatches.length === 0 && (
            <p className="text-sm text-slate-600 text-center py-12">
              No matches found with these filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";

import type { MatchListItem, MatchSummary } from "../api";
import { StatusBadge } from "./StatusBadge";

type MatchCardData = MatchListItem | MatchSummary;

function hasJobLocation(m: MatchCardData): m is MatchListItem {
  return "jobLocation" in m;
}

function isFullMatch(m: MatchCardData): m is MatchListItem {
  return "jobPostingId" in m;
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return new Date(dateString).toLocaleDateString();
}

interface MatchCardProps {
  match: MatchCardData;
  onStatusChange?: (matchId: string, status: string) => void;
}

function scoreGradient(score: number): string {
  if (score >= 70) return "from-emerald-500 to-emerald-600";
  if (score >= 50) return "from-amber-500 to-amber-600";
  if (score >= 30) return "from-orange-500 to-orange-600";
  return "from-red-400 to-red-500";
}

export function MatchCard({ match, onStatusChange }: MatchCardProps) {
  const isExpired = "jobIsActive" in match && match.jobIsActive === false;
  const salaryRaw = "jobSalaryRaw" in match ? match.jobSalaryRaw : null;
  const employmentType =
    "jobEmploymentType" in match ? match.jobEmploymentType : null;
  const postedDate = "jobPostedDate" in match ? match.jobPostedDate : null;
  const sourceName = "sourceName" in match ? match.sourceName : null;

  const postedDateStr = postedDate
    ? `Posted ${formatRelativeTime(postedDate)}`
    : null;
  const infoItems = [salaryRaw, employmentType, postedDateStr].filter(Boolean);

  const showActions = onStatusChange && isFullMatch(match);

  return (
    <Link
      to={`/matches/${match.id}`}
      className={`group block border border-slate-800 rounded-lg p-4 hover:border-slate-700 hover:bg-slate-800/30 transition-all ${isExpired ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Score badge */}
        <div
          className={`shrink-0 w-11 h-11 rounded-lg bg-gradient-to-br ${scoreGradient(match.confidenceScore)} flex items-center justify-center`}
        >
          <span className="text-sm font-mono font-bold text-white">
            {match.confidenceScore}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-100 truncate group-hover:text-amber-300 transition-colors">
              {match.jobTitle}
            </h3>
            {match.status !== "new" && <StatusBadge status={match.status} />}
            {isExpired && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-red-500/10 text-red-400 border border-red-500/20">
                expired
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {match.jobCompany || "Unknown company"}
            {hasJobLocation(match) && match.jobLocation && (
              <span className="text-slate-600"> / {match.jobLocation}</span>
            )}
          </p>
          {infoItems.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              {infoItems.join(" \u00b7 ")}
            </p>
          )}
          {sourceName && (
            <p className="text-[11px] text-slate-600 mt-0.5">
              via {sourceName}
            </p>
          )}
          {match.summary && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
              {match.summary}
            </p>
          )}
        </div>

        {/* Quick actions */}
        {showActions && (
          <div className="shrink-0 flex flex-col gap-1 ml-1">
            {match.status !== "bookmarked" && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStatusChange(match.id, "bookmarked");
                }}
                className="p-1.5 rounded-md text-slate-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                title="Bookmark"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <path d="M4 2h8a1 1 0 011 1v11l-5-3-5 3V3a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {match.status !== "dismissed" && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStatusChange(match.id, "dismissed");
                }}
                className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Dismiss"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

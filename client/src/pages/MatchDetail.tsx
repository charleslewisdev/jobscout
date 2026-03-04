import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";

import { fetchMatch, updateMatchStatus } from "../api";
import { ScoreBar } from "../components/ScoreBar";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_ACTIONS = [
  { status: "new", label: "Mark New" },
  { status: "bookmarked", label: "Bookmark" },
  { status: "dismissed", label: "Dismiss" },
];

export function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchMatch(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateMatchStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        loading...
      </div>
    );
  }

  if (!match) {
    return <div className="text-sm text-slate-500">Match not found</div>;
  }

  const job = match.jobPosting;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/matches"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          Matches
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {job.title}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {job.company || "Unknown company"}
            {job.location && (
              <span className="text-slate-600"> / {job.location}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={match.status} />
            <span className="text-xs text-slate-500 font-mono">
              for {match.candidateName}
            </span>
          </div>
        </div>

        {/* Big confidence score */}
        <div className="text-right shrink-0">
          <p className="text-4xl font-mono font-bold text-amber-400">
            {match.confidenceScore}
          </p>
          <p className="text-xs text-slate-500 font-mono">confidence</p>
        </div>
      </div>

      {/* Status actions */}
      <div className="flex flex-wrap gap-2">
        {STATUS_ACTIONS.filter((a) => a.status !== match.status).map((a) => (
          <button
            key={a.status}
            onClick={() => statusMutation.mutate(a.status)}
            disabled={statusMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Score breakdown */}
      <div className="border border-slate-800 rounded-lg p-4 space-y-2.5">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
          Score Breakdown
        </h2>
        <ScoreBar label="pay" score={match.payScore} />
        <ScoreBar label="schedule" score={match.scheduleScore} />
        <ScoreBar label="location" score={match.locationScore} />
        <ScoreBar label="skills" score={match.skillsScore} />
        <ScoreBar label="culture" score={match.cultureScore} />
      </div>

      {/* Summary and flags */}
      {match.summary && (
        <div className="border border-slate-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
            AI Summary
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            {match.summary}
          </p>
        </div>
      )}

      {match.flags && match.flags.length > 0 && (
        <div className="border border-slate-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">
            Flags
          </h2>
          <ul className="space-y-1">
            {match.flags.map((flag, i) => (
              <li
                key={i}
                className="text-sm text-orange-300 flex items-start gap-2"
              >
                <span className="text-orange-500/60 mt-0.5">!</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Job posting details */}
      <div className="border border-slate-800 rounded-lg p-4 space-y-4">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
          Job Posting
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
          {job.salaryRaw && (
            <div>
              <span className="text-slate-500 text-xs">Salary</span>
              <p className="text-slate-300 font-mono mt-0.5">{job.salaryRaw}</p>
            </div>
          )}
          {job.employmentType && (
            <div>
              <span className="text-slate-500 text-xs">Type</span>
              <p className="text-slate-300 mt-0.5">{job.employmentType}</p>
            </div>
          )}
          {job.postedDate && (
            <div>
              <span className="text-slate-500 text-xs">Posted</span>
              <p className="text-slate-300 mt-0.5">
                {new Date(job.postedDate).toLocaleDateString()}
              </p>
            </div>
          )}
          <div>
            <span className="text-slate-500 text-xs">Source</span>
            <p className="text-slate-300 mt-0.5">
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/80 hover:text-amber-400 underline underline-offset-2"
              >
                {match.sourceName ? `${match.sourceName}` : "Original posting"}
              </a>
            </p>
          </div>
        </div>

        {job.description && (
          <div>
            <span className="text-slate-500 text-xs">Description</span>
            {job.descriptionHtml ? (
              <div
                className="mt-1 text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none [&_a]:text-amber-400"
                dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
              />
            ) : (
              <p className="mt-1 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {job.description}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-600 font-mono">
        model: {match.modelUsed} / matched:{" "}
        {new Date(match.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

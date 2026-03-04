import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  fetchPipelineStatus,
  triggerPipeline,
  triggerStalenessCheck,
  updatePipelineConfig,
} from "../api";

export function Pipeline() {
  const queryClient = useQueryClient();

  const { data: pipeline } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: fetchPipelineStatus,
    refetchInterval: (query) =>
      query.state.data?.isRunning ? 2000 : 30000,
  });

  const runPipeline = useMutation({
    mutationFn: () => triggerPipeline(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  const stalenessCheck = useMutation({
    mutationFn: triggerStalenessCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
  });

  const [cronInput, setCronInput] = useState("");
  const [cronError, setCronError] = useState<string | null>(null);

  // Sync local cron input when server value loads/changes
  useEffect(() => {
    if (pipeline?.cronExpression !== undefined) {
      setCronInput(pipeline.cronExpression);
    }
  }, [pipeline?.cronExpression]);

  const configMutation = useMutation({
    mutationFn: updatePipelineConfig,
    onSuccess: () => {
      setCronError(null);
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
    onError: (err: Error) => {
      setCronError(err.message);
    },
  });

  const cronChanged = cronInput !== (pipeline?.cronExpression ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Job ingestion and matching control
        </p>
      </div>

      {/* Controls */}
      <div className="border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                pipeline?.isRunning
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <div>
              <p className="text-sm font-medium text-slate-200">
                {pipeline?.isRunning ? "Pipeline Running" : "Pipeline Idle"}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                cron: {pipeline?.cronExpression ?? "—"}
              </p>
            </div>
          </div>

          <button
            onClick={() => runPipeline.mutate()}
            disabled={pipeline?.isRunning || runPipeline.isPending}
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pipeline?.isRunning ? "Running..." : "Run Now"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-5 pt-4 border-t border-slate-800/80">
          <div>
            <span className="text-xs text-slate-500">Last Run</span>
            <p className="text-sm font-mono text-slate-300 mt-0.5">
              {pipeline?.completedAt
                ? new Date(pipeline.completedAt).toLocaleString()
                : "never"}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Started At</span>
            <p className="text-sm font-mono text-slate-300 mt-0.5">
              {pipeline?.startedAt
                ? new Date(pipeline.startedAt).toLocaleString()
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Next Scheduled</span>
            <p className="text-sm font-mono text-slate-300 mt-0.5">
              {pipeline?.nextRun
                ? new Date(pipeline.nextRun).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Scheduler Configuration */}
      <div className="border border-slate-800 rounded-lg p-5">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">
          Scheduler Configuration
        </h2>

        <div className="space-y-4">
          {/* Cron expression */}
          <div>
            <label className="text-xs text-slate-500">Schedule</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={cronInput}
                onChange={(e) => {
                  setCronInput(e.target.value);
                  setCronError(null);
                }}
                className="flex-1 max-w-xs px-3 py-1.5 text-sm font-mono text-slate-200 bg-slate-900 border border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50"
                placeholder="0 */6 * * *"
              />
              <button
                onClick={() =>
                  configMutation.mutate({ cronExpression: cronInput })
                }
                disabled={!cronChanged || configMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {configMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
            {cronError && (
              <p className="text-xs text-red-400 mt-1 font-mono">{cronError}</p>
            )}
            {pipeline?.enabled && pipeline.nextRun && !cronError && (
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Next: {new Date(pipeline.nextRun).toLocaleString()}
              </p>
            )}
          </div>

          {/* Enabled toggle */}
          <div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500">Enabled</label>
              <button
                onClick={() =>
                  configMutation.mutate({ enabled: !pipeline?.enabled })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  pipeline?.enabled ? "bg-amber-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    pipeline?.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {!pipeline?.enabled && (
              <p className="text-xs text-slate-500 mt-1">
                Scheduler disabled — pipeline runs manually only
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Staleness Check */}
      <div className="border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              Staleness Check
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Check if saved job postings are still live. Expired postings are
              dimmed in the matches list.
            </p>
          </div>
          <button
            onClick={() => stalenessCheck.mutate()}
            disabled={stalenessCheck.isPending}
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {stalenessCheck.isPending ? "Checking..." : "Check Now"}
          </button>
        </div>

        {stalenessCheck.isError && (
          <div className="mt-3 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            {stalenessCheck.error.message}
          </div>
        )}

        {stalenessCheck.isSuccess && stalenessCheck.data && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono">
            <span className="text-slate-400">
              checked: {stalenessCheck.data.checked}
            </span>
            <span className="text-red-400">
              expired: {stalenessCheck.data.expired}
            </span>
            <span className="text-emerald-400">
              active: {stalenessCheck.data.active}
            </span>
            <span className="text-slate-500">
              unknown: {stalenessCheck.data.unknown}
            </span>
            {stalenessCheck.data.errors > 0 && (
              <span className="text-red-400">
                errors: {stalenessCheck.data.errors}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Last run results */}
      {pipeline?.lastResult && (
        <div className="border border-slate-800 rounded-lg p-5">
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">
            Last Run Results
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <RunStat label="Fetched" value={pipeline.lastResult.totalFetched} />
            <RunStat label="New" value={pipeline.lastResult.totalNew} />
            <RunStat
              label="Duplicates"
              value={pipeline.lastResult.totalDuplicate}
            />
            <RunStat
              label="Pre-filtered"
              value={pipeline.lastResult.totalPrefiltered}
            />
            <RunStat
              label="Matched"
              value={pipeline.lastResult.totalMatched}
              accent
            />
          </div>

          <div className="mt-3 text-xs font-mono text-slate-500">
            Duration: {(pipeline.lastResult.durationMs / 1000).toFixed(1)}s
          </div>

          {pipeline.lastResult.errors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800/80">
              <h3 className="text-xs font-mono text-red-400 mb-1">Errors</h3>
              <ul className="space-y-0.5">
                {pipeline.lastResult.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-300 font-mono">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(pipeline.lastResult.matchesByCandidate).length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800/80">
              <h3 className="text-xs font-mono text-slate-500 mb-2">
                By Candidate
              </h3>
              <div className="space-y-1">
                {Object.entries(pipeline.lastResult.matchesByCandidate).map(
                  ([name, { count, topScore }]) => (
                    <div
                      key={name}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="text-slate-300">{name}</span>
                      <span className="text-xs font-mono text-slate-500">
                        {count} matches, top: {topScore}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function RunStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-xl font-mono font-bold mt-0.5 ${accent ? "text-amber-400" : "text-slate-200"}`}
      >
        {value}
      </p>
    </div>
  );
}

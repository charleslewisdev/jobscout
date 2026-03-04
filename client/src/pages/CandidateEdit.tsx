import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";

import {
  deleteCandidate,
  fetchCandidate,
  fetchMatches,
  generateProfile,
  toggleCandidateActive,
  updateCandidate,
} from "../api";
import { MatchCard } from "../components/MatchCard";
import { ProfileQuestionnaire } from "../components/ProfileQuestionnaire";
import { QuestionnaireExport } from "../components/QuestionnaireExport";
import { ResumeUpload } from "../components/ResumeUpload";

export function CandidateEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: candidate, isLoading } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => fetchCandidate(id!),
    enabled: !!id,
  });

  const { data: matchData } = useQuery({
    queryKey: ["matches", { candidateId: id }],
    queryFn: () => fetchMatches({ candidateId: id!, limit: 10 }),
    enabled: !!id,
  });

  const [notes, setNotes] = useState("");
  const [questionnaireData, setQuestionnaireData] = useState<
    Record<string, unknown>
  >({});
  const [profileJson, setProfileJson] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);

  // Generate profile state
  const [generatedProfile, setGeneratedProfile] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [showGeneratedReview, setShowGeneratedReview] = useState(false);

  useEffect(() => {
    if (candidate) {
      setNotes(candidate.notes ?? "");
      setQuestionnaireData(
        (candidate.questionnaireData as Record<string, unknown>) ?? {},
      );
      setProfileJson(JSON.stringify(candidate.profileData, null, 2));
    }
  }, [candidate]);

  // Track unsaved changes
  const isDirty = useMemo(() => {
    if (!candidate) return false;
    const serverNotes = candidate.notes ?? "";
    const serverQuestionnaire = candidate.questionnaireData ?? {};
    const serverProfileJson = JSON.stringify(candidate.profileData, null, 2);
    return (
      notes !== serverNotes ||
      JSON.stringify(questionnaireData) !== JSON.stringify(serverQuestionnaire) ||
      (showAdvanced && profileJson !== serverProfileJson)
    );
  }, [candidate, notes, questionnaireData, showAdvanced, profileJson]);

  // Warn on page close/refresh with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCandidate(id!, {
        notes,
        questionnaireData,
        profileData: showAdvanced
          ? JSON.parse(profileJson)
          : candidate?.profileData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCandidate(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate("/candidates");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => toggleCandidateActive(id!, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateProfile(id!),
    onSuccess: (data) => {
      setGeneratedProfile(data.profile);
      setShowGeneratedReview(true);
    },
  });

  const acceptProfileMutation = useMutation({
    mutationFn: () =>
      updateCandidate(id!, { profileData: generatedProfile! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setShowGeneratedReview(false);
      setGeneratedProfile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
        loading...
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="text-sm text-slate-500">Candidate not found</div>
    );
  }

  const hasQuestionnaire =
    candidate.questionnaireData &&
    Object.keys(candidate.questionnaireData).length > 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/candidates"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          Candidates
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">{candidate.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-100">
            {candidate.name}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                toggleActiveMutation.mutate(!candidate.isActive)
              }
              title={
                candidate.isActive
                  ? "Deactivate candidate"
                  : "Activate candidate"
              }
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                candidate.isActive ? "bg-amber-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  candidate.isActive ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span className="text-xs font-mono text-slate-500">
              {candidate.isActive ? "active" : "inactive"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-emerald-400 font-mono">
              saved
            </span>
          )}
          {isDirty && !saved && (
            <span className="text-xs text-amber-400/70 font-mono">unsaved changes</span>
          )}
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${candidate?.name}"? This will also remove all their matches and cannot be undone.`,
                )
              ) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${
              isDirty
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-inset ring-amber-500/40 hover:bg-amber-500/30"
                : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20"
            }`}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg p-3">
          {saveMutation.error.message}
        </div>
      )}

      {deleteMutation.isError && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg p-3">
          {deleteMutation.error.message}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-mono text-slate-500 mb-1.5">
          Notes
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Quick notes about this candidate..."
          className="w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
        />
      </div>

      {/* Legacy notice */}
      {!hasQuestionnaire && (
        <div className="border border-slate-800 rounded-lg bg-slate-875/30 px-4 py-3">
          <p className="text-xs text-slate-500">
            This profile was created manually. Fill out the questionnaire below
            to enable AI-assisted profile generation.
          </p>
        </div>
      )}

      {/* Questionnaire */}
      <div>
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
          Profile Questionnaire
        </h2>
        <ProfileQuestionnaire
          data={questionnaireData}
          onChange={setQuestionnaireData}
        />
      </div>

      {/* Resume Upload */}
      <div>
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
          Resume
        </h2>
        <ResumeUpload
          candidateId={id!}
          resumeOriginalName={candidate.resumeOriginalName}
          resumeUploadedAt={candidate.resumeUploadedAt}
          onUploaded={() =>
            queryClient.invalidateQueries({ queryKey: ["candidate", id] })
          }
        />
      </div>

      {/* Generate Profile */}
      <div className="border border-slate-800 rounded-lg bg-slate-875/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              AI Profile Generation
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Generate a structured profile from the questionnaire
              {candidate.resumeOriginalName ? " and resume" : ""} using AI.
            </p>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={
              generateMutation.isPending ||
              !hasQuestionnaire
            }
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
          >
            {generateMutation.isPending
              ? "Generating..."
              : candidate.profileData &&
                  Object.keys(candidate.profileData).length > 1
                ? "Regenerate Profile"
                : "Generate Profile"}
          </button>
        </div>

        {generateMutation.isError && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            {generateMutation.error.message}
          </div>
        )}

        {!hasQuestionnaire && (
          <p className="text-xs text-slate-600">
            Fill out the questionnaire above before generating a profile.
          </p>
        )}
      </div>

      {/* Generated profile review modal */}
      {showGeneratedReview && generatedProfile && (
        <div className="border-2 border-amber-500/30 rounded-lg bg-slate-875 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-amber-500/5">
            <h3 className="text-sm font-medium text-amber-300">
              Review Generated Profile
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowGeneratedReview(false);
                  setGeneratedProfile(null);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => acceptProfileMutation.mutate()}
                disabled={acceptProfileMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
              >
                {acceptProfileMutation.isPending
                  ? "Saving..."
                  : "Accept & Save"}
              </button>
            </div>
          </div>
          <div className="p-4">
            <pre className="text-xs font-mono text-slate-300 bg-slate-900/50 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(generatedProfile, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Advanced: Raw JSON */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-mono text-slate-600 hover:text-slate-400 transition-colors"
        >
          <span>Advanced: Raw Profile JSON</span>
          <span>{showAdvanced ? "-" : "+"}</span>
        </button>
        {showAdvanced && (
          <div className="px-4 pb-4">
            <p className="text-xs text-slate-600 mb-2">
              Direct edit of the profile data used by the matching engine.
              Changes here are saved when you click "Save Changes" above.
            </p>
            <textarea
              value={profileJson}
              onChange={(e) => setProfileJson(e.target.value)}
              rows={20}
              spellCheck={false}
              className="w-full bg-slate-875 border border-slate-800 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 resize-y"
            />
          </div>
        )}
      </div>

      {/* Questionnaire Export */}
      <QuestionnaireExport data={questionnaireData} />

      {/* Matches for this candidate */}
      {matchData && matchData.matches.length > 0 && (
        <div>
          <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
            Matches ({matchData.total})
          </h2>
          <div className="space-y-2">
            {matchData.matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

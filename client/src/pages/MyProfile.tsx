import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";

import {
  fetchMyProfile,
  updateMyProfile,
  generateProfile,
  type CandidateDetail,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { ProfileQuestionnaire } from "../components/ProfileQuestionnaire";
import { QuestionnaireExport } from "../components/QuestionnaireExport";
import { ResumeUpload } from "../components/ResumeUpload";

export function MyProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: candidate,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["my-profile"],
    queryFn: fetchMyProfile,
  });

  const [notes, setNotes] = useState("");
  const [questionnaireData, setQuestionnaireData] = useState<
    Record<string, unknown>
  >({});
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
    }
  }, [candidate]);

  // Track unsaved changes
  const isDirty = useMemo(() => {
    if (!candidate) return false;
    const serverNotes = candidate.notes ?? "";
    const serverQuestionnaire = candidate.questionnaireData ?? {};
    return (
      notes !== serverNotes ||
      JSON.stringify(questionnaireData) !== JSON.stringify(serverQuestionnaire)
    );
  }, [candidate, notes, questionnaireData]);

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
      updateMyProfile({
        notes,
        questionnaireData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateProfile(candidate!.id),
    onSuccess: (data) => {
      setGeneratedProfile(data.profile);
      setShowGeneratedReview(true);
    },
  });

  const acceptProfileMutation = useMutation({
    mutationFn: () => updateMyProfile({ profileData: generatedProfile! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
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

  // No profile linked
  if (fetchError || !candidate) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
          <span className="font-mono text-lg text-slate-500">@</span>
        </div>
        <div className="text-center">
          <p className="text-sm text-slate-300 mb-1">No profile linked</p>
          <p className="text-xs text-slate-500">
            Your profile hasn't been set up yet. Contact your admin to link a
            candidate profile to your account.
          </p>
        </div>
      </div>
    );
  }

  const hasQuestionnaire =
    candidate.questionnaireData &&
    Object.keys(candidate.questionnaireData).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">My Profile</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {user?.name} -- {user?.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-emerald-400 font-mono">saved</span>
          )}
          {isDirty && !saved && (
            <span className="text-xs text-amber-400/70 font-mono">unsaved changes</span>
          )}
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

      {/* Notes */}
      <div>
        <label className="block text-xs font-mono text-slate-500 mb-1.5">
          Notes
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Quick notes about yourself..."
          className="w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
        />
      </div>

      {/* Legacy notice */}
      {!hasQuestionnaire && (
        <div className="border border-slate-800 rounded-lg bg-slate-875/30 px-4 py-3">
          <p className="text-xs text-slate-500">
            Fill out the questionnaire below so we can find the best job matches
            for you.
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
          candidateId={candidate.id}
          resumeOriginalName={candidate.resumeOriginalName}
          resumeUploadedAt={candidate.resumeUploadedAt}
          onUploaded={() =>
            queryClient.invalidateQueries({ queryKey: ["my-profile"] })
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
              Generate a structured profile from your questionnaire
              {candidate.resumeOriginalName ? " and resume" : ""} using AI.
            </p>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !hasQuestionnaire}
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

      {/* Questionnaire Export */}
      <QuestionnaireExport data={questionnaireData} />
    </div>
  );
}

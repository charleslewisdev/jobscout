import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createCandidate } from "../api";
import { ProfileQuestionnaire } from "../components/ProfileQuestionnaire";

const EMPTY_PROFILE = {
  identity: { name: "" },
  compensation: {},
  benefits: {},
  schedule: {},
  location: {},
  experience: {},
  preferences: {},
  dealbreakers: [],
};

export function CandidateCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [questionnaireData, setQuestionnaireData] = useState<
    Record<string, unknown>
  >({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState(
    JSON.stringify(EMPTY_PROFILE, null, 2),
  );

  const mutation = useMutation({
    mutationFn: () => {
      // If user manually edited JSON in advanced mode, use that as profileData
      const profileData = showAdvanced
        ? JSON.parse(advancedJson)
        : { ...EMPTY_PROFILE, identity: { name: name.trim() } };

      return createCandidate({
        name: name.trim(),
        profileData,
        questionnaireData,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate(`/candidates/${data.id}`);
    },
  });

  const isValid = name.trim().length > 0;

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
        <span className="text-slate-300">New</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">
          New Candidate
        </h1>
        <button
          onClick={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create Candidate"}
        </button>
      </div>

      {mutation.isError && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg p-3">
          {mutation.error.message}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-xs font-mono text-slate-500 mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Candidate name..."
          className="w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
        />
      </div>

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

      {/* Questionnaire */}
      <div>
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-3">
          Profile Questionnaire
        </h2>
        <p className="text-xs text-slate-600 mb-4">
          Fill out what you can now. You can always come back to add more
          details, upload a resume, and generate a full profile later.
        </p>
        <ProfileQuestionnaire
          data={questionnaireData}
          onChange={setQuestionnaireData}
        />
      </div>

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
              Override the auto-generated profile data. This JSON is what the
              matching engine uses directly.
            </p>
            <textarea
              value={advancedJson}
              onChange={(e) => setAdvancedJson(e.target.value)}
              rows={16}
              spellCheck={false}
              className="w-full bg-slate-875 border border-slate-800 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}

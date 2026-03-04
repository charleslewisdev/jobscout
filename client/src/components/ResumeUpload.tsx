import { useState, useRef, useCallback, type DragEvent } from "react";
import { useMutation } from "@tanstack/react-query";

import { uploadResume, deleteResume } from "../api";

interface ResumeUploadProps {
  candidateId: string;
  resumeOriginalName?: string | null;
  resumeUploadedAt?: string | null;
  onUploaded?: () => void;
}

const ACCEPTED_TYPES = [".pdf", ".txt", ".md"];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ResumeUpload({
  candidateId,
  resumeOriginalName,
  resumeUploadedAt,
  onUploaded,
}: ResumeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadResume(candidateId, file),
    onSuccess: () => {
      setError(null);
      onUploaded?.();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteResume(candidateId),
    onSuccess: () => {
      setError(null);
      onUploaded?.();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const validateAndUpload = useCallback(
    (file: File) => {
      setError(null);

      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        setError(`Invalid file type. Accepted: ${ACCEPTED_TYPES.join(", ")}`);
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        setError(`File too large. Maximum size: ${MAX_SIZE_MB}MB`);
        return;
      }

      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) validateAndUpload(file);
    },
    [validateAndUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndUpload(file);
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [validateAndUpload],
  );

  const isUploading = uploadMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const hasResume = !!resumeOriginalName;

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {hasResume ? (
        // ─── Uploaded file info ───
        <div className="flex items-center justify-between border border-slate-800 rounded-lg bg-slate-875/50 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-xs font-mono text-emerald-400">F</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-200 truncate">
                {resumeOriginalName}
              </p>
              {resumeUploadedAt && (
                <p className="text-xs text-slate-500">
                  Uploaded {formatDate(resumeUploadedAt)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={isDeleting}
            className="shrink-0 ml-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            {isDeleting ? "Removing..." : "Remove"}
          </button>
        </div>
      ) : (
        // ─── Drop zone ───
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-slate-700 hover:border-slate-600 bg-slate-875/30"
          }`}
        >
          {isUploading ? (
            <div className="text-sm text-amber-400 font-mono">Uploading...</div>
          ) : (
            <>
              <div className="text-sm text-slate-400 mb-1">
                Drag & drop a resume or{" "}
                <span className="text-amber-400 hover:text-amber-300">
                  click to browse
                </span>
              </div>
              <div className="text-xs text-slate-600">
                PDF, TXT, or MD -- max {MAX_SIZE_MB}MB
              </div>
            </>
          )}
        </div>
      )}

      {/* Replace with new file option */}
      {hasResume && !isDeleting && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {isUploading ? "Uploading..." : "Replace with new file"}
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

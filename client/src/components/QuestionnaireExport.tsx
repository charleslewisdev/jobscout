import { useState, useCallback } from "react";

interface QuestionnaireData {
  professionalSummary?: string;
  skills?: string[];
  certifications?: string[];
  yearsOfExperience?: number;
  educationLevel?: string;
  targetRoles?: string[];
  targetIndustries?: string[];
  rolesToAvoid?: string[];
  industriesToAvoid?: string[];
  minimumPay?: number;
  idealPayMin?: number;
  idealPayMax?: number;
  payUnit?: "hourly" | "annual";
  requiredBenefits?: string[];
  niceToHaveBenefits?: string[];
  availability?: string;
  hoursPerWeekMin?: number;
  hoursPerWeekMax?: number;
  remotePreference?: string;
  scheduleNotes?: string;
  acceptableAreas?: string[];
  maxCommuteMinutes?: number;
  willingToRelocate?: boolean;
  dealbreakers?: string[];
  searchKeywords?: string[];
  [key: string]: unknown;
}

interface QuestionnaireExportProps {
  data?: Record<string, unknown>;
}

function formatList(items?: string[]): string {
  if (!items || items.length === 0) return "";
  return items.join(", ");
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function generateText(data?: Record<string, unknown>): string {
  const d = (data ?? {}) as QuestionnaireData;

  return `JobScout Candidate Questionnaire
================================

1. ABOUT YOU
   Professional summary (your background, what you're looking for):
   ${d.professionalSummary ?? ""}

2. WORK EXPERIENCE
   Key skills (list as many as you'd like):
   ${formatList(d.skills)}
   Certifications or licenses:
   ${formatList(d.certifications)}
   Years of work experience:
   ${formatNumber(d.yearsOfExperience)}
   Highest education level:
   ${d.educationLevel ?? ""}

3. WHAT YOU'RE LOOKING FOR
   Roles that interest you:
   ${formatList(d.targetRoles)}
   Industries that interest you:
   ${formatList(d.targetIndustries)}
   Roles to avoid:
   ${formatList(d.rolesToAvoid)}
   Industries to avoid:
   ${formatList(d.industriesToAvoid)}

4. COMPENSATION
   Minimum acceptable pay:
   ${formatNumber(d.minimumPay)}
   Ideal pay range:
   ${d.idealPayMin || d.idealPayMax ? `${formatNumber(d.idealPayMin)} - ${formatNumber(d.idealPayMax)}` : ""}
   Pay type (hourly/annual):
   ${d.payUnit ?? ""}
   Required benefits:
   ${formatList(d.requiredBenefits)}
   Nice-to-have benefits:
   ${formatList(d.niceToHaveBenefits)}

5. SCHEDULE & LOCATION
   Availability (Full-time/Part-time/Either):
   ${d.availability ?? ""}
   Hours per week (range):
   ${d.hoursPerWeekMin || d.hoursPerWeekMax ? `${formatNumber(d.hoursPerWeekMin)} - ${formatNumber(d.hoursPerWeekMax)}` : ""}
   Remote preference:
   ${d.remotePreference ?? ""}
   Schedule notes:
   ${d.scheduleNotes ?? ""}
   Acceptable areas:
   ${formatList(d.acceptableAreas)}
   Max commute (minutes):
   ${formatNumber(d.maxCommuteMinutes)}
   Willing to relocate:
   ${d.willingToRelocate === true ? "Yes" : d.willingToRelocate === false ? "No" : ""}

6. DEALBREAKERS
   Things that would make you reject a job:
   ${formatList(d.dealbreakers)}

7. SEARCH KEYWORDS
   Keywords for job board searches:
   ${formatList(d.searchKeywords)}
`;
}

export function QuestionnaireExport({ data }: QuestionnaireExportProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = generateText(data);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleDownload = useCallback(() => {
    const text = generateText(data);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jobscout-questionnaire.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-875/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-xs font-mono font-medium text-slate-500 uppercase tracking-wider">
            Share Questionnaire
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Copy or download the questionnaire as plain text to share with
            others.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
        >
          {copied ? "Copied!" : "Copy Questionnaire"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Download as .txt
        </button>
      </div>
    </div>
  );
}

import { useState, useCallback, type KeyboardEvent } from "react";

// ─── Types ───

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

interface ProfileQuestionnaireProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

// ─── Tag Input ───

function TagInput({
  tags,
  onChange,
  placeholder,
  readOnly,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  readOnly?: boolean;
}) {
  const [input, setInput] = useState("");

  const addTag = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  }, [input, tags, onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
      if (e.key === "Backspace" && input === "" && tags.length > 0) {
        onChange(tags.slice(0, -1));
      }
    },
    [addTag, input, tags, onChange],
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange],
  );

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20"
            >
              {tag}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  className="ml-0.5 text-amber-400/60 hover:text-amber-300 transition-colors"
                >
                  x
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!readOnly && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) addTag();
          }}
          placeholder={placeholder}
          className="w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40"
        />
      )}
    </div>
  );
}

// ─── Section Wrapper ───

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-800 rounded-lg bg-slate-875/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60">
        <h3 className="text-xs font-mono font-medium text-slate-500 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

// ─── Field Wrapper ───

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-slate-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Constants ───

const EDUCATION_LEVELS = [
  "",
  "High School",
  "Some College",
  "Associate's",
  "Bachelor's",
  "Master's",
  "Doctorate",
  "Trade/Vocational",
  "Other",
];

const AVAILABILITY_OPTIONS = ["", "Full-time", "Part-time", "Either"];

const REMOTE_OPTIONS = ["", "Remote", "Hybrid", "Onsite", "Flexible"];

// ─── Main Component ───

export function ProfileQuestionnaire({
  data,
  onChange,
  readOnly,
}: ProfileQuestionnaireProps) {
  const d = data as QuestionnaireData;

  const set = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange],
  );

  const inputClasses =
    "w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 disabled:opacity-50";

  const selectClasses =
    "w-full bg-slate-875 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {/* Section 1: About You */}
      <Section title="About You">
        <Field label="Professional Summary">
          <textarea
            value={(d.professionalSummary as string) ?? ""}
            onChange={(e) => set("professionalSummary", e.target.value)}
            disabled={readOnly}
            rows={4}
            placeholder="Tell us about yourself -- your background, what you bring to a role, what motivates you..."
            className={`${inputClasses} resize-y`}
          />
        </Field>
      </Section>

      {/* Section 2: Work Experience */}
      <Section title="Work Experience">
        <Field label="Skills">
          <TagInput
            tags={(d.skills as string[]) ?? []}
            onChange={(v) => set("skills", v)}
            placeholder="Type a skill and press Enter (e.g. customer service, Excel, forklift certified)"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Certifications">
          <TagInput
            tags={(d.certifications as string[]) ?? []}
            onChange={(v) => set("certifications", v)}
            placeholder="Type a certification and press Enter (e.g. CPR, OSHA 10, ServSafe)"
            readOnly={readOnly}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Years of Experience">
            <input
              type="number"
              min={0}
              value={d.yearsOfExperience ?? ""}
              onChange={(e) =>
                set(
                  "yearsOfExperience",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder="0"
              className={inputClasses}
            />
          </Field>

          <Field label="Education Level">
            <select
              value={(d.educationLevel as string) ?? ""}
              onChange={(e) => set("educationLevel", e.target.value || undefined)}
              disabled={readOnly}
              className={selectClasses}
            >
              {EDUCATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level || "Select..."}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Section 3: What You're Looking For */}
      <Section title="What You're Looking For">
        <Field label="Target Roles">
          <TagInput
            tags={(d.targetRoles as string[]) ?? []}
            onChange={(v) => set("targetRoles", v)}
            placeholder="Roles you want (e.g. barista, office assistant, warehouse worker)"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Target Industries">
          <TagInput
            tags={(d.targetIndustries as string[]) ?? []}
            onChange={(v) => set("targetIndustries", v)}
            placeholder="Industries you're interested in (e.g. food service, healthcare, tech)"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Roles to Avoid">
          <TagInput
            tags={(d.rolesToAvoid as string[]) ?? []}
            onChange={(v) => set("rolesToAvoid", v)}
            placeholder="Roles you don't want (e.g. cold calling, door-to-door sales)"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Industries to Avoid">
          <TagInput
            tags={(d.industriesToAvoid as string[]) ?? []}
            onChange={(v) => set("industriesToAvoid", v)}
            placeholder="Industries to skip (e.g. insurance, MLM)"
            readOnly={readOnly}
          />
        </Field>
      </Section>

      {/* Section 4: Compensation */}
      <Section title="Compensation">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-mono text-slate-500">Pay unit:</span>
          <div className="inline-flex rounded-lg border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => !readOnly && set("payUnit", "hourly")}
              disabled={readOnly}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                (d.payUnit ?? "hourly") === "hourly"
                  ? "bg-amber-500/15 text-amber-300 border-r border-amber-500/20"
                  : "bg-slate-875 text-slate-500 border-r border-slate-800 hover:text-slate-300"
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => !readOnly && set("payUnit", "annual")}
              disabled={readOnly}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                d.payUnit === "annual"
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-slate-875 text-slate-500 hover:text-slate-300"
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field
            label={`Minimum Pay${(d.payUnit ?? "hourly") === "hourly" ? " ($/hr)" : " ($/yr)"}`}
          >
            <input
              type="number"
              min={0}
              value={d.minimumPay ?? ""}
              onChange={(e) =>
                set(
                  "minimumPay",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder={
                (d.payUnit ?? "hourly") === "hourly" ? "15" : "35000"
              }
              className={inputClasses}
            />
          </Field>

          <Field label="Ideal Range Min">
            <input
              type="number"
              min={0}
              value={d.idealPayMin ?? ""}
              onChange={(e) =>
                set(
                  "idealPayMin",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder={
                (d.payUnit ?? "hourly") === "hourly" ? "18" : "45000"
              }
              className={inputClasses}
            />
          </Field>

          <Field label="Ideal Range Max">
            <input
              type="number"
              min={0}
              value={d.idealPayMax ?? ""}
              onChange={(e) =>
                set(
                  "idealPayMax",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder={
                (d.payUnit ?? "hourly") === "hourly" ? "25" : "65000"
              }
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Required Benefits">
          <TagInput
            tags={(d.requiredBenefits as string[]) ?? []}
            onChange={(v) => set("requiredBenefits", v)}
            placeholder="Must-have benefits (e.g. health insurance, PTO, dental)"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Nice-to-Have Benefits">
          <TagInput
            tags={(d.niceToHaveBenefits as string[]) ?? []}
            onChange={(v) => set("niceToHaveBenefits", v)}
            placeholder="Would-be-nice benefits (e.g. 401k match, transit pass, gym)"
            readOnly={readOnly}
          />
        </Field>
      </Section>

      {/* Section 5: Schedule & Location */}
      <Section title="Schedule & Location">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Availability">
            <select
              value={(d.availability as string) ?? ""}
              onChange={(e) =>
                set("availability", e.target.value || undefined)
              }
              disabled={readOnly}
              className={selectClasses}
            >
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || "Select..."}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Remote Preference">
            <select
              value={(d.remotePreference as string) ?? ""}
              onChange={(e) =>
                set("remotePreference", e.target.value || undefined)
              }
              disabled={readOnly}
              className={selectClasses}
            >
              {REMOTE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || "Select..."}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Hours/Week Min">
            <input
              type="number"
              min={0}
              max={168}
              value={d.hoursPerWeekMin ?? ""}
              onChange={(e) =>
                set(
                  "hoursPerWeekMin",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder="20"
              className={inputClasses}
            />
          </Field>

          <Field label="Hours/Week Max">
            <input
              type="number"
              min={0}
              max={168}
              value={d.hoursPerWeekMax ?? ""}
              onChange={(e) =>
                set(
                  "hoursPerWeekMax",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder="40"
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Schedule Notes">
          <textarea
            value={(d.scheduleNotes as string) ?? ""}
            onChange={(e) => set("scheduleNotes", e.target.value)}
            disabled={readOnly}
            rows={2}
            placeholder="Anything about your schedule (e.g. no nights, school pickup at 3pm, available weekends)"
            className={`${inputClasses} resize-y`}
          />
        </Field>

        <Field label="Acceptable Areas">
          <TagInput
            tags={(d.acceptableAreas as string[]) ?? []}
            onChange={(v) => set("acceptableAreas", v)}
            placeholder="Where you'd work (e.g. Portland, Beaverton, SE Portland, Downtown)"
            readOnly={readOnly}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Max Commute (minutes)">
            <input
              type="number"
              min={0}
              value={d.maxCommuteMinutes ?? ""}
              onChange={(e) =>
                set(
                  "maxCommuteMinutes",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              disabled={readOnly}
              placeholder="30"
              className={inputClasses}
            />
          </Field>

          <Field label="Willing to Relocate">
            <div className="flex items-center h-[38px]">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={d.willingToRelocate ?? false}
                  onChange={(e) =>
                    !readOnly && set("willingToRelocate", e.target.checked)
                  }
                  disabled={readOnly}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:ring-2 peer-focus:ring-amber-500/40 rounded-full peer peer-checked:bg-amber-500 transition-colors">
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                      d.willingToRelocate ? "translate-x-4 ml-0.5" : "translate-x-0 ml-0.5"
                    }`}
                  />
                </div>
                <span className="ml-2 text-xs text-slate-400">
                  {d.willingToRelocate ? "Yes" : "No"}
                </span>
              </label>
            </div>
          </Field>
        </div>
      </Section>

      {/* Section 6: Dealbreakers */}
      <Section title="Dealbreakers">
        <Field label="Things that are absolute no-gos">
          <TagInput
            tags={(d.dealbreakers as string[]) ?? []}
            onChange={(v) => set("dealbreakers", v)}
            placeholder="Dealbreakers (e.g. no drug testing, no commission-only, no overnight shifts)"
            readOnly={readOnly}
          />
        </Field>
      </Section>

      {/* Section 7: Search Keywords */}
      <Section title="Search Keywords">
        <Field label="Keywords to search job boards for">
          <TagInput
            tags={(d.searchKeywords as string[]) ?? []}
            onChange={(v) => set("searchKeywords", v)}
            placeholder="Search terms (e.g. receptionist, data entry, Portland OR, part-time)"
            readOnly={readOnly}
          />
        </Field>
      </Section>
    </div>
  );
}

// ─── Candidate Profiles ───

export interface CandidateProfile {
  identity: {
    name: string;
    notes?: string;
  };
  compensation: {
    minimumPay?: number;
    preferredPayMin?: number;
    preferredPayMax?: number;
    payUnit?: "hourly" | "annual";
  };
  benefits: {
    required?: string[];
    niceToHave?: string[];
  };
  schedule: {
    availability?: string;
    hoursPerWeek?: { min?: number; max?: number };
    remotePreference?: "remote" | "hybrid" | "onsite" | "flexible";
    flexibilityNotes?: string;
  };
  location: {
    acceptableAreas?: string[];
    maxCommuteMinutes?: number;
    willingToRelocate?: boolean;
  };
  experience: {
    summary?: string;
    skills?: string[];
    certifications?: string[];
    yearsOfExperience?: number;
    educationLevel?: string;
  };
  preferences: {
    targetIndustries?: string[];
    targetRoles?: string[];
    excludeIndustries?: string[];
    excludeRoles?: string[];
  };
  /** Keywords used for job board searches (e.g., Adzuna `what` param) */
  searchKeywords?: string[];
  dealbreakers: string[];
}

// ─── Shared Enums ───

export type SalaryUnit = "hourly" | "annual" | "monthly";

// ─── Job Postings ───

export interface LocationParsed {
  city?: string;
  state?: string;
  zip?: string;
  remote: boolean;
  hybrid: boolean;
}

export interface JobPosting {
  id: string;
  sourceId: string;
  sourceUrl: string;
  externalId?: string;
  title: string;
  company?: string;
  location?: string;
  locationParsed?: LocationParsed;
  salaryMin?: number;
  salaryMax?: number;
  salaryUnit?: SalaryUnit;
  salaryRaw?: string;
  description: string;
  descriptionHtml?: string;
  employmentType?: string;
  benefits?: string[];
  requirements?: string[];
  postedDate?: Date;
  fetchedDate: Date;
  expiresDate?: Date;
  isActive: boolean;
  dedupeHash: string;
}

// ─── Match Results ───

export type MatchStatus =
  | "new"
  | "reviewed"
  | "bookmarked"
  | "shared"
  | "dismissed";

export interface MatchResult {
  id: string;
  jobPostingId: string;
  candidateId: string;
  confidenceScore: number;
  payScore?: number;
  scheduleScore?: number;
  locationScore?: number;
  skillsScore?: number;
  cultureScore?: number;
  summary?: string;
  flags?: string[];
  modelUsed: string;
  status: MatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── LLM Response Schema ───

export interface LLMMatchResponse {
  confidenceScore: number;
  categoryScores: {
    pay: number;
    schedule: number;
    location: number;
    skills: number;
    culture: number;
  };
  summary: string;
  flags: string[];
}

// ─── Source Adapters ───

export type SourceType = "api" | "rss" | "scrape";

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  isEnabled: boolean;
}

export interface IngestionResult {
  sourceId: string;
  startedAt: Date;
  completedAt?: Date;
  status: "success" | "partial" | "failed";
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  errors?: string[];
}

// ─── Normalized adapter output ───

export interface RawJobListing {
  sourceUrl: string;
  externalId?: string;
  title: string;
  company?: string;
  location?: string;
  salaryRaw?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryUnit?: SalaryUnit;
  description: string;
  descriptionHtml?: string;
  descriptionQuality?: "full" | "snippet";
  employmentType?: string;
  postedDate?: Date;
}

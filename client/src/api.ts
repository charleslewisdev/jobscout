const BASE = "/api";

// ─── Auth Types ───

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  candidateId?: string;
}

// ─── Core Request ───

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    // Handle 401: clear token and redirect to login (unless already there)
    if (res.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Auth ───

export const login = (email: string, password: string) =>
  request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const fetchMe = () => request<{ user: AuthUser }>("/auth/me");

// Stats
export const fetchStats = () => request<StatsResponse>("/stats");

// My Profile (self-service)
export const fetchMyProfile = () =>
  request<CandidateDetail>("/candidates/me");
export const updateMyProfile = (data: {
  questionnaireData?: Record<string, unknown>;
  notes?: string;
  profileData?: Record<string, unknown>;
}) =>
  request<CandidateDetail>("/candidates/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });

// Candidates
export const fetchCandidates = () => request<CandidateListItem[]>("/candidates");
export const fetchCandidate = (id: string) =>
  request<CandidateDetail>(`/candidates/${id}`);
export const updateCandidate = (id: string, data: Partial<CandidateDetail>) =>
  request<CandidateDetail>(`/candidates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const createCandidate = (data: {
  name: string;
  profileData: Record<string, unknown>;
  questionnaireData?: Record<string, unknown>;
  notes?: string;
}) =>
  request<CandidateDetail>("/candidates", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const deleteCandidate = (id: string) =>
  request<{ deleted: boolean; id: string }>(`/candidates/${id}`, {
    method: "DELETE",
  });
export const toggleCandidateActive = (id: string, isActive: boolean) =>
  request<{ id: string; isActive: boolean }>(`/candidates/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

export const uploadResume = async (candidateId: string, file: File) => {
  const form = new FormData();
  form.append("resume", file);
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/candidates/${candidateId}/resume`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const deleteResume = async (candidateId: string) =>
  request<{ deleted: boolean }>(`/candidates/${candidateId}/resume`, {
    method: "DELETE",
  });

export const generateProfile = (candidateId: string) =>
  request<{ profile: Record<string, unknown> }>(
    `/candidates/${candidateId}/generate-profile`,
    { method: "POST" }
  );

// Matches
export const fetchMatches = (params?: MatchQueryParams) => {
  const sp = new URLSearchParams();
  if (params?.candidateId) sp.set("candidateId", params.candidateId);
  if (params?.status) sp.set("status", params.status);
  if (params?.minConfidence !== undefined)
    sp.set("minConfidence", String(params.minConfidence));
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  if (params?.includeExpired) sp.set("includeExpired", "true");
  const qs = sp.toString();
  return request<MatchListResponse>(`/matches${qs ? `?${qs}` : ""}`);
};
export const fetchMatch = (id: string) =>
  request<MatchDetail>(`/matches/${id}`);
export const updateMatchStatus = (id: string, status: string) =>
  request<{ id: string; status: string }>(`/matches/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
export const bulkUpdateStatus = (ids: string[], status: string) =>
  request<{ updated: number; status: string }>("/matches/bulk-status", {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });

// Jobs
export const fetchJobs = (params?: { limit?: number; offset?: number }) => {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return request<JobListResponse>(`/jobs${qs ? `?${qs}` : ""}`);
};
export const fetchJob = (id: string) => request<JobDetail>(`/jobs/${id}`);

// Pipeline
export const fetchPipelineStatus = () =>
  request<PipelineStatus>("/pipeline/status");
export const triggerPipeline = (opts?: { candidateIds?: string[] }) =>
  request<{ message: string }>("/pipeline/run", {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
export const triggerStalenessCheck = () =>
  request<{ checked: number; expired: number; active: number; unknown: number; errors: number }>(
    "/pipeline/staleness-check",
    { method: "POST" }
  );

export const updatePipelineConfig = (data: {
  cronExpression?: string;
  enabled?: boolean;
}) =>
  request<{ cronExpression: string; enabled: boolean; nextRun: string | null }>(
    "/pipeline/config",
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );

// Users
export const fetchUsers = () => request<UserListItem[]>("/users");
export const createUser = (data: {
  email: string;
  password: string;
  name: string;
  role: string;
  candidateId?: string;
}) =>
  request<UserListItem>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateUser = (
  id: string,
  data: {
    email?: string;
    name?: string;
    role?: string;
    candidateId?: string;
    password?: string;
  },
) =>
  request<UserListItem>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const deleteUser = (id: string) =>
  request<{ deleted: boolean }>(`/users/${id}`, { method: "DELETE" });

// Sources
export const fetchSources = () => request<SourceItem[]>("/sources");
export const toggleSourceEnabled = (id: string, isEnabled: boolean) =>
  request<{ id: string; isEnabled: boolean }>(`/sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isEnabled }),
  });

// ─── Types ───

export interface StatsResponse {
  candidateCount: number;
  jobCount: number;
  matchCount: number;
  matchesByStatus: Record<string, number>;
  topMatches: MatchSummary[];
  recentMatches: MatchSummary[];
}

export interface MatchSummary {
  id: string;
  confidenceScore: number;
  summary: string;
  status: string;
  createdAt: string;
  jobTitle: string;
  jobCompany: string | null;
  jobSalaryRaw: string | null;
  jobEmploymentType: string | null;
  jobPostedDate: string | null;
  sourceName: string | null;
  candidateName: string;
}

export interface CandidateListItem {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  matchCount: number;
  topScore: number | null;
}

export interface CandidateDetail {
  id: string;
  name: string;
  notes: string | null;
  profileData: Record<string, unknown>;
  questionnaireData: Record<string, unknown> | null;
  resumeOriginalName: string | null;
  resumeUploadedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchQueryParams {
  candidateId?: string;
  status?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
}

export interface MatchListItem {
  id: string;
  jobPostingId: string;
  candidateId: string;
  confidenceScore: number;
  payScore: number | null;
  scheduleScore: number | null;
  locationScore: number | null;
  skillsScore: number | null;
  cultureScore: number | null;
  summary: string | null;
  flags: string[] | null;
  status: string;
  createdAt: string;
  jobTitle: string;
  jobCompany: string | null;
  jobLocation: string | null;
  jobSalaryRaw: string | null;
  jobSalaryMin: number | null;
  jobSalaryMax: number | null;
  jobSalaryUnit: string | null;
  jobEmploymentType: string | null;
  jobPostedDate: string | null;
  jobIsActive: boolean;
  sourceName: string | null;
  candidateName: string;
}

export interface MatchListResponse {
  matches: MatchListItem[];
  total: number;
}

export interface MatchDetail extends MatchListItem {
  modelUsed: string | null;
  updatedAt: string;
  candidateName: string;
  jobPosting: JobDetail;
}

export interface JobListResponse {
  jobs: JobListItem[];
  total: number;
}

export interface JobListItem {
  id: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryRaw: string | null;
  employmentType: string | null;
  postedDate: string | null;
  fetchedDate: string;
  isActive: boolean;
}

export interface JobDetail extends JobListItem {
  externalId: string | null;
  locationParsed: Record<string, unknown> | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnit: string | null;
  description: string;
  descriptionHtml: string | null;
  benefits: string[] | null;
  requirements: string[] | null;
  expiresDate: string | null;
  dedupeHash: string;
  createdAt: string;
}

export interface PipelineStatus {
  isRunning: boolean;
  lastResult: {
    totalFetched: number;
    totalNew: number;
    totalDuplicate: number;
    totalPrefiltered: number;
    totalMatched: number;
    matchesByCandidate: Record<string, { count: number; topScore: number }>;
    errors: string[];
    durationMs: number;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  nextRun: string | null;
  cronExpression: string;
  enabled: boolean;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: string;
  candidateId: string | null;
  candidateName: string | null;
  createdAt: string;
}

export interface SourceItem {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunItems: number | null;
  lastRunErrors: string | null;
  createdAt: string;
  jobCount: number;
  matchCount: number;
  candidateBreakdown: Array<{
    candidateId: string;
    candidateName: string;
    matchCount: number;
    avgScore: number;
    topScore: number;
  }>;
}

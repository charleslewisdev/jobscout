import type { CandidateProfile, RawJobListing } from "@shared/types.js";

function isRemoteOrHybrid(location: string): boolean {
  const lower = location.toLowerCase();
  return lower.includes("remote") || lower.includes("hybrid");
}

function matchesLocation(
  posting: RawJobListing,
  profile: CandidateProfile
): boolean {
  const areas = profile.location?.acceptableAreas;
  if (!areas || areas.length === 0) return true;
  if (!posting.location) return true;
  if (isRemoteOrHybrid(posting.location)) return true;

  const postingLoc = posting.location.toLowerCase();
  return areas.some((area) => postingLoc.includes(area.toLowerCase()));
}

function hitsDealbreaker(
  posting: RawJobListing,
  profile: CandidateProfile
): boolean {
  if (!profile.dealbreakers || profile.dealbreakers.length === 0) return false;

  const text =
    `${posting.title} ${posting.description}`.toLowerCase();
  return profile.dealbreakers.some((db) =>
    text.includes(db.toLowerCase())
  );
}

function matchesExclusion(
  posting: RawJobListing,
  profile: CandidateProfile
): boolean {
  const titleLower = posting.title.toLowerCase();
  const descLower = posting.description.toLowerCase();

  const excludeRoles = profile.preferences?.excludeRoles ?? [];
  for (const role of excludeRoles) {
    if (titleLower.includes(role.toLowerCase())) return true;
  }

  const excludeIndustries =
    profile.preferences?.excludeIndustries ?? [];
  for (const industry of excludeIndustries) {
    if (
      titleLower.includes(industry.toLowerCase()) ||
      descLower.includes(industry.toLowerCase())
    ) {
      return true;
    }
  }

  return false;
}

function hasRelevance(
  posting: RawJobListing,
  profile: CandidateProfile
): boolean {
  const targetRoles = profile.preferences?.targetRoles ?? [];
  const targetIndustries =
    profile.preferences?.targetIndustries ?? [];

  // If the candidate has no preferences, everything is relevant
  if (targetRoles.length === 0 && targetIndustries.length === 0) {
    return true;
  }

  const titleLower = posting.title.toLowerCase();
  const descLower = posting.description.toLowerCase();
  const text = `${titleLower} ${descLower}`;

  // Check if any target role keyword appears in title or description
  for (const role of targetRoles) {
    // Split multi-word roles into individual words for flexible matching
    // e.g., "barista" matches "barista", "event coordinator" matches if both words appear
    const roleWords = role.toLowerCase().split(/\s+/);
    if (roleWords.length === 1) {
      if (text.includes(roleWords[0])) return true;
    } else {
      // For multi-word roles, require all words to appear
      if (roleWords.every((w) => text.includes(w))) return true;
    }
  }

  // Check if any target industry appears
  for (const industry of targetIndustries) {
    if (text.includes(industry.toLowerCase())) return true;
  }

  return false;
}

export function prefilterPosting(
  posting: RawJobListing,
  profile: CandidateProfile
): boolean {
  // 1. Excluded roles/industries — hard reject
  if (matchesExclusion(posting, profile)) return false;

  // 2. Dealbreakers — hard reject
  if (hitsDealbreaker(posting, profile)) return false;

  // 3. Location — hard reject if no match
  if (!matchesLocation(posting, profile)) return false;

  // 4. Relevance — reject if no target role/industry keyword match
  if (!hasRelevance(posting, profile)) return false;

  return true;
}

export function prefilterAgainstAllProfiles(
  posting: RawJobListing,
  profiles: CandidateProfile[]
): CandidateProfile[] {
  return profiles.filter((profile) =>
    prefilterPosting(posting, profile)
  );
}

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type {
  CandidateProfile,
  LLMMatchResponse,
  RawJobListing,
} from "@shared/types.js";

import { logger } from "../utils/logger.js";

const LLMResponseSchema = z.object({
  categoryScores: z.object({
    pay: z.number(),
    schedule: z.number(),
    rolefit: z.number(),
    growth: z.number(),
  }),
  summary: z.string(),
  flags: z.array(z.string()),
});

type LLMRawResponse = z.infer<typeof LLMResponseSchema>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the overall confidence score from weighted category scores.
 * Weights reflect what matters most for initial job screening.
 */
const CATEGORY_WEIGHTS = {
  pay: 0.35,
  rolefit: 0.35,
  schedule: 0.15,
  growth: 0.15,
};

function computeConfidence(scores: LLMRawResponse["categoryScores"]): number {
  const weighted =
    scores.pay * CATEGORY_WEIGHTS.pay +
    scores.rolefit * CATEGORY_WEIGHTS.rolefit +
    scores.schedule * CATEGORY_WEIGHTS.schedule +
    scores.growth * CATEGORY_WEIGHTS.growth;
  return Math.round(clamp(weighted, 0, 100));
}

function buildResult(raw: LLMRawResponse): LLMMatchResponse {
  const clamped = {
    pay: clamp(raw.categoryScores.pay, 0, 100),
    schedule: clamp(raw.categoryScores.schedule, 0, 100),
    rolefit: clamp(raw.categoryScores.rolefit, 0, 100),
    growth: clamp(raw.categoryScores.growth, 0, 100),
  };

  return {
    confidenceScore: computeConfidence(clamped),
    categoryScores: {
      pay: clamped.pay,
      schedule: clamped.schedule,
      // Map new categories back to the DB schema fields
      skills: clamped.rolefit,
      culture: clamped.growth,
      location: 0, // No longer scored by LLM — pre-filter handles location
    },
    summary: raw.summary,
    flags: raw.flags,
  };
}

/**
 * Extract a JSON object from LLM text that may include code fences,
 * trailing explanation text, or other non-JSON content.
 */
function extractJson(text: string): unknown {
  // Strip code fences
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Try parsing as-is first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to extraction
  }

  // Find the first { and match to its closing }
  const start = cleaned.indexOf("{");
  if (start === -1) throw new SyntaxError("No JSON object found in LLM response");

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1));
      }
    }
  }

  throw new SyntaxError("Unclosed JSON object in LLM response");
}

const SYSTEM_PROMPT = `You are a job screening assistant. Evaluate how well a job posting matches a candidate's profile.

Score these 4 categories from 0 to 100. Use the FULL range — a 50 means neutral/unknown, not "decent."

## PAY (0-100)
Anchors — compare the posting's pay to the candidate's stated ranges:
- 0-10: Unpaid, volunteer, stipend, or commission-only
- 10-25: Pay is clearly below the candidate's stated minimum
- 25-40: Pay is slightly below minimum but close
- 40-60: Pay is not stated — score based on role norms (is it likely to meet their range?)
- 60-75: Pay meets the candidate's minimum but is below their preferred range
- 75-90: Pay falls within the candidate's preferred range
- 90-100: Pay exceeds the candidate's preferred range

If salary is listed in different units (annual vs hourly), convert before comparing.
$18/hr ≈ $37,440/yr. $20-28/hr ≈ $41,600-58,240/yr.

## ROLEFIT (0-100)
How well do the candidate's skills and experience match what the job requires?
- 0-20: No meaningful skill overlap
- 20-40: Peripheral overlap only (e.g., customer service for a construction job)
- 40-60: The candidate could do the job but it's a stretch
- 60-80: Good match — the candidate's skills align well with the core requirements
- 80-100: Excellent match — the candidate's primary skills/experience directly apply

Consider BOTH the candidate's professional skills AND their stated target roles.
A barista role is a great rolefit for someone who lists barista as a target role with barista experience.

## SCHEDULE (0-100)
Does the work schedule match the candidate's stated preferences?
- 0-20: Clear mismatch (e.g., candidate wants full-time, job is 10 hrs/week)
- 20-40: Partial mismatch (e.g., rotating shifts when they want predictable)
- 40-60: Not enough info to judge
- 60-80: Likely compatible
- 80-100: Clearly compatible with stated preferences

## GROWTH (0-100)
Career growth potential — does this role advance the candidate's career goals?
- 0-20: Dead-end, no growth, or actively misaligned with career direction
- 20-40: Pays the bills but offers little growth
- 40-60: Some transferable experience
- 60-80: Good stepping stone or skill-building opportunity
- 80-100: Directly advances their primary career goals

## FLAGS
List any concerns as short strings. Focus on:
- Dealbreakers the candidate listed
- Pay significantly below minimum
- Unpaid/volunteer/internship when candidate needs income
- Missing critical information
- Red flags in the posting (suspicious salary, vague description)

## OUTPUT FORMAT
Respond with ONLY valid JSON:
{
  "categoryScores": {
    "pay": <number>,
    "schedule": <number>,
    "rolefit": <number>,
    "growth": <number>
  },
  "summary": "<1-2 sentences: why this is or isn't a good match>",
  "flags": ["<concern>", ...]
}`;

function buildUserMessage(
  posting: RawJobListing,
  profile: CandidateProfile
): string {
  const sections: string[] = [];

  const descriptionNote = posting.descriptionQuality === "snippet"
    ? "\n[Note: This description is a search result snippet, not the full job posting. Score conservatively — avoid high confidence on incomplete information.]"
    : "";

  sections.push(`## Job Posting
Title: ${posting.title}
Company: ${posting.company || "Unknown"}
Location: ${posting.location || "Not specified"}
Salary: ${posting.salaryRaw || "Not specified"}
Employment Type: ${posting.employmentType || "Not specified"}
Description: ${posting.description}${descriptionNote}`);

  // Build a focused candidate summary
  const payInfo = profile.compensation?.payUnit === "hourly"
    ? `Minimum: $${profile.compensation.minimumPay}/hr, Preferred: $${profile.compensation.preferredPayMin}-${profile.compensation.preferredPayMax}/hr`
    : profile.compensation?.payUnit === "annual"
      ? `Minimum: $${profile.compensation.minimumPay}/yr, Preferred: $${profile.compensation.preferredPayMin}-${profile.compensation.preferredPayMax}/yr`
      : "Not specified";

  sections.push(`## Candidate Profile
Name: ${profile.identity.name}
Background: ${profile.identity.notes || "Not specified"}
Pay Requirements: ${payInfo}
Required Benefits: ${profile.benefits?.required?.join(", ") || "None"}
Schedule: ${profile.schedule?.availability || "Not specified"}. ${profile.schedule?.flexibilityNotes || ""}
Remote Preference: ${profile.schedule?.remotePreference || "Any"}
Skills: ${profile.experience?.skills?.join(", ") || "Not specified"}
Certifications: ${profile.experience?.certifications?.join(", ") || "None"}
Experience: ${profile.experience?.yearsOfExperience || "?"} years — ${profile.experience?.summary || ""}
Target Roles: ${profile.preferences?.targetRoles?.join(", ") || "Any"}
Target Industries: ${profile.preferences?.targetIndustries?.join(", ") || "Any"}
Dealbreakers: ${profile.dealbreakers?.join(", ") || "None"}`);

  return sections.join("\n\n");
}

export async function evaluateMatch(
  posting: RawJobListing,
  profile: CandidateProfile,
  client: Anthropic,
  options?: { dryRun?: boolean }
): Promise<LLMMatchResponse | null> {
  if (options?.dryRun) {
    return null;
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserMessage(posting, profile),
        },
      ],
    });

    const textBlock = response.content.find(
      (b) => b.type === "text"
    );
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("LLM: no text block in response");
      return null;
    }

    // Extract JSON from LLM response — handle code fences, trailing text, etc.
    const parsed = extractJson(textBlock.text);
    const validated = LLMResponseSchema.parse(parsed);
    const result = buildResult(validated);
    logger.debug(
      {
        title: posting.title,
        score: result.confidenceScore,
        cats: result.categoryScores,
        summary: result.summary,
      },
      "LLM: evaluation result"
    );
    return result;
  } catch (err) {
    logger.warn({ err }, "LLM: evaluation failed");
    return null;
  }
}

// Exported for testing and reuse
export { extractJson, computeConfidence, CATEGORY_WEIGHTS };

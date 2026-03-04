import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { CandidateProfile } from "@shared/types.js";

import { extractJson } from "../matching/llm.js";
import { logger } from "../utils/logger.js";

// ─── Zod schema for CandidateProfile validation ───

const CandidateProfileSchema = z.object({
  identity: z.object({
    name: z.string(),
    notes: z.string().optional(),
  }),
  compensation: z.object({
    minimumPay: z.number().optional(),
    preferredPayMin: z.number().optional(),
    preferredPayMax: z.number().optional(),
    payUnit: z.enum(["hourly", "annual"]).optional(),
  }),
  benefits: z.object({
    required: z.array(z.string()).optional(),
    niceToHave: z.array(z.string()).optional(),
  }),
  schedule: z.object({
    availability: z.string().optional(),
    hoursPerWeek: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
    remotePreference: z
      .enum(["remote", "hybrid", "onsite", "flexible"])
      .optional(),
    flexibilityNotes: z.string().optional(),
  }),
  location: z.object({
    acceptableAreas: z.array(z.string()).optional(),
    maxCommuteMinutes: z.number().optional(),
    willingToRelocate: z.boolean().optional(),
  }),
  experience: z.object({
    summary: z.string().optional(),
    skills: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    yearsOfExperience: z.number().optional(),
    educationLevel: z.string().optional(),
  }),
  preferences: z.object({
    targetIndustries: z.array(z.string()).optional(),
    targetRoles: z.array(z.string()).optional(),
    excludeIndustries: z.array(z.string()).optional(),
    excludeRoles: z.array(z.string()).optional(),
  }),
  searchKeywords: z.array(z.string()).optional(),
  dealbreakers: z.array(z.string()),
});

// ─── System prompt ───

const SYSTEM_PROMPT = `You are a career profile analyst. Your job is to merge a candidate's questionnaire answers with their resume (if provided) into a structured JSON profile.

## Rules

1. **Questionnaire answers take priority** for subjective/preference fields (pay expectations, schedule preferences, dealbreakers, location preferences, remote preference, target roles/industries, exclusions).
2. **Resume supplements** objective fields (skills, certifications, work history, education level, years of experience).
3. **Normalize and deduplicate skills** — e.g., "Microsoft Excel" and "Excel" should become one entry. Use the more specific name.
4. **Generate searchKeywords** — 5-15 terms that would help find relevant job listings on job boards. Include job titles, skills, and industry terms. These are used as search queries (e.g., Adzuna "what" parameter), so they should be individual keywords or short phrases, not full sentences.
5. **Experience summary** — Write a 1-3 sentence professional summary based on the resume and/or questionnaire answers.
6. If the questionnaire is sparse, infer reasonable values from the resume where possible. Leave fields as null/undefined rather than guessing on subjective preferences.

## Output

Respond with ONLY valid JSON matching this structure (no explanation, no code fences):
{
  "identity": { "name": "<string>", "notes": "<optional background context>" },
  "compensation": { "minimumPay": <number|null>, "preferredPayMin": <number|null>, "preferredPayMax": <number|null>, "payUnit": "<hourly|annual|null>" },
  "benefits": { "required": ["<string>", ...], "niceToHave": ["<string>", ...] },
  "schedule": { "availability": "<string|null>", "hoursPerWeek": { "min": <number|null>, "max": <number|null> }, "remotePreference": "<remote|hybrid|onsite|flexible|null>", "flexibilityNotes": "<string|null>" },
  "location": { "acceptableAreas": ["<string>", ...], "maxCommuteMinutes": <number|null>, "willingToRelocate": <boolean|null> },
  "experience": { "summary": "<string>", "skills": ["<string>", ...], "certifications": ["<string>", ...], "yearsOfExperience": <number|null>, "educationLevel": "<string|null>" },
  "preferences": { "targetIndustries": ["<string>", ...], "targetRoles": ["<string>", ...], "excludeIndustries": ["<string>", ...], "excludeRoles": ["<string>", ...] },
  "searchKeywords": ["<string>", ...],
  "dealbreakers": ["<string>", ...]
}`;

// ─── Content building ───

function formatQuestionnaireText(
  data: Record<string, unknown>
): string {
  const lines: string[] = ["## Questionnaire Answers\n"];

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === "") continue;
    // Format the key as a readable label
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/[_-]/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
    lines.push(
      `**${label}**: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`
    );
  }

  return lines.join("\n");
}

export interface GenerateProfileParams {
  questionnaireData: Record<string, unknown>;
  resumeContent?: { type: "pdf" | "text"; data: string | Buffer };
  candidateName: string;
}

export async function generateCandidateProfile(
  params: GenerateProfileParams,
  client: Anthropic
): Promise<CandidateProfile> {
  const { questionnaireData, resumeContent, candidateName } = params;

  // Build user message content blocks
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  // Add questionnaire as text
  const questionnaireText = formatQuestionnaireText(questionnaireData);
  contentBlocks.push({
    type: "text",
    text: `Candidate name: ${candidateName}\n\n${questionnaireText}`,
  });

  // Add resume if provided
  if (resumeContent) {
    if (resumeContent.type === "pdf") {
      const base64Data =
        resumeContent.data instanceof Buffer
          ? resumeContent.data.toString("base64")
          : resumeContent.data;

      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data,
        },
      } as Anthropic.Messages.DocumentBlockParam);

      contentBlocks.push({
        type: "text",
        text: "The above PDF is the candidate's resume. Use it to supplement the questionnaire answers for skills, experience, certifications, and education.",
      });
    } else {
      // Text/markdown resume
      const textData =
        resumeContent.data instanceof Buffer
          ? resumeContent.data.toString("utf-8")
          : resumeContent.data;

      contentBlocks.push({
        type: "text",
        text: `## Resume\n\n${textData}`,
      });
    }
  }

  contentBlocks.push({
    type: "text",
    text: "Generate the candidate profile JSON now.",
  });

  logger.debug(
    {
      candidateName,
      hasResume: !!resumeContent,
      resumeType: resumeContent?.type,
      questionnaireKeys: Object.keys(questionnaireData),
    },
    "Profile generation: sending to LLM"
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in LLM response");
  }

  // Extract and validate JSON
  const parsed = extractJson(textBlock.text);
  const profile = CandidateProfileSchema.parse(parsed);

  logger.info(
    {
      candidateName,
      skills: profile.experience.skills?.length ?? 0,
      keywords: profile.searchKeywords?.length ?? 0,
      dealbreakers: profile.dealbreakers.length,
    },
    "Profile generation: complete"
  );

  return profile;
}

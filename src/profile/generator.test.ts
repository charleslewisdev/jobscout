import { describe, expect, it, vi } from "vitest";

import { generateCandidateProfile } from "./generator.js";

const VALID_PROFILE = {
  identity: { name: "Jane Doe", notes: "Recent graduate moving to Portland" },
  compensation: {
    minimumPay: 18,
    preferredPayMin: 20,
    preferredPayMax: 28,
    payUnit: "hourly" as const,
  },
  benefits: {
    required: ["health insurance"],
    niceToHave: ["dental", "PTO"],
  },
  schedule: {
    availability: "Full-time",
    hoursPerWeek: { min: 35, max: 40 },
    remotePreference: "flexible" as const,
    flexibilityNotes: "Prefers morning shifts",
  },
  location: {
    acceptableAreas: ["Portland", "Beaverton", "Tigard"],
    maxCommuteMinutes: 45,
    willingToRelocate: true,
  },
  experience: {
    summary:
      "2 years of customer service experience with strong communication skills.",
    skills: [
      "Customer Service",
      "Microsoft Office",
      "Cash Handling",
      "POS Systems",
    ],
    certifications: ["Food Handler's Card"],
    yearsOfExperience: 2,
    educationLevel: "Associate's Degree",
  },
  preferences: {
    targetIndustries: ["food service", "retail", "hospitality"],
    targetRoles: ["barista", "server", "cashier"],
    excludeIndustries: ["telemarketing"],
    excludeRoles: ["door-to-door sales"],
  },
  searchKeywords: [
    "barista",
    "server",
    "cashier",
    "customer service",
    "food service",
    "hospitality",
    "retail associate",
  ],
  dealbreakers: ["commission-only pay", "overnight shifts"],
};

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        usage: { input_tokens: 500, output_tokens: 800 },
      }),
    },
  } as never;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMockCall(client: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).messages.create.mock.calls[0][0];
}

describe("generateCandidateProfile", () => {
  it("generates a profile from questionnaire data only", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    const result = await generateCandidateProfile(
      {
        questionnaireData: {
          targetRoles: "barista, server, cashier",
          minimumPay: "18",
          remotePreference: "flexible",
        },
        candidateName: "Jane Doe",
      },
      client
    );

    expect(result.identity.name).toBe("Jane Doe");
    expect(result.compensation.minimumPay).toBe(18);
    expect(result.experience.skills).toContain("Customer Service");
    expect(result.dealbreakers).toContain("commission-only pay");
    expect(result.searchKeywords).toContain("barista");

    // Verify the API call was made with correct model and content
    const call = getMockCall(client);
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.system).toContain("career profile analyst");
    // User message should contain questionnaire text
    const textBlocks = call.messages[0].content.filter(
      (b: { type: string }) => b.type === "text"
    );
    expect(textBlocks.length).toBeGreaterThanOrEqual(2); // questionnaire + "Generate" prompt
    expect(textBlocks[0].text).toContain("Jane Doe");
    expect(textBlocks[0].text).toContain("barista, server, cashier");
  });

  it("generates a profile from questionnaire + text resume", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    const resumeText =
      "Jane Doe\nExperience: 2 years at Starbucks as barista\nSkills: Latte art, POS systems";

    const result = await generateCandidateProfile(
      {
        questionnaireData: {
          targetRoles: "barista",
          minimumPay: "18",
        },
        resumeContent: { type: "text", data: resumeText },
        candidateName: "Jane Doe",
      },
      client
    );

    expect(result.identity.name).toBe("Jane Doe");

    // Verify the API call includes resume text
    const call = getMockCall(client);
    const textBlocks = call.messages[0].content.filter(
      (b: { type: string }) => b.type === "text"
    );
    const resumeBlock = textBlocks.find((b: { text: string }) =>
      b.text.includes("Resume")
    );
    expect(resumeBlock).toBeDefined();
    expect(resumeBlock.text).toContain("Latte art");
    expect(resumeBlock.text).toContain("Starbucks");
  });

  it("generates a profile from questionnaire + PDF resume", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    const pdfBuffer = Buffer.from("fake pdf content");

    const result = await generateCandidateProfile(
      {
        questionnaireData: { targetRoles: "barista" },
        resumeContent: { type: "pdf", data: pdfBuffer },
        candidateName: "Jane Doe",
      },
      client
    );

    expect(result.identity.name).toBe("Jane Doe");

    // Verify the API call includes a document block for the PDF
    const call = getMockCall(client);
    const docBlock = call.messages[0].content.find(
      (b: { type: string }) => b.type === "document"
    );
    expect(docBlock).toBeDefined();
    expect(docBlock.source.type).toBe("base64");
    expect(docBlock.source.media_type).toBe("application/pdf");
    expect(docBlock.source.data).toBe(pdfBuffer.toString("base64"));
  });

  it("handles text resume passed as Buffer", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    const resumeBuffer = Buffer.from("Resume content as buffer");

    await generateCandidateProfile(
      {
        questionnaireData: { targetRoles: "barista" },
        resumeContent: { type: "text", data: resumeBuffer },
        candidateName: "Jane Doe",
      },
      client
    );

    const call = getMockCall(client);
    const textBlocks = call.messages[0].content.filter(
      (b: { type: string }) => b.type === "text"
    );
    const resumeBlock = textBlocks.find((b: { text: string }) =>
      b.text.includes("Resume content as buffer")
    );
    expect(resumeBlock).toBeDefined();
  });

  it("validates output against CandidateProfile schema", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    const result = await generateCandidateProfile(
      {
        questionnaireData: { targetRoles: "barista" },
        candidateName: "Jane Doe",
      },
      client
    );

    // All required fields should be present and typed correctly
    expect(typeof result.identity.name).toBe("string");
    expect(Array.isArray(result.dealbreakers)).toBe(true);
    expect(Array.isArray(result.experience.skills)).toBe(true);
    expect(typeof result.compensation.minimumPay).toBe("number");
    expect(["hourly", "annual"]).toContain(result.compensation.payUnit);
    expect(["remote", "hybrid", "onsite", "flexible"]).toContain(
      result.schedule.remotePreference
    );
  });

  it("throws on malformed LLM response (invalid JSON)", async () => {
    const client = makeMockClient("This is not JSON at all {{{");

    await expect(
      generateCandidateProfile(
        {
          questionnaireData: { targetRoles: "barista" },
          candidateName: "Jane Doe",
        },
        client
      )
    ).rejects.toThrow();
  });

  it("throws on Zod validation failure (missing required fields)", async () => {
    // Missing required `dealbreakers` field
    const incomplete = {
      identity: { name: "Jane Doe" },
      compensation: {},
      benefits: {},
      schedule: {},
      location: {},
      experience: {},
      preferences: {},
    };
    const client = makeMockClient(JSON.stringify(incomplete));

    await expect(
      generateCandidateProfile(
        {
          questionnaireData: { targetRoles: "barista" },
          candidateName: "Jane Doe",
        },
        client
      )
    ).rejects.toThrow();
  });

  it("throws when LLM returns no text block", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
        }),
      },
    } as never;

    await expect(
      generateCandidateProfile(
        {
          questionnaireData: { targetRoles: "barista" },
          candidateName: "Jane Doe",
        },
        client
      )
    ).rejects.toThrow("No text block in LLM response");
  });

  it("throws on API error", async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("API rate limited")),
      },
    } as never;

    await expect(
      generateCandidateProfile(
        {
          questionnaireData: { targetRoles: "barista" },
          candidateName: "Jane Doe",
        },
        client
      )
    ).rejects.toThrow("API rate limited");
  });

  it("handles response wrapped in code fences", async () => {
    const wrapped =
      "```json\n" + JSON.stringify(VALID_PROFILE) + "\n```";
    const client = makeMockClient(wrapped);

    const result = await generateCandidateProfile(
      {
        questionnaireData: { targetRoles: "barista" },
        candidateName: "Jane Doe",
      },
      client
    );

    expect(result.identity.name).toBe("Jane Doe");
    expect(result.dealbreakers).toEqual([
      "commission-only pay",
      "overnight shifts",
    ]);
  });

  it("skips empty questionnaire values in prompt text", async () => {
    const client = makeMockClient(JSON.stringify(VALID_PROFILE));

    await generateCandidateProfile(
      {
        questionnaireData: {
          targetRoles: "barista",
          emptyField: "",
          nullField: null,
          undefinedField: undefined,
          filledField: "has value",
        },
        candidateName: "Jane Doe",
      },
      client
    );

    const call = getMockCall(client);
    const firstTextBlock = call.messages[0].content[0];
    expect(firstTextBlock.text).toContain("barista");
    expect(firstTextBlock.text).toContain("has value");
    expect(firstTextBlock.text).not.toContain("Empty Field");
    expect(firstTextBlock.text).not.toContain("Null Field");
  });
});

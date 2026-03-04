import { describe, expect, it, vi } from "vitest";

import { makePosting, makeProfile } from "../test-helpers.js";
import { CATEGORY_WEIGHTS, computeConfidence, evaluateMatch, extractJson } from "./llm.js";

const VALID_RESPONSE = {
  categoryScores: {
    pay: 80,
    schedule: 70,
    rolefit: 65,
    growth: 60,
  },
  summary: "Good match for warehouse position.",
  flags: ["no benefits info"],
};

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as never;
}

describe("evaluateMatch", () => {
  it("parses valid JSON response and computes weighted confidence", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).not.toBeNull();
    // Weighted: pay(80×0.35) + rolefit(65×0.35) + sched(70×0.15) + growth(60×0.15)
    // = 28 + 22.75 + 10.5 + 9 = 70.25 → 70
    expect(result!.confidenceScore).toBe(70);
    expect(result!.categoryScores.pay).toBe(80);
    // rolefit maps to skills in the DB schema
    expect(result!.categoryScores.skills).toBe(65);
    // growth maps to culture in the DB schema
    expect(result!.categoryScores.culture).toBe(60);
    expect(result!.summary).toBe(
      "Good match for warehouse position."
    );
    expect(result!.flags).toEqual(["no benefits info"]);
  });

  it("returns null for malformed JSON", async () => {
    const client = makeMockClient("not valid json {{{");
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).toBeNull();
  });

  it("returns null when Zod validation fails", async () => {
    const client = makeMockClient(
      JSON.stringify({ categoryScores: { pay: 75 } })
    );
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).toBeNull();
  });

  it("clamps scores out of range to 0-100", async () => {
    const response = {
      ...VALID_RESPONSE,
      categoryScores: {
        pay: -10,
        schedule: 70,
        rolefit: 200,
        growth: 60,
      },
    };
    const client = makeMockClient(JSON.stringify(response));
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).not.toBeNull();
    expect(result!.categoryScores.pay).toBe(0);
    expect(result!.categoryScores.skills).toBe(100); // rolefit → skills
    // Confidence: 0×0.35 + 100×0.35 + 70×0.15 + 60×0.15 = 0 + 35 + 10.5 + 9 = 54.5 → 55
    expect(result!.confidenceScore).toBe(55);
  });

  it("constructs prompt with posting and profile details", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting({
      title: "Forklift Operator",
      company: "PDX Freight",
    });
    const profile = makeProfile({
      identity: { name: "Test User" },
    });

    await evaluateMatch(posting, profile, client);

    const call = (client as any).messages.create.mock.calls[0][0];
    expect(call.system).toContain("job screening");
    expect(call.messages[0].content).toContain("Forklift Operator");
    expect(call.messages[0].content).toContain("PDX Freight");
    expect(call.messages[0].content).toContain("Test User");
  });

  it("skips API call in dry-run mode", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client, {
      dryRun: true,
    });

    expect(result).toBeNull();
    expect(
      (client as any).messages.create
    ).not.toHaveBeenCalled();
  });

  it("returns null on API error", async () => {
    const client = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(new Error("API error")),
      },
    } as never;
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).toBeNull();
  });

  it("strips code fences from LLM response", async () => {
    const wrapped = "```json\n" + JSON.stringify(VALID_RESPONSE) + "\n```";
    const client = makeMockClient(wrapped);
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).not.toBeNull();
    expect(result!.confidenceScore).toBe(70);
  });

  it("adds snippet note to prompt when descriptionQuality is 'snippet'", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting({
      descriptionQuality: "snippet" as const,
    });
    const profile = makeProfile();

    await evaluateMatch(posting, profile, client);

    const content = (client as any).messages.create.mock.calls[0][0].messages[0].content;
    expect(content).toContain("search result snippet");
    expect(content).toContain("Score conservatively");
  });

  it("does not add snippet note for full descriptions", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting(); // no descriptionQuality set
    const profile = makeProfile();

    await evaluateMatch(posting, profile, client);

    const content = (client as any).messages.create.mock.calls[0][0].messages[0].content;
    expect(content).not.toContain("search result snippet");
  });

  it("includes candidate pay details and dealbreakers in prompt", async () => {
    const client = makeMockClient(JSON.stringify(VALID_RESPONSE));
    const posting = makePosting();
    const profile = makeProfile({
      compensation: { minimumPay: 18, preferredPayMin: 20, preferredPayMax: 28, payUnit: "hourly" },
      dealbreakers: ["commission-only pay", "unpaid internship"],
    });

    await evaluateMatch(posting, profile, client);

    const content = (client as any).messages.create.mock.calls[0][0].messages[0].content;
    expect(content).toContain("$18/hr");
    expect(content).toContain("$20-28/hr");
    expect(content).toContain("commission-only pay");
    expect(content).toContain("unpaid internship");
  });
});

describe("computeConfidence", () => {
  it("weights pay and rolefit highest", () => {
    // Same total points, but concentrated in pay/rolefit vs schedule/growth
    const highPriority = computeConfidence({ pay: 100, rolefit: 100, schedule: 0, growth: 0 });
    const lowPriority = computeConfidence({ pay: 0, rolefit: 0, schedule: 100, growth: 100 });

    // pay+rolefit = 0.35+0.35 = 70% weight
    expect(highPriority).toBe(70);
    // schedule+growth = 0.15+0.15 = 30% weight
    expect(lowPriority).toBe(30);
  });

  it("returns 100 for perfect scores", () => {
    expect(computeConfidence({ pay: 100, rolefit: 100, schedule: 100, growth: 100 })).toBe(100);
  });

  it("returns 0 for zero scores", () => {
    expect(computeConfidence({ pay: 0, rolefit: 0, schedule: 0, growth: 0 })).toBe(0);
  });

  it("weights sum to 1.0", () => {
    const sum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});

describe("evaluateMatch edge cases", () => {
  it("returns null when response has no text block (only tool_use)", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "some_tool",
              input: { key: "value" },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    } as never;
    const posting = makePosting();
    const profile = makeProfile();

    const result = await evaluateMatch(posting, profile, client);

    expect(result).toBeNull();
  });
});

describe("extractJson edge cases", () => {
  it("throws SyntaxError when text has no opening brace", () => {
    expect(() => extractJson("no json here at all")).toThrow(SyntaxError);
    expect(() => extractJson("no json here at all")).toThrow(
      "No JSON object found"
    );
  });

  it("throws SyntaxError for unclosed JSON object", () => {
    expect(() => extractJson('{"key": "value"')).toThrow(SyntaxError);
    expect(() => extractJson('{"key": "value"')).toThrow(
      "Unclosed JSON object"
    );
  });

  it("extracts JSON from text with trailing content", () => {
    const json = JSON.stringify(VALID_RESPONSE);
    const text = `Here is the result: ${json} and some more text after`;
    const result = extractJson(text);
    expect(result).toEqual(VALID_RESPONSE);
  });
});

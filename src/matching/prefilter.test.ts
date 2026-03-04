import { describe, expect, it } from "vitest";

import { makePosting, makeProfile } from "../test-helpers.js";
import {
  prefilterPosting,
  prefilterAgainstAllProfiles,
} from "./prefilter.js";

describe("prefilterPosting", () => {
  it("passes when location matches an acceptable area", () => {
    const posting = makePosting({ location: "Portland, OR" });
    const profile = makeProfile({
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("fails when location does not match any acceptable area", () => {
    const posting = makePosting({ location: "Seattle, WA" });
    const profile = makeProfile({
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("passes remote postings regardless of location preference", () => {
    const posting = makePosting({ location: "Remote" });
    const profile = makeProfile({
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("passes hybrid postings regardless of location preference", () => {
    const posting = makePosting({ location: "Hybrid - Portland, OR" });
    const profile = makeProfile({
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("fails when posting description contains a dealbreaker", () => {
    const posting = makePosting({
      description: "This is a commission-only sales position.",
    });
    const profile = makeProfile({
      dealbreakers: ["commission-only"],
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("fails when posting title contains a dealbreaker", () => {
    const posting = makePosting({
      title: "MLM Sales Representative",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      dealbreakers: ["MLM"],
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("fails when title matches an excluded role", () => {
    const posting = makePosting({
      title: "Telemarketing Agent",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: {
        targetRoles: ["warehouse worker"],
        excludeRoles: ["telemarketing agent"],
      },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("fails when description matches an excluded industry", () => {
    const posting = makePosting({
      description: "Join our door-to-door sales team!",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: {
        targetRoles: ["warehouse worker"],
        excludeIndustries: ["door-to-door sales"],
      },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("passes when no location info on posting (let LLM decide)", () => {
    const posting = makePosting({ location: undefined });
    const profile = makeProfile({
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("rejects when no target role or industry keywords match", () => {
    const posting = makePosting({
      title: "General Worker",
      description: "A general position with various duties.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: {
        targetRoles: ["warehouse worker"],
        targetIndustries: ["logistics"],
      },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("passes when a target role keyword appears in title", () => {
    const posting = makePosting({
      title: "Barista - Coffee Shop",
      description: "Make great coffee.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: { targetRoles: ["barista"] },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("passes when a target industry keyword appears in description", () => {
    const posting = makePosting({
      title: "Studio Technician",
      description: "Join our audio production team mixing live recordings.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: { targetIndustries: ["audio production"] },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("matches multi-word roles when all words appear in text", () => {
    const posting = makePosting({
      title: "Coordinator for Events",
      description: "Manage event planning and logistics.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: { targetRoles: ["event coordinator"] },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("rejects multi-word role when only some words appear", () => {
    const posting = makePosting({
      title: "Event Photographer",
      description: "Take photos at events.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: { targetRoles: ["event coordinator"] },
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });

  it("passes all postings when profile has no target roles or industries", () => {
    const posting = makePosting({
      title: "Random Job",
      description: "Doing random things.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      preferences: {},
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("passes when profile has no location preferences", () => {
    const posting = makePosting({ location: "Seattle, WA" });
    const profile = makeProfile({ location: {} });

    expect(prefilterPosting(posting, profile)).toBe(true);
  });

  it("is case-insensitive for dealbreaker matching", () => {
    const posting = makePosting({
      description: "This is a COMMISSION-ONLY position.",
      location: "Portland, OR",
    });
    const profile = makeProfile({
      dealbreakers: ["commission-only"],
      location: { acceptableAreas: ["Portland"] },
    });

    expect(prefilterPosting(posting, profile)).toBe(false);
  });
});

describe("prefilterAgainstAllProfiles", () => {
  it("returns profiles that passed the filter", () => {
    const posting = makePosting({ location: "Portland, OR" });
    const profiles = [
      makeProfile({
        identity: { name: "Match" },
        location: { acceptableAreas: ["Portland"] },
      }),
      makeProfile({
        identity: { name: "No Match" },
        location: { acceptableAreas: ["Seattle"] },
      }),
    ];

    const result = prefilterAgainstAllProfiles(posting, profiles);

    expect(result).toHaveLength(1);
    expect(result[0].identity.name).toBe("Match");
  });

  it("returns empty array when no profiles match", () => {
    const posting = makePosting({ location: "Seattle, WA" });
    const profiles = [
      makeProfile({ location: { acceptableAreas: ["Portland"] } }),
    ];

    const result = prefilterAgainstAllProfiles(posting, profiles);

    expect(result).toHaveLength(0);
  });

  it("returns all profiles when all match", () => {
    const posting = makePosting({ location: "Portland, OR" });
    const profiles = [
      makeProfile({
        identity: { name: "A" },
        location: { acceptableAreas: ["Portland"] },
      }),
      makeProfile({
        identity: { name: "B" },
        location: { acceptableAreas: ["Portland"] },
      }),
    ];

    const result = prefilterAgainstAllProfiles(posting, profiles);

    expect(result).toHaveLength(2);
  });
});

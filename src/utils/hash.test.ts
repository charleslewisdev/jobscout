import { describe, expect, it } from "vitest";

import { computeDedupeHash } from "./hash.js";

describe("computeDedupeHash", () => {
  it("produces consistent hash for same input", () => {
    const a = computeDedupeHash("Warehouse Worker", "Acme", "Portland, OR");
    const b = computeDedupeHash("Warehouse Worker", "Acme", "Portland, OR");
    expect(a).toBe(b);
  });

  it("normalizes case and whitespace", () => {
    const a = computeDedupeHash("Warehouse Worker", "Acme", "Portland, OR");
    const b = computeDedupeHash(
      "warehouse worker",
      "  acme  ",
      "portland, or"
    );
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = computeDedupeHash("Warehouse Worker", "Acme", "Portland, OR");
    const b = computeDedupeHash("Line Cook", "Acme", "Portland, OR");
    expect(a).not.toBe(b);
  });

  it("handles missing company and location", () => {
    const hash = computeDedupeHash("Job Title", undefined, undefined);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
  });
});

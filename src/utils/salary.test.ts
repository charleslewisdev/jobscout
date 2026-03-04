import { describe, expect, it } from "vitest";

import { normalizeToAnnual, parseSalaryRaw } from "./salary.js";

describe("parseSalaryRaw", () => {
  it("parses annual range without unit indicator", () => {
    const result = parseSalaryRaw("$35000-$42000");
    expect(result).toEqual({ min: 35000, max: 42000, unit: "annual" });
  });

  it("parses hourly range with /hour", () => {
    const result = parseSalaryRaw("$18.00-$22.00/hour");
    expect(result).toEqual({ min: 18, max: 22, unit: "hourly" });
  });

  it("parses single hourly value with /hr", () => {
    const result = parseSalaryRaw("$18.50/hr");
    expect(result).toEqual({ min: 18.5, max: 18.5, unit: "hourly" });
  });

  it("parses annual range with commas and Annually keyword", () => {
    const result = parseSalaryRaw("$35,000 - $48,500 Annually");
    expect(result).toEqual({ min: 35000, max: 48500, unit: "annual" });
  });

  it("strips prefix text like 'Salary Range:'", () => {
    const result = parseSalaryRaw("Salary Range: $52,000 - $65,000");
    expect(result).toEqual({ min: 52000, max: 65000, unit: "annual" });
  });

  it("returns empty object for empty string", () => {
    expect(parseSalaryRaw("")).toEqual({});
  });

  it("returns empty object for garbage input", () => {
    expect(parseSalaryRaw("not a salary")).toEqual({});
  });

  it("returns empty object for undefined-like inputs", () => {
    expect(parseSalaryRaw("N/A")).toEqual({});
    expect(parseSalaryRaw("DOE")).toEqual({});
    expect(parseSalaryRaw("Competitive")).toEqual({});
  });

  it("detects hourly keyword", () => {
    const result = parseSalaryRaw("$20 hourly");
    expect(result).toEqual({ min: 20, max: 20, unit: "hourly" });
  });

  it("detects annual keyword /yr", () => {
    const result = parseSalaryRaw("$50000/yr");
    expect(result).toEqual({ min: 50000, max: 50000, unit: "annual" });
  });

  it("detects annual keyword /year", () => {
    const result = parseSalaryRaw("$60000/year");
    expect(result).toEqual({ min: 60000, max: 60000, unit: "annual" });
  });

  it("detects annual keyword 'annual'", () => {
    const result = parseSalaryRaw("$55000 annual");
    expect(result).toEqual({ min: 55000, max: 55000, unit: "annual" });
  });

  it("detects monthly keyword /mo", () => {
    const result = parseSalaryRaw("$4000/mo");
    expect(result).toEqual({ min: 4000, max: 4000, unit: "monthly" });
  });

  it("detects monthly keyword /month", () => {
    const result = parseSalaryRaw("$3500-$4500/month");
    expect(result).toEqual({ min: 3500, max: 4500, unit: "monthly" });
  });

  it("detects monthly keyword 'monthly'", () => {
    const result = parseSalaryRaw("$4000 monthly");
    expect(result).toEqual({ min: 4000, max: 4000, unit: "monthly" });
  });

  it("uses heuristic: values < 200 → hourly", () => {
    const result = parseSalaryRaw("$25");
    expect(result).toEqual({ min: 25, max: 25, unit: "hourly" });
  });

  it("uses heuristic: values >= 1000 → annual", () => {
    const result = parseSalaryRaw("$50000");
    expect(result).toEqual({ min: 50000, max: 50000, unit: "annual" });
  });

  it("handles range with 'to' separator", () => {
    const result = parseSalaryRaw("$18 to $22/hr");
    expect(result).toEqual({ min: 18, max: 22, unit: "hourly" });
  });

  it("handles decimal values in ranges", () => {
    const result = parseSalaryRaw("$15.75-$19.25/hour");
    expect(result).toEqual({ min: 15.75, max: 19.25, unit: "hourly" });
  });

  it("returns empty for ambiguous range (200-999 without unit)", () => {
    expect(parseSalaryRaw("$500")).toEqual({});
  });

  it("ignores grade numbers when dollar amounts present", () => {
    expect(parseSalaryRaw("Grade 12: $52,000 - $65,000")).toEqual({
      min: 52000,
      max: 65000,
      unit: "annual",
    });
  });
});

describe("normalizeToAnnual", () => {
  it("converts hourly to annual (× 2080)", () => {
    const result = normalizeToAnnual({ min: 20, max: 30, unit: "hourly" });
    // average of 20 and 30 = 25, × 2080 = 52000
    expect(result).toBe(52000);
  });

  it("converts monthly to annual (× 12)", () => {
    const result = normalizeToAnnual({ min: 4000, max: 5000, unit: "monthly" });
    // average of 4000 and 5000 = 4500, × 12 = 54000
    expect(result).toBe(54000);
  });

  it("returns annual as-is (average of min/max)", () => {
    const result = normalizeToAnnual({
      min: 50000,
      max: 60000,
      unit: "annual",
    });
    expect(result).toBe(55000);
  });

  it("handles single value (min === max)", () => {
    const result = normalizeToAnnual({
      min: 18.5,
      max: 18.5,
      unit: "hourly",
    });
    // 18.5 × 2080 = 38480
    expect(result).toBe(38480);
  });

  it("returns null for empty parsed salary", () => {
    expect(normalizeToAnnual({})).toBeNull();
  });

  it("returns null when no unit is provided", () => {
    expect(normalizeToAnnual({ min: 50000, max: 60000 })).toBeNull();
  });

  it("returns null when no numbers are provided", () => {
    expect(normalizeToAnnual({ unit: "annual" })).toBeNull();
  });

  it("uses min when only min is provided", () => {
    const result = normalizeToAnnual({ min: 50000, unit: "annual" });
    expect(result).toBe(50000);
  });

  it("uses max when only max is provided", () => {
    const result = normalizeToAnnual({ max: 60000, unit: "annual" });
    expect(result).toBe(60000);
  });
});

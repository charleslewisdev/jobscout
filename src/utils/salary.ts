import type { SalaryUnit } from "@shared/types.js";

export interface ParsedSalary {
  min?: number;
  max?: number;
  unit?: SalaryUnit;
}

/**
 * Parse a raw salary string into structured min/max/unit.
 *
 * Handles formats from all source adapters:
 * - "$35000-$42000"
 * - "$18.00-$22.00/hour"
 * - "$18.50/hr"
 * - "$35,000 - $48,500 Annually"
 * - "Salary Range: $52,000 - $65,000"
 */
export function parseSalaryRaw(raw: string): ParsedSalary {
  if (!raw || !raw.trim()) return {};

  // Prefer numbers that follow a $ sign to avoid capturing stray numbers (e.g., "Grade 12")
  const dollarMatches = Array.from(
    raw.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)/g),
    (m) => m[1].replace(/,/g, "")
  );

  let parsed: number[];
  if (dollarMatches.length > 0) {
    parsed = dollarMatches.map(Number);
  } else {
    // Fallback: extract all numbers (for strings without $ signs)
    const cleaned = raw.replace(/[$,]/g, "");
    const numbers = cleaned.match(/\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length === 0) return {};
    parsed = numbers.map(Number);
  }

  // Detect unit from original string (case-insensitive)
  const unit = detectUnit(raw, parsed);
  if (!unit) return {};

  if (parsed.length === 1) {
    return { min: parsed[0], max: parsed[0], unit };
  }

  // Use first two numbers as min and max
  return { min: parsed[0], max: parsed[1], unit };
}

function detectUnit(
  raw: string,
  values: number[]
): SalaryUnit | undefined {
  const lower = raw.toLowerCase();

  // Explicit hourly indicators
  if (/\/hr\b/.test(lower) || /\/hour\b/.test(lower) || /\bhourly\b/.test(lower)) {
    return "hourly";
  }

  // Explicit annual indicators
  if (
    /\/yr\b/.test(lower) ||
    /\/year\b/.test(lower) ||
    /\bannual(ly)?\b/.test(lower)
  ) {
    return "annual";
  }

  // Explicit monthly indicators
  if (/\/mo\b/.test(lower) || /\/month\b/.test(lower) || /\bmonthly\b/.test(lower)) {
    return "monthly";
  }

  // Heuristic fallback based on value magnitude
  // Use the first (or largest) value for the heuristic
  const representative = Math.max(...values);
  if (representative < 200) return "hourly";
  if (representative >= 1000) return "annual";

  // Ambiguous range (200-999) — could be weekly, biweekly, etc.
  // Return undefined to avoid guessing wrong
  return undefined;
}

/**
 * Normalize a parsed salary to an estimated annual figure.
 *
 * - Hourly: × 2080 (40 hrs/week × 52 weeks)
 * - Monthly: × 12
 * - Annual: as-is
 *
 * Returns the average of min and max. Returns null if insufficient data.
 */
export function normalizeToAnnual(salary: ParsedSalary): number | null {
  const { min, max, unit } = salary;

  if (!unit) return null;
  if (min == null && max == null) return null;

  // At least one of min/max is defined (checked above)
  const avg = min != null && max != null ? (min + max) / 2 : (min ?? max);
  if (avg == null) return null;

  switch (unit) {
    case "hourly":
      return avg * 2080;
    case "monthly":
      return avg * 12;
    case "annual":
      return avg;
  }
}

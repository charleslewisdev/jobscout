import type { PipelineResult } from "../pipeline.js";

export function printPipelineSummary(
  result: PipelineResult
): void {
  const duration = (result.durationMs / 1000).toFixed(1);

  const lines = [
    "",
    "═══ JobScout Pipeline Summary ═══",
    `Duration: ${duration}s`,
    "",
    `Fetched:       ${result.totalFetched} listings`,
    `New:           ${result.totalNew} (${result.totalDuplicate} duplicates)`,
    `Pre-filtered:  ${result.totalPrefiltered} skipped (zero candidate matches)`,
    `LLM evaluated: ${result.totalMatched} matches stored`,
  ];

  const candidateNames = Object.keys(
    result.matchesByCandidate
  );
  if (candidateNames.length > 0) {
    lines.push("");
    lines.push("── Matches by Candidate ──");
    for (const name of candidateNames) {
      const { count, topScore } =
        result.matchesByCandidate[name];
      lines.push(`  ${name}: ${count} matches (top: ${topScore}/100)`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("── Errors ──");
    for (const err of result.errors) {
      lines.push(`  ${err}`);
    }
  } else {
    lines.push("");
    lines.push("── Errors ──");
    lines.push("  (none)");
  }

  lines.push("");

  console.log(lines.join("\n"));
}

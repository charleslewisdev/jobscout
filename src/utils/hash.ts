import { createHash } from "node:crypto";

export function computeDedupeHash(
  title: string,
  company?: string,
  location?: string
): string {
  const normalized = [
    title.toLowerCase().trim(),
    (company || "").toLowerCase().trim(),
    (location || "").toLowerCase().trim(),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

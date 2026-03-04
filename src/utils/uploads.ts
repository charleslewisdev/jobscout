import path from "node:path";

/**
 * Compute the uploads directory based on DATABASE_URL or default data dir.
 * Shared by the API server (index.ts) and route handlers (candidates.ts).
 */
export function getUploadsDir(): string {
  const dataDir = process.env.DATABASE_URL
    ? path.dirname(process.env.DATABASE_URL.replace("file:", ""))
    : path.resolve("data");
  return path.join(dataDir, "uploads");
}

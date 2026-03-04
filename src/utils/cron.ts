/**
 * Parse a cron expression and compute the next run time.
 * Simple implementation for standard 5-field cron (minute hour dom month dow).
 */
export function getNextCronRun(expression: string): string | null {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minuteExpr, hourExpr] = parts;
    const now = new Date();
    const next = new Date(now);

    // Handle simple cases: "0 */6 * * *" style expressions
    if (minuteExpr === "0" && hourExpr.startsWith("*/")) {
      const interval = parseInt(hourExpr.slice(2), 10);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      let nextHour = Math.ceil((currentHour + (currentMinute > 0 ? 1 : 0)) / interval) * interval;

      if (nextHour > 23) {
        next.setDate(next.getDate() + 1);
        nextHour = 0;
      }

      next.setHours(nextHour, 0, 0, 0);
      return next.toISOString();
    }

    // For other patterns, return null (would need a full cron parser)
    return null;
  } catch {
    return null;
  }
}

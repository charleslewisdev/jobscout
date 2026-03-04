import crypto from "node:crypto";

import { eq } from "drizzle-orm";

import type { AppDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { hashPassword } from "./password.js";

export async function bootstrapAdmin(db: AppDb): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    logger.debug("ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin bootstrap");
    return;
  }

  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .get();

  if (existing) {
    logger.info({ email: adminEmail }, "Admin user already exists — skipping bootstrap");
    return;
  }

  const passwordHash = await hashPassword(adminPassword);
  const id = crypto.randomUUID();

  db.insert(users)
    .values({
      id,
      email: adminEmail,
      passwordHash,
      name: "Admin",
      role: "admin",
    })
    .run();

  logger.info({ email: adminEmail, userId: id }, "Admin user created via bootstrap");
}

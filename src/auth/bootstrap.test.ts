import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "../db/schema.js";
import { createTestDb } from "../test-helpers.js";
import { _resetSecret } from "./jwt.js";
import { hashPassword } from "./password.js";
import { bootstrapAdmin } from "./bootstrap.js";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-bootstrap-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

describe("bootstrapAdmin", () => {
  it("creates admin user when ADMIN_EMAIL and ADMIN_PASSWORD are set", async () => {
    const db = createTestDb();
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "secure-password-123");

    await bootstrapAdmin(db);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(1);

    const admin = allUsers[0];
    expect(admin.email).toBe("admin@example.com");
    expect(admin.name).toBe("Admin");
    expect(admin.role).toBe("admin");
    expect(admin.candidateId).toBeNull();
    expect(admin.id).toBeDefined();
    expect(admin.passwordHash).toBeDefined();
    expect(admin.passwordHash).not.toBe("secure-password-123");
  });

  it("skips creation if admin user already exists", async () => {
    const db = createTestDb();
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "secure-password-123");

    // Pre-insert the admin user
    const existingHash = await hashPassword("original-password");
    db.insert(users)
      .values({
        id: "existing-admin",
        email: "admin@example.com",
        passwordHash: existingHash,
        name: "Existing Admin",
        role: "admin",
      })
      .run();

    await bootstrapAdmin(db);

    // Should still have only one user
    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(1);

    // Should be the original user, not overwritten
    const admin = allUsers[0];
    expect(admin.id).toBe("existing-admin");
    expect(admin.name).toBe("Existing Admin");
    expect(admin.passwordHash).toBe(existingHash);
  });

  it("skips bootstrap when ADMIN_EMAIL is not set", async () => {
    const db = createTestDb();
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_PASSWORD", "some-password");

    await bootstrapAdmin(db);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(0);
  });

  it("skips bootstrap when ADMIN_PASSWORD is not set", async () => {
    const db = createTestDb();
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "");

    await bootstrapAdmin(db);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(0);
  });

  it("skips bootstrap when neither env var is set", async () => {
    const db = createTestDb();
    // Make sure env vars are cleared
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_PASSWORD", "");

    await bootstrapAdmin(db);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(0);
  });

  it("can be called multiple times safely (idempotent)", async () => {
    const db = createTestDb();
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD", "secure-password-123");

    await bootstrapAdmin(db);
    await bootstrapAdmin(db);
    await bootstrapAdmin(db);

    const allUsers = db.select().from(users).all();
    expect(allUsers).toHaveLength(1);
  });
});

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSecret, signToken } from "../../auth/jwt.js";
import { requireAuth, requireAdmin } from "../../auth/middleware.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { candidates, users } from "../../db/schema.js";
import { createTestDb } from "../../test-helpers.js";
import { usersRouter } from "./users.js";

// Use stable JWT secret for tests
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-users-route-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

function createApp(db: ReturnType<typeof createTestDb>) {
  const app = express();
  app.use(express.json());
  // Simulate the auth wall + requireAdmin as in production
  app.use("/api/users", requireAuth, requireAdmin, usersRouter(db));
  return app;
}

function adminToken(userId = "admin-1") {
  return signToken({ userId, role: "admin" });
}

async function seedUser(
  db: ReturnType<typeof createTestDb>,
  overrides: Partial<{
    id: string;
    email: string;
    password: string;
    name: string;
    role: string;
    candidateId: string | null;
  }> = {}
) {
  const password = overrides.password ?? "test-password-123";
  const passwordHash = await hashPassword(password);

  db.insert(users)
    .values({
      id: overrides.id ?? "user-1",
      email: overrides.email ?? "test@example.com",
      passwordHash,
      name: overrides.name ?? "Test User",
      role: overrides.role ?? "user",
      candidateId: overrides.candidateId ?? null,
    })
    .run();

  return { password };
}

function seedCandidate(
  db: ReturnType<typeof createTestDb>,
  overrides: { id?: string; name?: string } = {}
) {
  db.insert(candidates)
    .values({
      id: overrides.id ?? "cand-1",
      name: overrides.name ?? "Jane Doe",
      profileData: JSON.stringify({ identity: { name: overrides.name ?? "Jane Doe" } }),
    })
    .run();
}

describe("GET /api/users", () => {
  it("returns users with candidateName from join", async () => {
    const db = createTestDb();
    const app = createApp(db);

    // Seed admin performing the request
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    // Seed candidate and a user linked to them
    seedCandidate(db, { id: "cand-1", name: "Jane Doe" });
    await seedUser(db, {
      id: "user-2",
      email: "jane@test.com",
      name: "Jane",
      role: "user",
      candidateId: "cand-1",
    });

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const jane = res.body.find((u: { id: string }) => u.id === "user-2");
    expect(jane).toBeDefined();
    expect(jane.candidateName).toBe("Jane Doe");
    expect(jane.email).toBe("jane@test.com");

    // User without candidate should have null candidateName
    const admin = res.body.find((u: { id: string }) => u.id === "admin-1");
    expect(admin.candidateName).toBeNull();

    // Should not include passwordHash
    for (const user of res.body) {
      expect(user.passwordHash).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
    }
  });
});

describe("POST /api/users", () => {
  it("creates user with valid data and returns user (no passwordHash)", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({
        email: "new@example.com",
        password: "secure-pass-123",
        name: "New User",
        role: "user",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe("new@example.com");
    expect(res.body.name).toBe("New User");
    expect(res.body.role).toBe("user");
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();

    // Must not include password hash
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    // Verify password was actually hashed in DB
    const dbUser = db.select().from(users).all().find((u) => u.email === "new@example.com");
    expect(dbUser).toBeDefined();
    expect(await verifyPassword("secure-pass-123", dbUser!.passwordHash)).toBe(true);
  });

  it("returns 400 for duplicate email", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });
    await seedUser(db, { id: "existing-1", email: "taken@example.com" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({
        email: "taken@example.com",
        password: "password123",
        name: "Duplicate",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email already in use");
  });

  it("returns 400 when email is missing", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ password: "pass", name: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email is required");
  });

  it("returns 400 when password is missing", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ email: "new@example.com", name: "Test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("password is required");
  });

  it("defaults role to 'user' when not provided", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({
        email: "default@example.com",
        password: "password123",
        name: "Default Role",
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("user");
  });
});

describe("PUT /api/users/:id", () => {
  it("updates only provided fields", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });
    await seedUser(db, { id: "target-1", email: "target@test.com", name: "Original Name" });

    const res = await request(app)
      .put("/api/users/target-1")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    expect(res.body.email).toBe("target@test.com"); // unchanged
  });

  it("re-hashes password when provided", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });
    await seedUser(db, { id: "target-1", email: "target@test.com", password: "old-pass" });

    const res = await request(app)
      .put("/api/users/target-1")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ password: "new-pass-456" });

    expect(res.status).toBe(200);
    // Response should not contain passwordHash
    expect(res.body.passwordHash).toBeUndefined();

    // Verify new password works in DB
    const dbUser = db.select().from(users).all().find((u) => u.id === "target-1");
    expect(await verifyPassword("new-pass-456", dbUser!.passwordHash)).toBe(true);
    expect(await verifyPassword("old-pass", dbUser!.passwordHash)).toBe(false);
  });

  it("returns 404 for non-existent user", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .put("/api/users/nonexistent")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  it("sets updatedAt on update", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });
    await seedUser(db, { id: "target-1", email: "target@test.com" });

    const before = db.select().from(users).all().find((u) => u.id === "target-1")!.updatedAt;

    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app)
      .put("/api/users/target-1")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.updatedAt).not.toBe(before);
  });
});

describe("DELETE /api/users/:id", () => {
  it("deletes user and returns success", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });
    await seedUser(db, { id: "target-1", email: "target@test.com" });

    const res = await request(app)
      .delete("/api/users/target-1")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Verify user is gone from DB
    const remaining = db.select().from(users).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("admin-1");
  });

  it("returns 400 when trying to delete self", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .delete("/api/users/admin-1")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Cannot delete your own account");

    // Verify user is still in DB
    const remaining = db.select().from(users).all();
    expect(remaining).toHaveLength(1);
  });

  it("returns 404 for non-existent user", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { id: "admin-1", email: "admin@test.com", role: "admin" });

    const res = await request(app)
      .delete("/api/users/nonexistent")
      .set("Authorization", `Bearer ${adminToken("admin-1")}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });
});

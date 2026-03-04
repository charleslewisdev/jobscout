import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSecret, signToken, verifyToken } from "../../auth/jwt.js";
import { hashPassword } from "../../auth/password.js";
import { users } from "../../db/schema.js";
import { createTestDb } from "../../test-helpers.js";
import { authRouter } from "./auth.js";

// Use stable JWT secret for tests
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-auth-route-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

function createApp(db: ReturnType<typeof createTestDb>) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter(db));
  return app;
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
      role: overrides.role ?? "admin",
      candidateId: overrides.candidateId ?? null,
    })
    .run();

  return { password };
}

describe("POST /api/auth/login", () => {
  it("returns token and user for valid credentials", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, {
      email: "admin@test.com",
      name: "Admin User",
      role: "admin",
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "test-password-123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toEqual({
      id: "user-1",
      name: "Admin User",
      email: "admin@test.com",
      role: "admin",
      candidateId: null,
    });

    // Token should be valid and decodable
    const decoded = verifyToken(res.body.token);
    expect(decoded.userId).toBe("user-1");
    expect(decoded.role).toBe("admin");
  });

  it("returns token with candidateId when user has one", async () => {
    const db = createTestDb();
    const app = createApp(db);

    // Insert a candidate first to satisfy the FK
    db.run(
      db
        .insert(
          (await import("../../db/schema.js")).candidates
        )
        .values({
          id: "cand-1",
          name: "Test Candidate",
          profileData: JSON.stringify({ identity: { name: "Test" } }),
        })
    );

    await seedUser(db, {
      email: "user@test.com",
      role: "user",
      candidateId: "cand-1",
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.com", password: "test-password-123" });

    expect(res.status).toBe(200);
    expect(res.body.user.candidateId).toBe("cand-1");

    const decoded = verifyToken(res.body.token);
    expect(decoded.candidateId).toBe("cand-1");
  });

  it("returns 401 for wrong password", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { email: "admin@test.com" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
    expect(res.body.token).toBeUndefined();
  });

  it("returns 401 for unknown email", async () => {
    const db = createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.com", password: "any-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 400 when email is missing", async () => {
    const db = createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "some-password" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email and password are required");
  });

  it("returns 400 when password is missing", async () => {
    const db = createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email and password are required");
  });

  it("does not include passwordHash in the response", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, { email: "admin@test.com" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "test-password-123" });

    expect(res.status).toBe(200);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });
});

describe("GET /api/auth/me", () => {
  it("returns user from valid token", async () => {
    const db = createTestDb();
    const app = createApp(db);
    await seedUser(db, {
      id: "user-42",
      email: "me@test.com",
      name: "Current User",
      role: "user",
    });

    const token = signToken({ userId: "user-42", role: "user" });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: "user-42",
      name: "Current User",
      email: "me@test.com",
      role: "user",
      candidateId: null,
    });
  });

  it("returns 401 without authorization header", async () => {
    const db = createTestDb();
    const app = createApp(db);

    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authentication required");
  });

  it("returns 401 with invalid token", async () => {
    const db = createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token-here");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid");
  });

  it("returns 404 if user was deleted after token was issued", async () => {
    const db = createTestDb();
    const app = createApp(db);

    // Token references a user that doesn't exist in DB
    const token = signToken({ userId: "deleted-user", role: "admin" });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });
});

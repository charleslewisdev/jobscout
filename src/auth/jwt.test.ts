import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenPayload } from "./jwt.js";
import { _resetSecret, signToken, verifyToken } from "./jwt.js";

// Set a stable secret for tests
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-jwt-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

describe("JWT utilities", () => {
  it("signs and verifies a token round-trip", () => {
    const payload: TokenPayload = {
      userId: "user-123",
      role: "admin",
      candidateId: "cand-456",
    };

    const token = signToken(payload);
    expect(typeof token).toBe("string");

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe("user-123");
    expect(decoded.role).toBe("admin");
    expect(decoded.candidateId).toBe("cand-456");
  });

  it("signs a token without optional candidateId", () => {
    const payload: TokenPayload = { userId: "user-789", role: "user" };

    const token = signToken(payload);
    const decoded = verifyToken(token);

    expect(decoded.userId).toBe("user-789");
    expect(decoded.role).toBe("user");
    expect(decoded.candidateId).toBeUndefined();
  });

  it("rejects an expired token", () => {
    // Sign a token that already expired
    const token = jwt.sign(
      { userId: "user-1", role: "admin" },
      "test-secret-for-jwt-tests",
      { expiresIn: "-1s" }
    );

    expect(() => verifyToken(token)).toThrow();
  });

  it("rejects a token signed with a different secret", () => {
    const token = jwt.sign(
      { userId: "user-1", role: "admin" },
      "different-secret",
      { expiresIn: "7d" }
    );

    expect(() => verifyToken(token)).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => verifyToken("not-a-valid-jwt")).toThrow();
  });
});

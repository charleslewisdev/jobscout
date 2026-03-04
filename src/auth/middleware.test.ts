import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSecret, signToken } from "./jwt.js";
import { requireAdmin, requireAuth } from "./middleware.js";

// Set a stable secret for tests
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-middleware-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers, user: undefined } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response;
}

describe("requireAuth", () => {
  it("attaches user and calls next for a valid token", () => {
    const token = signToken({ userId: "u1", role: "admin" });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe("u1");
    expect(req.user!.role).toBe("admin");
  });

  it("returns 401 when no Authorization header is present", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res as unknown as { body: { error: string } }).body.error).toBe(
      "Authentication required"
    );
  });

  it("returns 401 when Authorization header is not Bearer", () => {
    const req = mockReq({ authorization: "Basic abc123" });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for an invalid token", () => {
    const req = mockReq({ authorization: "Bearer invalid-token" });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(
      (res as unknown as { body: { error: string } }).body.error
    ).toContain("Invalid");
  });
});

describe("requireAdmin", () => {
  it("calls next when user is admin", () => {
    const req = mockReq();
    req.user = { userId: "u1", role: "admin" };
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when user is not admin", () => {
    const req = mockReq();
    req.user = { userId: "u2", role: "user" };
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res as unknown as { body: { error: string } }).body.error).toBe(
      "Admin access required"
    );
  });

  it("returns 403 when no user is attached", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

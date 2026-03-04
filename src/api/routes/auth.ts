import { eq } from "drizzle-orm";
import { Router } from "express";

import { signToken } from "../../auth/jwt.js";
import { requireAuth } from "../../auth/middleware.js";
import { verifyPassword } from "../../auth/password.js";
import type { AppDb } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";

export function authRouter(db: AppDb) {
  const router = Router();

  // POST /api/auth/login — { email, password } → { token, user }
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    try {
      const user = db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const token = signToken({
        userId: user.id,
        role: user.role as "admin" | "user",
        candidateId: user.candidateId ?? undefined,
      });

      logger.info({ userId: user.id, email: user.email }, "User logged in");

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          candidateId: user.candidateId,
        },
      });
    } catch (err) {
      logger.error({ err }, "Login error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/auth/me — requires auth header → returns { user }
  router.get("/me", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const user = db
        .select()
        .from(users)
        .where(eq(users.id, req.user.userId))
        .get();

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          candidateId: user.candidateId,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error fetching current user");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

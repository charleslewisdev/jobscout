import crypto from "node:crypto";

import { Router } from "express";
import { eq } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { hashPassword } from "../../auth/password.js";
import { candidates, users } from "../../db/schema.js";

export function usersRouter(db: AppDb) {
  const router = Router();

  // GET /api/users — list all users (join candidates for name)
  router.get("/", (_req, res) => {
    const rows = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        candidateId: users.candidateId,
        candidateName: candidates.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(candidates, eq(users.candidateId, candidates.id))
      .all();

    res.json(rows);
  });

  // POST /api/users — create user
  router.post("/", async (req, res) => {
    const { email, password, name, role, candidateId } = req.body;

    if (!email || typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "password is required" });
      return;
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // Check duplicate email
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim()))
      .get();

    if (existing) {
      res.status(400).json({ error: "Email already in use" });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);

    db.insert(users)
      .values({
        id,
        email: email.trim(),
        passwordHash,
        name: name.trim(),
        role: role ?? "user",
        candidateId: candidateId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const created = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        candidateId: users.candidateId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .get();

    res.status(201).json(created);
  });

  // PUT /api/users/:id — update user
  router.put("/:id", async (req, res) => {
    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const { email, name, role, candidateId, password } = req.body;

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (email !== undefined) updates.email = email;
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (candidateId !== undefined) updates.candidateId = candidateId;
    if (password && typeof password === "string") {
      updates.passwordHash = await hashPassword(password);
    }

    db.update(users)
      .set(updates)
      .where(eq(users.id, req.params.id))
      .run();

    const updated = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        candidateId: users.candidateId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, req.params.id))
      .get();

    res.json(updated);
  });

  // DELETE /api/users/:id — delete user (prevent self-deletion)
  router.delete("/:id", (req, res) => {
    if (req.user?.userId === req.params.id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    db.delete(users)
      .where(eq(users.id, req.params.id))
      .run();

    res.json({ deleted: true });
  });

  return router;
}

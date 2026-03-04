import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface TokenPayload {
  userId: string;
  role: "admin" | "user";
  candidateId?: string;
}

let jwtSecret: string;

function getSecret(): string {
  if (jwtSecret) return jwtSecret;

  const envSecret = process.env.JWT_SECRET || config.auth.jwtSecret;
  if (envSecret) {
    jwtSecret = envSecret;
  } else {
    jwtSecret = crypto.randomUUID();
    logger.warn(
      "JWT_SECRET not set — generated ephemeral secret. Tokens will not survive restarts."
    );
  }

  return jwtSecret;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret()) as TokenPayload;
}

/**
 * Reset the cached secret. Only used in tests.
 * @internal
 */
export function _resetSecret(): void {
  jwtSecret = "";
}

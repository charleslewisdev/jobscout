import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("hashes and verifies a password correctly", async () => {
    const plain = "correct-horse-battery-staple";
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt hash prefix

    const valid = await verifyPassword(plain, hash);
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("real-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const plain = "same-password";
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);
    expect(hash1).not.toBe(hash2);

    // Both should still verify
    expect(await verifyPassword(plain, hash1)).toBe(true);
    expect(await verifyPassword(plain, hash2)).toBe(true);
  });
});

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, safeEqualHex } from "./secrets";

describe("encrypted secrets", () => {
  it("round trips a token with authenticated encryption", () => {
    const key = randomBytes(32);
    const encrypted = encryptSecret("access-sandbox-secret", key);
    expect(decryptSecret(encrypted, key)).toBe("access-sandbox-secret");
    expect(encrypted.ciphertext).not.toContain("access-sandbox-secret");
  });

  it("rejects ciphertext modified after encryption", () => {
    const key = randomBytes(32);
    const encrypted = encryptSecret("sensitive", key);
    expect(() =>
      decryptSecret(
        { ...encrypted, tag: randomBytes(16).toString("base64") },
        key
      )
    ).toThrow();
  });

  it("compares equal hashes", () => {
    expect(safeEqualHex("aa", "aa")).toBe(true);
    expect(safeEqualHex("aa", "ab")).toBe(false);
  });
});

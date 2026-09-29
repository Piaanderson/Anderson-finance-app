import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  rotateEncryptedSecret,
  safeEqualHex
} from "./secrets";

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

  it("re-encrypts a secret onto the current key version", () => {
    const previousKey = process.env.TOKEN_ENCRYPTION_KEY;
    const previousVersion = process.env.TOKEN_ENCRYPTION_KEY_VERSION;
    const previousV1 = process.env.TOKEN_ENCRYPTION_KEY_V1;
    const keyV1 = randomBytes(32).toString("base64");
    const keyV2 = randomBytes(32).toString("base64");

    try {
      process.env.TOKEN_ENCRYPTION_KEY = keyV1;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
      delete process.env.TOKEN_ENCRYPTION_KEY_V1;
      const encrypted = encryptSecret("access-sandbox-secret");
      expect(encrypted.keyVersion).toBe(1);

      process.env.TOKEN_ENCRYPTION_KEY = keyV2;
      process.env.TOKEN_ENCRYPTION_KEY_V1 = keyV1;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = "2";
      const rotated = rotateEncryptedSecret(encrypted);
      expect(rotated.keyVersion).toBe(2);
      expect(rotated.ciphertext).not.toBe(encrypted.ciphertext);
      expect(decryptSecret(rotated)).toBe("access-sandbox-secret");
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = previousKey;
      process.env.TOKEN_ENCRYPTION_KEY_VERSION = previousVersion;
      if (previousV1 === undefined) delete process.env.TOKEN_ENCRYPTION_KEY_V1;
      else process.env.TOKEN_ENCRYPTION_KEY_V1 = previousV1;
    }
  });
});

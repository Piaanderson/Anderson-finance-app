import { describe, expect, it } from "vitest";
import {
  constantTimeTokenEqual,
  generateRecoveryCodes,
  hashRecoveryCode,
  userHandleMatches
} from "@/server/passkeys/crypto";

describe("passkey crypto helpers", () => {
  it("compares bootstrap tokens without length-dependent comparison", () => {
    expect(constantTimeTokenEqual("correct", "correct")).toBe(true);
    expect(constantTimeTokenEqual("wrong", "correct")).toBe(false);
    expect(constantTimeTokenEqual("", "a much longer token")).toBe(false);
  });

  it("normalizes recovery codes before keyed hashing", () => {
    const secret = "test-secret";
    expect(hashRecoveryCode("ABCDEF-GHIJKL", secret)).toBe(
      hashRecoveryCode("abcdef ghijkl", secret)
    );
    expect(hashRecoveryCode("ABCDEF-GHIJKL", "another-secret")).not.toBe(
      hashRecoveryCode("ABCDEF-GHIJKL", secret)
    );
  });

  it("compares encoded WebAuthn user handles to application user IDs", () => {
    const appUserId = "cmg1234567890123456789012";
    const browserUserHandle = Buffer.from(appUserId, "utf8").toString(
      "base64url"
    );
    expect(browserUserHandle).not.toBe(appUserId);
    expect(userHandleMatches(browserUserHandle, appUserId)).toBe(true);
    expect(userHandleMatches("YWJj", "def")).toBe(false);
  });

  it("generates unique high-entropy display codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code.replaceAll("-", "")).toMatch(/^[A-F0-9]{36}$/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { normalizeManualPosition } from "./manual-accounts";

describe("manual account entry semantics", () => {
  it("stores asset values with the entered economic sign", () => {
    expect(normalizeManualPosition("CASH", 100)).toBe(100);
    expect(normalizeManualPosition("CASH", -25)).toBe(-25);
    expect(normalizeManualPosition("INVESTED", 500)).toBe(500);
    expect(normalizeManualPosition("PROPERTY", 300000)).toBe(300000);
  });

  it("normalizes user-facing debt owed exactly once", () => {
    expect(normalizeManualPosition("DEBT", 2860)).toBe(-2860);
    expect(normalizeManualPosition("DEBT", 0)).toBe(-0);
  });
});

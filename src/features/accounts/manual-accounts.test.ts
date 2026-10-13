import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ManualAccountError,
  normalizeManualPosition,
  withManualAccountTransactionRetry
} from "./manual-accounts";

describe("manual account entry semantics", () => {
  it("stores asset values with the entered economic sign", () => {
    expect(normalizeManualPosition("CASH", "100")).toBe("100.00");
    expect(normalizeManualPosition("CASH", "-25")).toBe("-25.00");
    expect(normalizeManualPosition("INVESTED", "500")).toBe("500.00");
    expect(normalizeManualPosition("PROPERTY", "300000")).toBe("300000.00");
  });

  it("normalizes user-facing debt owed exactly once", () => {
    expect(normalizeManualPosition("DEBT", "2860")).toBe("-2860.00");
    expect(normalizeManualPosition("DEBT", "0")).toBe("0.00");
  });

  it("retries serializable conflicts twice before succeeding", async () => {
    let attempts = 0;
    const result = await withManualAccountTransactionRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Prisma.PrismaClientKnownRequestError("conflict", {
          code: "P2034",
          clientVersion: "test"
        });
      }
      return "linked";
    });

    expect(result).toBe("linked");
    expect(attempts).toBe(3);
  });

  it("returns an honest conflict after bounded retries are exhausted", async () => {
    let attempts = 0;
    await expect(
      withManualAccountTransactionRetry(async () => {
        attempts += 1;
        throw new Prisma.PrismaClientKnownRequestError("conflict", {
          code: "P2034",
          clientVersion: "test"
        });
      })
    ).rejects.toThrow(ManualAccountError);
    expect(attempts).toBe(3);
  });
});

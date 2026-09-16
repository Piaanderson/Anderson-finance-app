import { describe, expect, it } from "vitest";
import { nextThrottleDecision } from "@/server/passkeys/throttle";

describe("nextThrottleDecision", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("allows attempts through the configured limit", () => {
    const decision = nextThrottleDecision(
      {
        attempts: 4,
        windowStartedAt: new Date(now.getTime() - 1_000),
        blockedUntil: null
      },
      now,
      5
    );
    expect(decision.allowed).toBe(true);
    expect(decision.attempts).toBe(5);
  });

  it("blocks attempts over the configured limit", () => {
    const decision = nextThrottleDecision(
      {
        attempts: 5,
        windowStartedAt: new Date(now.getTime() - 1_000),
        blockedUntil: null
      },
      now,
      5
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockedUntil?.getTime()).toBeGreaterThan(now.getTime());
  });

  it("resets an expired window", () => {
    const decision = nextThrottleDecision(
      {
        attempts: 99,
        windowStartedAt: new Date(now.getTime() - 16 * 60 * 1_000),
        blockedUntil: null
      },
      now,
      5
    );
    expect(decision).toMatchObject({ allowed: true, attempts: 1 });
    expect(decision.windowStartedAt).toEqual(now);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { hasExpectedOrigin } from "@/server/passkeys/request";

describe("hasExpectedOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the configured request origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PASSKEY_ORIGIN", "http://localhost:3000");
    vi.stubEnv("PASSKEY_RP_ID", "localhost");
    vi.stubEnv("PASSKEY_RP_NAME", "Currents");

    expect(
      hasExpectedOrigin(
        new Request("http://localhost:3000/api/passkeys", {
          headers: { Origin: "http://localhost:3000" }
        })
      )
    ).toBe(true);
    expect(
      hasExpectedOrigin(
        new Request("http://localhost:3000/api/passkeys", {
          headers: { Origin: "https://attacker.example" }
        })
      )
    ).toBe(false);
    expect(
      hasExpectedOrigin(new Request("http://localhost:3000/api/passkeys"))
    ).toBe(false);
  });
});

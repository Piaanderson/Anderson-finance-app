import { describe, expect, it } from "vitest";
import { resolvePasskeyConfig } from "@/server/passkeys/config";

describe("resolvePasskeyConfig", () => {
  it("uses localhost-safe development defaults", () => {
    expect(resolvePasskeyConfig({ NODE_ENV: "development" })).toEqual({
      rpId: "localhost",
      origin: "http://localhost:3000",
      rpName: "Currents"
    });
  });

  it("fails closed when production configuration is absent", () => {
    expect(() => resolvePasskeyConfig({ NODE_ENV: "production" })).toThrow(
      /required in production/
    );
  });

  it("requires a secure matching production origin", () => {
    expect(() =>
      resolvePasskeyConfig({
        NODE_ENV: "production",
        PASSKEY_RP_ID: "example.com",
        PASSKEY_ORIGIN: "http://app.example.com",
        PASSKEY_RP_NAME: "Currents"
      })
    ).toThrow(/HTTPS/);

    expect(
      resolvePasskeyConfig({
        NODE_ENV: "production",
        PASSKEY_RP_ID: "example.com",
        PASSKEY_ORIGIN: "https://app.example.com",
        PASSKEY_RP_NAME: "Currents"
      })
    ).toEqual({
      rpId: "example.com",
      origin: "https://app.example.com",
      rpName: "Currents"
    });

    expect(() =>
      resolvePasskeyConfig({
        NODE_ENV: "production",
        PASSKEY_RP_ID: "example.com",
        PASSKEY_ORIGIN: "https://app.example.com/sign-in",
        PASSKEY_RP_NAME: "Currents"
      })
    ).toThrow(/only the URL origin/);
  });
});

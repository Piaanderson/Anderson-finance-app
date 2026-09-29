import { describe, expect, it } from "vitest";
import {
  assertIsolatedRuntime,
  assertProductionBootstrapState,
  resolveDeployContext
} from "./runtime-context";

describe("runtime isolation", () => {
  it("classifies local, CI, staging, and production from metadata", () => {
    expect(resolveDeployContext({})).toBe("local");
    expect(resolveDeployContext({ CI: "true" })).toBe("ci");
    expect(resolveDeployContext({ GITLAB_CI: "true" })).toBe("ci");
    expect(resolveDeployContext({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBe(
      "staging"
    );
    expect(resolveDeployContext({ RAILWAY_ENVIRONMENT: "production" })).toBe(
      "production"
    );
  });

  it("rejects development bypass and bootstrap leftovers in deployed contexts", async () => {
    expect(() =>
      assertIsolatedRuntime({
        RAILWAY_ENVIRONMENT_NAME: "production",
        AUTH_DEV_BYPASS: "true",
        DATABASE_URL:
          "postgresql://postgres@postgres.railway.internal:5432/railway"
      })
    ).toThrow(/AUTH_DEV_BYPASS/);

    expect(() =>
      assertIsolatedRuntime({
        RAILWAY_ENVIRONMENT_NAME: "staging",
        PLAID_ENV: "production",
        DATABASE_URL:
          "postgresql://postgres@postgres.railway.internal:5432/railway"
      })
    ).toThrow(/Plaid Production/);

    await expect(
      assertProductionBootstrapState(
        {
          RAILWAY_ENVIRONMENT_NAME: "production",
          PASSKEY_BOOTSTRAP_TOKEN: "one-time"
        },
        async () => 1
      )
    ).rejects.toThrow(/PASSKEY_BOOTSTRAP_TOKEN/);

    await expect(
      assertProductionBootstrapState(
        {
          RAILWAY_ENVIRONMENT_NAME: "production",
          PASSKEY_BOOTSTRAP_TOKEN: "one-time"
        },
        async () => 0
      )
    ).resolves.toBeUndefined();
  });

  it("keeps CI and local databases off Railway", () => {
    expect(() =>
      assertIsolatedRuntime({
        CI: "true",
        DATABASE_URL: "postgresql://test:test@postgres:5432/currents_test"
      })
    ).not.toThrow();

    expect(() =>
      assertIsolatedRuntime({
        CI: "true",
        DATABASE_URL:
          "postgresql://postgres@postgres.railway.internal:5432/railway"
      })
    ).toThrow(/Railway database/);

    expect(() =>
      assertIsolatedRuntime({
        CI: "true",
        PLAID_CLIENT_ID: "not-for-ci"
      })
    ).toThrow(/Plaid credentials/);

    expect(() =>
      assertIsolatedRuntime({
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/currents"
      })
    ).not.toThrow();

    expect(() =>
      assertIsolatedRuntime({
        DATABASE_URL:
          "postgresql://postgres@postgres.railway.internal:5432/railway"
      })
    ).toThrow(/Railway database/);
  });

  it("requires the private Railway host in staging and production", () => {
    const privateUrl =
      "postgresql://postgres@postgres.railway.internal:5432/railway";
    const publicUrl =
      "postgresql://postgres@example.proxy.rlwy.net:5432/railway";

    expect(() =>
      assertIsolatedRuntime({
        RAILWAY_ENVIRONMENT_NAME: "staging",
        PLAID_ENV: "sandbox",
        DATABASE_URL: privateUrl
      })
    ).not.toThrow();

    expect(() =>
      assertIsolatedRuntime({
        RAILWAY_ENVIRONMENT_NAME: "staging",
        PLAID_ENV: "sandbox",
        DATABASE_URL: publicUrl
      })
    ).toThrow(/private Railway PostgreSQL/);

    expect(() =>
      assertIsolatedRuntime({
        RAILWAY_ENVIRONMENT_NAME: "production",
        DATABASE_URL: publicUrl
      })
    ).toThrow(/private Railway PostgreSQL/);
  });
});

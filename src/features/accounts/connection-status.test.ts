import { describe, expect, it } from "vitest";
import { connectionState } from "./connection-status";

const now = new Date("2026-09-20T02:00:00.000Z");

describe("account connection status", () => {
  it("gives login-required Items a reconnect path", () => {
    expect(
      connectionState({
        status: "LOGIN_REQUIRED",
        jobStatus: "FAILED",
        jobAttempts: 1,
        lastSyncedAt: null,
        now
      })
    ).toMatchObject({
      kind: "login-required",
      label: "Reconnect required",
      action: "reconnect"
    });
  });

  it("gives terminal failures a retry path distinct from reconnect", () => {
    expect(
      connectionState({
        status: "ERROR",
        jobStatus: "FAILED",
        jobAttempts: 8,
        lastSyncedAt: new Date("2026-09-20T01:00:00.000Z"),
        now
      })
    ).toMatchObject({
      kind: "error",
      label: "Sync stopped",
      action: "retry"
    });
  });

  it.each(["PENDING", "RUNNING"] as const)(
    "announces %s work without offering a duplicate refresh",
    (jobStatus) => {
      expect(
        connectionState({
          status: "ACTIVE",
          jobStatus,
          jobAttempts: jobStatus === "PENDING" ? 2 : 1,
          lastSyncedAt: null,
          now
        })
      ).toMatchObject({
        kind: "syncing",
        action: null
      });
    }
  );

  it("shows a queued manual retry before the prior terminal state", () => {
    expect(
      connectionState({
        status: "ERROR",
        jobStatus: "PENDING",
        jobAttempts: 0,
        lastSyncedAt: null,
        now
      })
    ).toMatchObject({
      kind: "syncing",
      label: "Sync queued",
      action: null
    });
  });

  it("offers refresh when a connection has never completed a sync", () => {
    expect(
      connectionState({
        status: "ACTIVE",
        jobStatus: null,
        jobAttempts: 0,
        lastSyncedAt: null,
        now
      })
    ).toMatchObject({
      kind: "stale",
      label: "Waiting for first sync",
      action: "refresh"
    });
  });

  it("surfaces connections older than 24 hours as stale", () => {
    expect(
      connectionState({
        status: "ACTIVE",
        jobStatus: "COMPLETED",
        jobAttempts: 1,
        lastSyncedAt: new Date("2026-09-19T01:59:59.000Z"),
        now
      })
    ).toMatchObject({
      kind: "stale",
      label: "Refresh recommended",
      action: "refresh"
    });
  });

  it("reports a recently synced Item as connected", () => {
    expect(
      connectionState({
        status: "ACTIVE",
        jobStatus: "COMPLETED",
        jobAttempts: 1,
        lastSyncedAt: new Date("2026-09-20T01:30:00.000Z"),
        now
      })
    ).toMatchObject({
      kind: "healthy",
      label: "Connected",
      action: "refresh"
    });
  });
});

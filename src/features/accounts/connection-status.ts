import type { PlaidItemStatus, SyncJobStatus } from "@prisma/client";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type ConnectionStateInput = {
  status: PlaidItemStatus;
  jobStatus: SyncJobStatus | null;
  jobAttempts: number;
  lastSyncedAt: Date | null;
  now?: Date;
};

export type ConnectionState = {
  kind: "healthy" | "syncing" | "stale" | "login-required" | "error";
  label: string;
  detail: string;
  action: "refresh" | "reconnect" | "retry" | null;
};

export function connectionState({
  status,
  jobStatus,
  jobAttempts,
  lastSyncedAt,
  now = new Date()
}: ConnectionStateInput): ConnectionState {
  if (status === "LOGIN_REQUIRED") {
    return {
      kind: "login-required",
      label: "Reconnect required",
      detail:
        "Your bank needs you to sign in again before Currents can resume updates.",
      action: "reconnect"
    };
  }

  if (jobStatus === "RUNNING" || jobStatus === "PENDING") {
    return {
      kind: "syncing",
      label: jobStatus === "RUNNING" ? "Syncing now" : "Sync queued",
      detail:
        jobAttempts > 0
          ? "Currents will retry automatically. You can leave this page."
          : "Currents will update this connection shortly.",
      action: null
    };
  }

  if (status === "ERROR" || jobStatus === "FAILED") {
    return {
      kind: "error",
      label: "Sync stopped",
      detail:
        "Automatic retries stopped after repeated failures. Try the sync again.",
      action: "retry"
    };
  }

  if (
    !lastSyncedAt ||
    now.getTime() - lastSyncedAt.getTime() > STALE_AFTER_MS
  ) {
    return {
      kind: "stale",
      label: lastSyncedAt ? "Refresh recommended" : "Waiting for first sync",
      detail: lastSyncedAt
        ? "This connection has not completed a sync in more than 24 hours."
        : "This connection has not completed its first sync yet.",
      action: "refresh"
    };
  }

  return {
    kind: "healthy",
    label: "Connected",
    detail: "Transactions and balances are syncing normally.",
    action: "refresh"
  };
}

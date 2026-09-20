import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { prisma } from "@/server/db";
import { claimNextSyncJob, enqueuePlaidSync } from "@/server/plaid/jobs";
import { processClaimedSyncJob, retryDelayMs } from "@/worker";

const createdHouseholds: string[] = [];
const createdUsers: string[] = [];

async function createFixture() {
  const key = `plaid-jobs-${randomUUID()}`;
  const userId = `${key}-user`;
  const householdId = `${key}-household`;
  const itemId = `${key}-item`;
  const dedupeKey = `plaid-sync:${itemId}`;
  createdUsers.push(userId);
  createdHouseholds.push(householdId);

  await prisma.user.create({
    data: { id: userId, email: `${key}@example.test` }
  });
  await prisma.household.create({
    data: { id: householdId, name: "Plaid job fixture" }
  });
  await prisma.householdMember.create({
    data: {
      id: `${key}-membership`,
      householdId,
      userId,
      role: "OWNER"
    }
  });
  await prisma.plaidItem.create({
    data: {
      id: itemId,
      householdId,
      linkedByUserId: userId,
      plaidItemId: `${key}-plaid-item`,
      accessTokenCiphertext: "fixture-ciphertext",
      accessTokenIv: "fixture-iv",
      accessTokenTag: "fixture-tag"
    }
  });

  return { key, itemId, dedupeKey };
}

async function createPendingJob(
  fixture: Awaited<ReturnType<typeof createFixture>>
) {
  return prisma.syncJob.create({
    data: {
      id: `${fixture.key}-job`,
      plaidItemId: fixture.itemId,
      dedupeKey: fixture.dedupeKey,
      reason: "WEBHOOK"
    }
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(async () => {
  const households = createdHouseholds.splice(0);
  const users = createdUsers.splice(0);
  await prisma.household.deleteMany({ where: { id: { in: households } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Plaid sync job queue", () => {
  it("deduplicates pending, running, completed, and failed jobs", async () => {
    const fixture = await createFixture();
    const initial = await enqueuePlaidSync(fixture.itemId, "INITIAL");
    expect(initial.status).toBe("PENDING");

    await prisma.syncJob.update({
      where: { id: initial.id },
      data: {
        attempts: 3,
        paginationStartCursor: "cursor-0",
        paginationCursor: "cursor-1"
      }
    });
    const pending = await enqueuePlaidSync(fixture.itemId, "WEBHOOK");
    expect(pending).toMatchObject({
      id: initial.id,
      status: "PENDING",
      attempts: 3,
      paginationStartCursor: "cursor-0",
      paginationCursor: "cursor-1"
    });

    await prisma.syncJob.update({
      where: { id: initial.id },
      data: { status: "RUNNING", lockedAt: new Date() }
    });
    const running = await enqueuePlaidSync(fixture.itemId, "MANUAL");
    expect(running).toMatchObject({
      id: initial.id,
      status: "RUNNING",
      rerunRequested: true,
      reason: "MANUAL"
    });

    await prisma.syncJob.update({
      where: { id: initial.id },
      data: { status: "COMPLETED", lockedAt: null }
    });
    const completed = await enqueuePlaidSync(fixture.itemId, "RECONCILIATION");
    expect(completed).toMatchObject({
      id: initial.id,
      status: "PENDING",
      attempts: 0,
      rerunRequested: false,
      paginationStartCursor: null,
      paginationCursor: null
    });

    await prisma.syncJob.update({
      where: { id: initial.id },
      data: {
        status: "FAILED",
        attempts: 8,
        lastError: "Plaid request failed.",
        paginationStartCursor: "cursor-2",
        paginationCursor: "cursor-3"
      }
    });
    const failed = await enqueuePlaidSync(fixture.itemId, "WEBHOOK");
    expect(failed).toMatchObject({
      id: initial.id,
      status: "PENDING",
      attempts: 0,
      lastError: null,
      paginationStartCursor: null,
      paginationCursor: null
    });
    await expect(
      prisma.syncJob.count({ where: { plaidItemId: fixture.itemId } })
    ).resolves.toBe(1);
  });

  it("allows only one concurrent worker to claim a job", async () => {
    const fixture = await createFixture();
    await createPendingJob(fixture);
    const now = new Date(Date.now() + 60_000);

    const claimed = await Promise.all([
      claimNextSyncJob({ dedupeKey: fixture.dedupeKey, now }),
      claimNextSyncJob({ dedupeKey: fixture.dedupeKey, now })
    ]);

    expect(claimed.filter(Boolean)).toHaveLength(1);
    await expect(
      prisma.syncJob.findUniqueOrThrow({
        where: { dedupeKey: fixture.dedupeKey }
      })
    ).resolves.toMatchObject({
      status: "RUNNING",
      attempts: 1,
      lockedAt: now
    });
  });

  it("recovers a stale lock without losing its pagination checkpoint", async () => {
    const fixture = await createFixture();
    const job = await createPendingJob(fixture);
    const now = new Date(Date.now() + 60_000);
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        attempts: 2,
        lockedAt: new Date(now.getTime() - 16 * 60_000),
        paginationStartCursor: "cursor-0",
        paginationCursor: "cursor-1"
      }
    });

    const claimed = await claimNextSyncJob({
      dedupeKey: fixture.dedupeKey,
      now
    });

    expect(claimed).toMatchObject({
      id: job.id,
      status: "RUNNING",
      attempts: 3,
      paginationStartCursor: "cursor-0",
      paginationCursor: "cursor-1",
      lastError: "Recovered after an interrupted worker."
    });
  });
});

describe("finite Plaid worker processing", () => {
  it("schedules one immediate rerun when a webhook arrives during a running sync", async () => {
    const fixture = await createFixture();
    await createPendingJob(fixture);
    const claimed = await claimNextSyncJob({
      dedupeKey: fixture.dedupeKey
    });
    expect(claimed).not.toBeNull();

    let finishSync:
      | ((value: {
          accounts: number;
          added: number;
          modified: number;
          removed: number;
        }) => void)
      | undefined;
    const sync = vi.fn(
      () =>
        new Promise<{
          accounts: number;
          added: number;
          modified: number;
          removed: number;
        }>((resolve) => {
          finishSync = resolve;
        })
    );
    const processing = processClaimedSyncJob(claimed!, { sync });
    await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce());
    await enqueuePlaidSync(fixture.itemId, "WEBHOOK");
    finishSync?.({ accounts: 1, added: 2, modified: 0, removed: 0 });

    await expect(processing).resolves.toBe("rerun");
    await expect(
      prisma.syncJob.findUniqueOrThrow({
        where: { dedupeKey: fixture.dedupeKey }
      })
    ).resolves.toMatchObject({
      status: "PENDING",
      attempts: 0,
      rerunRequested: false,
      lockedAt: null
    });
  });

  it("schedules retries and marks the eighth failed attempt terminal", async () => {
    const fixture = await createFixture();
    const job = await createPendingJob(fixture);
    const firstFailureAt = new Date("2026-09-20T03:00:00.000Z");
    const unsafeError = {
      message:
        "access-sandbox-secret Household Checking Private transaction name",
      response: {
        data: {
          error_code: "INSTITUTION_NOT_RESPONDING",
          access_token: "access-sandbox-secret",
          account_name: "Household Checking",
          transaction_name: "Private transaction name",
          webhook_body: { complete: "payload" }
        }
      }
    };
    const logs: unknown[] = [];
    const log = {
      info: vi.fn((event, details) => logs.push({ event, details })),
      error: vi.fn((event, details) => logs.push({ event, details }))
    };
    const sync = vi.fn().mockRejectedValue(unsafeError);
    const claimed = await claimNextSyncJob({
      dedupeKey: fixture.dedupeKey,
      now: firstFailureAt
    });

    await expect(
      processClaimedSyncJob(claimed!, {
        sync,
        now: () => firstFailureAt,
        log
      })
    ).resolves.toBe("retry");
    const retried = await prisma.syncJob.findUniqueOrThrow({
      where: { id: job.id }
    });
    expect(retried).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "Plaid request failed (INSTITUTION_NOT_RESPONDING)."
    });
    expect(retried.runAfter).toEqual(
      new Date(firstFailureAt.getTime() + retryDelayMs(1))
    );
    expect(JSON.stringify(logs)).not.toContain("access-sandbox-secret");
    expect(JSON.stringify(logs)).not.toContain("Household Checking");
    expect(JSON.stringify(logs)).not.toContain("Private transaction name");
    expect(JSON.stringify(logs)).not.toContain('"complete":"payload"');
    expect(retried.lastError).not.toContain("access-sandbox-secret");

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempts: 7,
        runAfter: firstFailureAt
      }
    });
    const eighthAttempt = await claimNextSyncJob({
      dedupeKey: fixture.dedupeKey,
      now: firstFailureAt
    });
    expect(eighthAttempt?.attempts).toBe(8);

    await expect(
      processClaimedSyncJob(eighthAttempt!, {
        sync,
        now: () => firstFailureAt,
        log
      })
    ).resolves.toBe("failed");
    await expect(
      prisma.syncJob.findUniqueOrThrow({ where: { id: job.id } })
    ).resolves.toMatchObject({
      status: "FAILED",
      attempts: 8,
      lockedAt: null,
      lastError: "Plaid request failed (INSTITUTION_NOT_RESPONDING)."
    });
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({
      status: "ERROR",
      errorCode: "INSTITUTION_NOT_RESPONDING"
    });
  });

  it("stops immediately and requests reconnect for ITEM_LOGIN_REQUIRED", async () => {
    const fixture = await createFixture();
    await createPendingJob(fixture);
    const claimed = await claimNextSyncJob({
      dedupeKey: fixture.dedupeKey
    });
    const sync = vi.fn().mockRejectedValue({
      response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } }
    });
    const log = { info: vi.fn(), error: vi.fn() };

    await expect(processClaimedSyncJob(claimed!, { sync, log })).resolves.toBe(
      "failed"
    );
    await expect(
      prisma.syncJob.findUniqueOrThrow({
        where: { dedupeKey: fixture.dedupeKey }
      })
    ).resolves.toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastError: "Plaid request failed (ITEM_LOGIN_REQUIRED)."
    });
    await expect(
      prisma.plaidItem.findUniqueOrThrow({ where: { id: fixture.itemId } })
    ).resolves.toMatchObject({
      status: "LOGIN_REQUIRED",
      errorCode: "ITEM_LOGIN_REQUIRED"
    });
  });
});

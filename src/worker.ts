import { pathToFileURL } from "node:url";
import { prisma } from "@/server/db";
import { claimNextSyncJob } from "@/server/plaid/jobs";
import { syncPlaidItem } from "@/server/plaid/sync";
import { sanitizedPlaidError } from "@/server/plaid/errors";

type ClaimedSyncJob = NonNullable<Awaited<ReturnType<typeof claimNextSyncJob>>>;

type WorkerLogger = {
  info: (event: string, details?: Record<string, unknown>) => void;
  error: (event: string, details?: Record<string, unknown>) => void;
};

const logger: WorkerLogger = {
  info(event, details = {}) {
    console.info(JSON.stringify({ level: "info", event, ...details }));
  },
  error(event, details = {}) {
    console.error(JSON.stringify({ level: "error", event, ...details }));
  }
};

export function retryDelayMs(attempts: number) {
  return Math.min(30 * 60_000, 2 ** attempts * 5_000);
}

export async function processClaimedSyncJob(
  job: ClaimedSyncJob,
  {
    sync = syncPlaidItem,
    now = () => new Date(),
    log = logger
  }: {
    sync?: typeof syncPlaidItem;
    now?: () => Date;
    log?: WorkerLogger;
  } = {}
) {
  try {
    const result = await sync(job.plaidItemId, job.id);
    const completed = await prisma.syncJob.updateMany({
      where: { id: job.id, status: "RUNNING", rerunRequested: false },
      data: { status: "COMPLETED", lockedAt: null, lastError: null }
    });
    if (completed.count === 0) {
      await prisma.syncJob.updateMany({
        where: { id: job.id, status: "RUNNING", rerunRequested: true },
        data: {
          status: "PENDING",
          attempts: 0,
          rerunRequested: false,
          lockedAt: null,
          runAfter: now()
        }
      });
    }
    log.info("plaid.sync.completed", { jobId: job.id, ...result });
    return completed.count === 1 ? "completed" : "rerun";
  } catch (error) {
    const safeError = sanitizedPlaidError(error);
    const terminal = job.attempts >= 8;
    const failedAt = now();
    await prisma.syncJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: {
        status: terminal ? "FAILED" : "PENDING",
        rerunRequested: false,
        lockedAt: null,
        lastError: safeError.message,
        runAfter: terminal
          ? failedAt
          : new Date(failedAt.getTime() + retryDelayMs(job.attempts))
      }
    });
    log.error("plaid.sync.failed", {
      jobId: job.id,
      terminal,
      ...(safeError.code ? { errorCode: safeError.code } : {})
    });
    return terminal ? "failed" : "retry";
  }
}

export async function runWorker({
  pollMs = Number(process.env.SYNC_POLL_MS ?? "5000"),
  shouldStop,
  sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}: {
  pollMs?: number;
  shouldStop: () => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  logger.info("worker.started");
  while (!shouldStop()) {
    const job = await claimNextSyncJob();
    if (!job) {
      await sleep(pollMs);
      continue;
    }
    await processClaimedSyncJob(job);
  }

  await prisma.$disconnect();
  logger.info("worker.stopped");
}

async function main() {
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  await runWorker({ shouldStop: () => stopping });
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    const safeError = sanitizedPlaidError(error);
    console.error(
      JSON.stringify({
        level: "fatal",
        event: "worker.crashed",
        ...(safeError.code ? { errorCode: safeError.code } : {})
      })
    );
    process.exitCode = 1;
  });
}

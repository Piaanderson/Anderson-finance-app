import { prisma } from "@/server/db";
import { claimNextSyncJob } from "@/server/plaid/jobs";
import { syncPlaidItem } from "@/server/plaid/sync";

const pollMs = Number(process.env.SYNC_POLL_MS ?? "5000");
let stopping = false;

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

function log(event: string, details: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ level: "info", event, ...details }));
}

async function run() {
  log("worker.started");
  while (!stopping) {
    const job = await claimNextSyncJob();
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    try {
      const result = await syncPlaidItem(job.plaidItemId);
      const completed = await prisma.syncJob.updateMany({
        where: { id: job.id, rerunRequested: false },
        data: { status: "COMPLETED", lockedAt: null, lastError: null }
      });
      if (completed.count === 0) {
        await prisma.syncJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            rerunRequested: false,
            lockedAt: null,
            runAfter: new Date()
          }
        });
      }
      log("plaid.sync.completed", { jobId: job.id, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
      const terminal = job.attempts >= 8;
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          lockedAt: null,
          lastError: message,
          runAfter: new Date(
            Date.now() + Math.min(30 * 60_000, 2 ** job.attempts * 5_000)
          )
        }
      });
      console.error(
        JSON.stringify({
          level: "error",
          event: "plaid.sync.failed",
          jobId: job.id,
          terminal,
          message
        })
      );
    }
  }

  await prisma.$disconnect();
  log("worker.stopped");
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      event: "worker.crashed",
      message: error instanceof Error ? error.message : "Unknown error"
    })
  );
  process.exitCode = 1;
});

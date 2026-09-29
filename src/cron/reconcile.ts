import { prisma } from "@/server/db";
import { getOpsSnapshot } from "@/server/ops/snapshot";
import { enqueuePlaidSync } from "@/server/plaid/jobs";
import { assertIsolatedRuntime } from "@/server/runtime-context";

async function reconcile() {
  assertIsolatedRuntime();
  const items = await prisma.plaidItem.findMany({
    where: { status: "ACTIVE" },
    select: { id: true }
  });
  await Promise.all(
    items.map((item) => enqueuePlaidSync(item.id, "RECONCILIATION"))
  );
  const snapshot = await getOpsSnapshot();
  console.info(
    JSON.stringify({
      level: "info",
      event: "plaid.reconciliation.enqueued",
      count: items.length
    })
  );
  console.info(
    JSON.stringify({ level: "info", event: "ops.snapshot", ...snapshot })
  );
}

reconcile()
  .catch(() => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "plaid.reconciliation.failed"
      })
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

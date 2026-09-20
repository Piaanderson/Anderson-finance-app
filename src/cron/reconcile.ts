import { prisma } from "@/server/db";
import { enqueuePlaidSync } from "@/server/plaid/jobs";

async function reconcile() {
  const items = await prisma.plaidItem.findMany({
    where: { status: "ACTIVE" },
    select: { id: true }
  });
  await Promise.all(
    items.map((item) => enqueuePlaidSync(item.id, "RECONCILIATION"))
  );
  console.info(
    JSON.stringify({
      level: "info",
      event: "plaid.reconciliation.enqueued",
      count: items.length
    })
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

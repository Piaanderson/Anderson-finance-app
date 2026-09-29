import { prisma } from "@/server/db";
import { getOpsSnapshot } from "@/server/ops/snapshot";
import { resolveDeployContext } from "@/server/runtime-context";

async function main() {
  const context = resolveDeployContext();
  if (context === "production") {
    throw new Error("Refuse to print an ops snapshot against production.");
  }
  const snapshot = await getOpsSnapshot();
  console.info(
    JSON.stringify({ level: "info", event: "ops.snapshot", ...snapshot })
  );
}

main()
  .catch((error) => {
    const message =
      error instanceof Error ? error.message : "ops snapshot failed";
    console.error(
      JSON.stringify({ level: "error", event: "ops.snapshot.failed", message })
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

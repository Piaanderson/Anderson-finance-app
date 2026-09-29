import type { Instrumentation } from "next";
import { sanitizeRequestPath } from "@/server/security-headers";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertIsolatedRuntime, assertProductionBootstrapState } =
    await import("@/server/runtime-context");
  assertIsolatedRuntime();
  if (process.env.NEXT_PHASE) return;
  const { prisma } = await import("@/server/db");
  await assertProductionBootstrapState(process.env, () => prisma.user.count());
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event: "request.failed",
      method: request.method,
      path: sanitizeRequestPath(request.path),
      routeType: context.routeType,
      ...(digest ? { digest } : {})
    })
  );
};

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";
import { hasExpectedOrigin } from "@/server/passkeys/request";
import { credentialRevocationParamsSchema } from "@/server/passkeys/validation";
import { requestThrottleKey, takeThrottle } from "@/server/passkeys/throttle";

type Context = { params: Promise<{ credentialId: string }> };

export async function DELETE(request: Request, context: Context) {
  if (!hasExpectedOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (owner.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { credentialId } = credentialRevocationParamsSchema.parse(
      await context.params
    );
    const throttle = await takeThrottle(
      "MANAGEMENT",
      `${owner.userId}:${requestThrottleKey(request)}`
    );
    if (!throttle.allowed) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const revoked = await prisma.$transaction(
      async (tx) => {
        const [activePasskeys, unusedRecoveryCodes] = await Promise.all([
          tx.passkeyCredential.count({
            where: { userId: owner.userId, revokedAt: null }
          }),
          tx.recoveryCode.count({
            where: { userId: owner.userId, usedAt: null }
          })
        ]);
        if (activePasskeys <= 1 && unusedRecoveryCodes === 0) {
          return { count: 0, unsafe: true };
        }
        const result = await tx.passkeyCredential.updateMany({
          where: {
            id: credentialId,
            userId: owner.userId,
            revokedAt: null
          },
          data: { revokedAt: new Date() }
        });
        return { count: result.count, unsafe: false };
      },
      { isolationLevel: "Serializable" }
    );
    if (revoked.unsafe) {
      return NextResponse.json(
        {
          error:
            "Add another passkey or recovery codes before removing this one."
        },
        { status: 409 }
      );
    }
    if (revoked.count !== 1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireApiHousehold } from "@/server/households";
import { hasExpectedOrigin } from "@/server/passkeys/request";
import { regenerateRecoveryCodes } from "@/server/passkeys/service";
import { recoveryRegenerationSchema } from "@/server/passkeys/validation";
import { requestThrottleKey, takeThrottle } from "@/server/passkeys/throttle";

export async function POST(request: Request) {
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
    recoveryRegenerationSchema.parse(await request.json());
    const throttle = await takeThrottle(
      "MANAGEMENT",
      `${owner.userId}:${requestThrottleKey(request)}`
    );
    if (!throttle.allowed) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const recoveryCodes = await regenerateRecoveryCodes(owner.userId);
    return NextResponse.json(
      { recoveryCodes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

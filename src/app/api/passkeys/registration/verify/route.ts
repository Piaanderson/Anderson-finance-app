import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireApiHousehold } from "@/server/households";
import { hasExpectedOrigin } from "@/server/passkeys/request";
import { verifyRegistration } from "@/server/passkeys/service";
import { registrationVerificationEnvelopeSchema } from "@/server/passkeys/validation";
import {
  clearThrottle,
  requestThrottleKey,
  takeThrottle
} from "@/server/passkeys/throttle";

export async function POST(request: Request) {
  if (!hasExpectedOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const throttleKey = requestThrottleKey(request);

  try {
    const input = registrationVerificationEnvelopeSchema.parse(
      await request.json()
    );
    const scope =
      input.mode === "bootstrap" ? "BOOTSTRAP_VERIFY" : "MANAGEMENT";
    const throttle = await takeThrottle(scope, throttleKey);
    if (!throttle.allowed) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    if (input.mode === "bootstrap") {
      const result = await verifyRegistration({
        mode: "bootstrap",
        ceremonyId: input.ceremonyId,
        bootstrapToken: input.bootstrapToken,
        response: input.response
      });
      await clearThrottle(scope, throttleKey);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const owner = await requireApiHousehold();
    if (!owner) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (owner.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await verifyRegistration({
      mode: "user",
      ceremonyId: input.ceremonyId,
      response: input.response,
      actorUserId: owner.userId
    });
    await clearThrottle(scope, throttleKey);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
}

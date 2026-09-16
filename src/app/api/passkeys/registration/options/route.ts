import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";
import { hasExpectedOrigin } from "@/server/passkeys/request";
import { createRegistrationOptions } from "@/server/passkeys/service";
import { registrationOptionsSchema } from "@/server/passkeys/validation";
import { requestThrottleKey, takeThrottle } from "@/server/passkeys/throttle";

export async function POST(request: Request) {
  if (!hasExpectedOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const input = registrationOptionsSchema.parse(await request.json());
    const scope =
      input.mode === "bootstrap" ? "BOOTSTRAP_OPTIONS" : "MANAGEMENT";
    const throttle = await takeThrottle(scope, requestThrottleKey(request));
    if (!throttle.allowed) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    if (input.mode === "bootstrap") {
      const result = await createRegistrationOptions(input);
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
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: owner.userId },
      select: { id: true, name: true, email: true }
    });
    const result = await createRegistrationOptions({
      mode: "user",
      user,
      credentialName: input.credentialName
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Request rejected" }, { status: 403 });
  }
}

import { NextResponse } from "next/server";
import { createAuthenticationOptions } from "@/server/passkeys/service";
import { hasExpectedOrigin } from "@/server/passkeys/request";
import { requestThrottleKey, takeThrottle } from "@/server/passkeys/throttle";

export async function POST(request: Request) {
  if (!hasExpectedOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const throttle = await takeThrottle(
    "AUTH_OPTIONS",
    requestThrottleKey(request)
  );
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil(
                ((throttle.blockedUntil?.getTime() ?? Date.now()) -
                  Date.now()) /
                  1000
              )
            )
          )
        }
      }
    );
  }

  return NextResponse.json(await createAuthenticationOptions(), {
    headers: { "Cache-Control": "no-store" }
  });
}

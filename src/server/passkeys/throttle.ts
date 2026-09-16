import type { AuthThrottle, AuthThrottleScope } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashIdentifier } from "@/server/passkeys/crypto";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

const MAX_ATTEMPTS: Record<AuthThrottleScope, number> = {
  AUTH_OPTIONS: 20,
  AUTH_VERIFY: 5,
  BOOTSTRAP_OPTIONS: 5,
  BOOTSTRAP_VERIFY: 5,
  RECOVERY_VERIFY: 5,
  MANAGEMENT: 10
};

type ThrottleState = Pick<
  AuthThrottle,
  "attempts" | "windowStartedAt" | "blockedUntil"
>;

export type ThrottleDecision = {
  allowed: boolean;
  attempts: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

export function nextThrottleDecision(
  current: ThrottleState | null,
  now: Date,
  maxAttempts: number,
  windowMs = WINDOW_MS,
  blockMs = BLOCK_MS
): ThrottleDecision {
  if (current?.blockedUntil && current.blockedUntil > now) {
    return { ...current, allowed: false };
  }

  const windowExpired =
    !current || current.windowStartedAt.getTime() + windowMs <= now.getTime();
  const attempts = windowExpired ? 1 : current.attempts + 1;
  const allowed = attempts <= maxAttempts;

  return {
    allowed,
    attempts,
    windowStartedAt: windowExpired ? now : current.windowStartedAt,
    blockedUntil: allowed ? null : new Date(now.getTime() + blockMs)
  };
}

export function requestThrottleKey(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .at(-1)
    ?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown-client";
}

export async function takeThrottle(
  scope: AuthThrottleScope,
  identifier: string
) {
  const keyHash = hashIdentifier(identifier);
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const current = await tx.authThrottle.findUnique({
        where: { scope_keyHash: { scope, keyHash } }
      });
      const decision = nextThrottleDecision(current, now, MAX_ATTEMPTS[scope]);

      await tx.authThrottle.upsert({
        where: { scope_keyHash: { scope, keyHash } },
        create: {
          scope,
          keyHash,
          attempts: decision.attempts,
          windowStartedAt: decision.windowStartedAt,
          blockedUntil: decision.blockedUntil
        },
        update: {
          attempts: decision.attempts,
          windowStartedAt: decision.windowStartedAt,
          blockedUntil: decision.blockedUntil
        }
      });

      return decision;
    },
    { isolationLevel: "Serializable" }
  );
}

export async function clearThrottle(
  scope: AuthThrottleScope,
  identifier: string
) {
  await prisma.authThrottle.deleteMany({
    where: { scope, keyHash: hashIdentifier(identifier) }
  });
}

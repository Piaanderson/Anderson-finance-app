import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const RECOVERY_CODE_BYTES = 18;
const RECOVERY_CODE_COUNT = 10;

function authSecret(secret = process.env.AUTH_SECRET) {
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

export function constantTimeTokenEqual(candidate: string, expected: string) {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function userHandleMatches(encodedHandle: string, userId: string) {
  const leftBytes = Buffer.from(encodedHandle, "base64url");
  const rightBytes = Buffer.from(userId, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function requireBootstrapToken(candidate: string) {
  const expected = process.env.PASSKEY_BOOTSTRAP_TOKEN;
  if (!expected || !constantTimeTokenEqual(candidate, expected)) {
    throw new Error("Invalid bootstrap token.");
  }
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function hashRecoveryCode(code: string, secret: string = authSecret()) {
  return createHmac("sha256", secret)
    .update(normalizeRecoveryCode(code))
    .digest("hex");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase();
    return raw.match(/.{1,6}/g)?.join("-") ?? raw;
  });
}

export function hashIdentifier(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("hex");
}

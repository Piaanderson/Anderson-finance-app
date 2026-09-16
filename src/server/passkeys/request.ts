import { resolvePasskeyConfig } from "@/server/passkeys/config";

export function hasExpectedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === resolvePasskeyConfig().origin;
}

import { z } from "zod";

const originSchema = z
  .url()
  .refine((value) => !value.endsWith("/"), "PASSKEY_ORIGIN must not end in /.");

const rpIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !value.includes("://") && !value.includes("/"),
    "PASSKEY_RP_ID must be a hostname, not a URL."
  );

export type PasskeyConfig = {
  rpId: string;
  origin: string;
  rpName: string;
};

export function resolvePasskeyConfig(
  env: NodeJS.ProcessEnv = process.env
): PasskeyConfig {
  const production = env.NODE_ENV === "production";
  const rpId = env.PASSKEY_RP_ID ?? (production ? undefined : "localhost");
  const origin =
    env.PASSKEY_ORIGIN ?? (production ? undefined : "http://localhost:3000");
  const rpName = env.PASSKEY_RP_NAME ?? (production ? undefined : "Currents");

  if (!rpId || !origin || !rpName) {
    throw new Error(
      "PASSKEY_RP_ID, PASSKEY_ORIGIN, and PASSKEY_RP_NAME are required in production."
    );
  }

  const parsed = z
    .object({
      rpId: rpIdSchema,
      origin: originSchema,
      rpName: z.string().trim().min(1).max(100)
    })
    .parse({ rpId, origin, rpName });

  if (production && !parsed.origin.startsWith("https://")) {
    throw new Error("PASSKEY_ORIGIN must use HTTPS in production.");
  }

  const parsedOrigin = new URL(parsed.origin);
  if (parsedOrigin.origin !== parsed.origin) {
    throw new Error("PASSKEY_ORIGIN must contain only the URL origin.");
  }

  const originHostname = parsedOrigin.hostname;
  if (
    originHostname !== parsed.rpId &&
    !originHostname.endsWith(`.${parsed.rpId}`)
  ) {
    throw new Error(
      "PASSKEY_RP_ID must be the origin host or a parent domain."
    );
  }

  return parsed;
}

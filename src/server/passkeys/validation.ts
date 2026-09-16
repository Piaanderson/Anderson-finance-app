import { z } from "zod";

const base64url = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[A-Za-z0-9_-]+$/);

const credentialBase = {
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown())
};

export const registrationResponseSchema = z.object({
  ...credentialBase,
  response: z.object({
    clientDataJSON: base64url,
    attestationObject: base64url,
    authenticatorData: base64url.optional(),
    transports: z
      .array(
        z.enum([
          "ble",
          "cable",
          "hybrid",
          "internal",
          "nfc",
          "smart-card",
          "usb"
        ])
      )
      .max(10)
      .optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url.optional()
  })
});

export const authenticationResponseSchema = z.object({
  ...credentialBase,
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.nullish()
  })
});

export const bootstrapRegistrationOptionsSchema = z.object({
  mode: z.literal("bootstrap"),
  bootstrapToken: z.string().min(1).max(1024),
  name: z.string().trim().min(1).max(100),
  email: z.email().optional(),
  credentialName: z.string().trim().min(1).max(100).optional()
});

export const userRegistrationOptionsSchema = z.object({
  mode: z.literal("user"),
  credentialName: z.string().trim().min(1).max(100).optional()
});

export const registrationOptionsSchema = z.discriminatedUnion("mode", [
  bootstrapRegistrationOptionsSchema,
  userRegistrationOptionsSchema
]);

export const registrationVerificationEnvelopeSchema = z.object({
  mode: z.enum(["bootstrap", "user"]),
  ceremonyId: z.string().cuid(),
  bootstrapToken: z.string().min(1).max(1024).optional(),
  credentialName: z.string().trim().min(1).max(100).optional(),
  response: z.unknown()
});

export const passkeyAssertionEnvelopeSchema = z.object({
  ceremonyId: z.string().cuid(),
  response: z.unknown()
});

export const recoveryCredentialSchema = z.object({
  code: z.string().min(20).max(100)
});

export const recoveryRegenerationSchema = z.object({}).strict();

export const credentialRevocationParamsSchema = z.object({
  credentialId: z.string().cuid()
});

export function parseJsonCredential<T>(
  value: unknown,
  schema: z.ZodType<T>
): T {
  if (typeof value !== "string") return schema.parse(value);
  return schema.parse(JSON.parse(value) as unknown);
}

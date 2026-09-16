import { randomBytes } from "node:crypto";
import type {
  PasskeyCeremony,
  PasskeyCeremonyType,
  User
} from "@prisma/client";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { prisma } from "@/server/db";
import { resolvePasskeyConfig } from "@/server/passkeys/config";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  requireBootstrapToken,
  userHandleMatches
} from "@/server/passkeys/crypto";
import {
  authenticationResponseSchema,
  parseJsonCredential,
  registrationResponseSchema
} from "@/server/passkeys/validation";

const CEREMONY_TTL_MS = 5 * 60 * 1000;
const WEBAUTHN_TIMEOUT_MS = 4 * 60 * 1000;

type RegistrationResponse = Parameters<
  typeof verifyRegistrationResponse
>[0]["response"];
type AuthenticationResponse = Parameters<
  typeof verifyAuthenticationResponse
>[0]["response"];

export class PasskeyError extends Error {
  constructor(message = "Passkey operation failed.") {
    super(message);
    this.name = "PasskeyError";
  }
}

function expiresAt() {
  return new Date(Date.now() + CEREMONY_TTL_MS);
}

function counterAsNumber(value: bigint) {
  const counter = Number(value);
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new PasskeyError();
  }
  return counter;
}

function discoverableCredential(response: {
  clientExtensionResults: Record<string, unknown>;
}) {
  const credProps = response.clientExtensionResults.credProps;
  return (
    typeof credProps === "object" &&
    credProps !== null &&
    "rk" in credProps &&
    (credProps as { rk?: unknown }).rk === true
  );
}

async function consumeCeremony(
  ceremonyId: string,
  expectedType: PasskeyCeremonyType
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ceremony = await tx.passkeyCeremony.findUnique({
      where: { id: ceremonyId }
    });
    if (
      !ceremony ||
      ceremony.type !== expectedType ||
      ceremony.consumedAt ||
      ceremony.expiresAt <= now
    ) {
      throw new PasskeyError();
    }

    const consumed = await tx.passkeyCeremony.updateMany({
      where: {
        id: ceremony.id,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) throw new PasskeyError();
    return ceremony;
  });
}

export async function createAuthenticationOptions() {
  const config = resolvePasskeyConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    timeout: WEBAUTHN_TIMEOUT_MS,
    userVerification: "required"
  });
  const ceremony = await prisma.passkeyCeremony.create({
    data: {
      type: "AUTHENTICATION",
      challenge: options.challenge,
      userHandle: "",
      expiresAt: expiresAt()
    },
    select: { id: true }
  });

  return { ceremonyId: ceremony.id, options };
}

type RegistrationOptionsInput =
  | {
      mode: "bootstrap";
      bootstrapToken: string;
      name: string;
      email?: string;
      credentialName?: string;
    }
  | {
      mode: "user";
      user: Pick<User, "id" | "name" | "email">;
      credentialName?: string;
    };

export async function createRegistrationOptions(
  input: RegistrationOptionsInput
) {
  const bootstrap = input.mode === "bootstrap";
  if (bootstrap) {
    requireBootstrapToken(input.bootstrapToken);
    if ((await prisma.user.count()) !== 0) throw new PasskeyError();
  }

  const config = resolvePasskeyConfig();
  const userHandle = bootstrap
    ? randomBytes(32).toString("base64url")
    : input.user.id;
  const name = bootstrap ? input.name : input.user.name || "Owner";
  const email = bootstrap ? input.email : input.user.email;
  const existing = bootstrap
    ? []
    : await prisma.passkeyCredential.findMany({
        where: { userId: input.user.id, revokedAt: null },
        select: { credentialId: true, transports: true }
      });

  const options = await generateRegistrationOptions({
    rpID: config.rpId,
    rpName: config.rpName,
    userID: new TextEncoder().encode(userHandle),
    userName: email || userHandle,
    userDisplayName: name,
    timeout: WEBAUTHN_TIMEOUT_MS,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required"
    },
    extensions: { credProps: true },
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as (
        "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb"
      )[]
    }))
  });

  const ceremony = await prisma.passkeyCeremony.create({
    data: {
      type: bootstrap ? "REGISTRATION_BOOTSTRAP" : "REGISTRATION_USER",
      challenge: options.challenge,
      userId: bootstrap ? null : input.user.id,
      userHandle,
      registrationName: bootstrap ? input.name : null,
      registrationEmail: bootstrap ? input.email : null,
      credentialName: input.credentialName,
      expiresAt: expiresAt()
    },
    select: { id: true }
  });

  return { ceremonyId: ceremony.id, options };
}

type RegistrationVerificationInput = {
  mode: "bootstrap" | "user";
  ceremonyId: string;
  bootstrapToken?: string;
  response: unknown;
  actorUserId?: string;
};

function passkeyCreateData(
  ceremony: PasskeyCeremony,
  response: ReturnType<typeof registrationResponseSchema.parse>,
  info: NonNullable<
    Awaited<ReturnType<typeof verifyRegistrationResponse>>["registrationInfo"]
  >
) {
  return {
    userId: ceremony.userId ?? ceremony.userHandle,
    credentialId: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey),
    counter: BigInt(info.credential.counter),
    transports:
      info.credential.transports ?? response.response.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    name: ceremony.credentialName
  };
}

export async function verifyRegistration(input: RegistrationVerificationInput) {
  const expectedType =
    input.mode === "bootstrap" ? "REGISTRATION_BOOTSTRAP" : "REGISTRATION_USER";
  if (input.mode === "bootstrap") {
    requireBootstrapToken(input.bootstrapToken ?? "");
  }

  // Consumption is committed before parsing or cryptographic verification so
  // malformed and invalid responses cannot replay the challenge.
  const ceremony = await consumeCeremony(input.ceremonyId, expectedType);
  if (
    input.mode === "user" &&
    (!input.actorUserId || ceremony.userId !== input.actorUserId)
  ) {
    throw new PasskeyError();
  }

  const response = parseJsonCredential(
    input.response,
    registrationResponseSchema
  );
  if (!discoverableCredential(response)) throw new PasskeyError();

  const config = resolvePasskeyConfig();
  const result = await verifyRegistrationResponse({
    response: response as RegistrationResponse,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    requireUserVerification: true
  });
  if (
    !result.verified ||
    !result.registrationInfo ||
    !result.registrationInfo.userVerified
  ) {
    throw new PasskeyError();
  }

  const data = passkeyCreateData(ceremony, response, result.registrationInfo);
  if (input.mode === "user") {
    const passkey = await prisma.passkeyCredential.create({ data });
    return { verified: true as const, credentialId: passkey.id };
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodeData = recoveryCodes.map((code) => ({
    codeHash: hashRecoveryCode(code)
  }));

  await prisma.$transaction(
    async (tx) => {
      if ((await tx.user.count()) !== 0) throw new PasskeyError();
      await tx.user.create({
        data: {
          id: ceremony.userHandle,
          name: ceremony.registrationName,
          email: ceremony.registrationEmail,
          memberships: {
            create: {
              role: "OWNER",
              household: {
                create: {
                  name: ceremony.registrationName
                    ? `${ceremony.registrationName}'s household`
                    : "My household"
                }
              }
            }
          }
        }
      });
      await tx.passkeyCredential.create({ data });
      await tx.recoveryCode.createMany({
        data: recoveryCodeData.map((code) => ({
          ...code,
          userId: ceremony.userHandle
        }))
      });
    },
    { isolationLevel: "Serializable" }
  );

  return {
    verified: true as const,
    userId: ceremony.userHandle,
    recoveryCodes
  };
}

export async function verifyPasskeyAssertion(
  ceremonyIdValue: string,
  responseValue: unknown
) {
  const ceremony = await consumeCeremony(ceremonyIdValue, "AUTHENTICATION");
  const response = parseJsonCredential(
    responseValue,
    authenticationResponseSchema
  );
  const credential = await prisma.passkeyCredential.findFirst({
    where: { credentialId: response.id, revokedAt: null },
    include: { user: true }
  });
  if (!credential) throw new PasskeyError();
  if (
    response.response.userHandle &&
    !userHandleMatches(response.response.userHandle, credential.userId)
  ) {
    throw new PasskeyError();
  }

  const config = resolvePasskeyConfig();
  const result = await verifyAuthenticationResponse({
    response: response as AuthenticationResponse,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    requireUserVerification: true,
    advancedFIDOConfig: { userVerification: "required" },
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: counterAsNumber(credential.counter),
      transports: credential.transports as (
        "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb"
      )[]
    }
  });
  if (!result.verified || !result.authenticationInfo.userVerified) {
    throw new PasskeyError();
  }

  const updated = await prisma.passkeyCredential.updateMany({
    where: {
      id: credential.id,
      revokedAt: null,
      counter: credential.counter
    },
    data: {
      counter: BigInt(result.authenticationInfo.newCounter),
      backedUp: result.authenticationInfo.credentialBackedUp,
      deviceType: result.authenticationInfo.credentialDeviceType,
      lastUsedAt: new Date()
    }
  });
  if (updated.count !== 1) throw new PasskeyError();
  return credential.user;
}

export async function consumeRecoveryCode(code: string) {
  const codeHash = hashRecoveryCode(code);
  return prisma.$transaction(async (tx) => {
    const recoveryCode = await tx.recoveryCode.findUnique({
      where: { codeHash },
      select: { id: true, userId: true }
    });
    if (!recoveryCode) throw new PasskeyError();

    const consumed = await tx.recoveryCode.updateMany({
      where: { id: recoveryCode.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (consumed.count !== 1) throw new PasskeyError();
    return tx.user.findUniqueOrThrow({ where: { id: recoveryCode.userId } });
  });
}

export async function regenerateRecoveryCodes(userId: string) {
  const recoveryCodes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code)
      }))
    })
  ]);
  return recoveryCodes;
}

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

function currentKeyVersion() {
  return Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION ?? "1");
}

function encryptionKey(version = currentKeyVersion()) {
  const encoded =
    process.env[`TOKEN_ENCRYPTION_KEY_V${version}`] ??
    (version === currentKeyVersion()
      ? process.env.TOKEN_ENCRYPTION_KEY
      : undefined);
  if (!encoded) throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function encryptSecret(
  plaintext: string,
  key = encryptionKey()
): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: currentKeyVersion()
  };
}

export function decryptSecret(
  value: Pick<EncryptedSecret, "ciphertext" | "iv" | "tag"> & {
    keyVersion?: number;
  },
  key = encryptionKey(value.keyVersion)
) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

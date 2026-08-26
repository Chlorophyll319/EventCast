import { createHmac, randomBytes } from "node:crypto";

function getTokenHashSecret(): string {
  const secret = process.env.TOKEN_HASH_SECRET;
  if (!secret) {
    throw new Error("TOKEN_HASH_SECRET is not set");
  }
  return secret;
}

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", getTokenHashSecret()).update(token).digest("hex");
}

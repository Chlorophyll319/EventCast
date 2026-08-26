import { Resend } from "resend";
import { prisma } from "../prisma";
import { generateToken, hashToken } from "./authCrypto";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const THROTTLE_WINDOW_MS = 60 * 1000;

export class ThrottledError extends Error {}
export class InvalidTokenError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Single source of truth for whether real email sending is bypassed in favor
 * of a console/response-visible link. Both the service and the API route
 * call this instead of duplicating the `NODE_ENV` check, so the two guards
 * can't drift out of sync.
 */
export function isDevFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function requestMagicLink(rawEmail: string): Promise<{ devVerifyUrl?: string }> {
  const email = normalizeEmail(rawEmail);

  const recent = await prisma.magicLinkToken.findFirst({
    where: { email, createdAt: { gt: new Date(Date.now() - THROTTLE_WINDOW_MS) } },
  });
  if (recent) {
    throw new ThrottledError("Please wait before requesting another magic link.");
  }

  const rawToken = generateToken();
  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });

  const verifyUrl = buildMagicLinkUrl(rawToken);
  await sendMagicLinkEmail(email, verifyUrl);

  return isDevFallbackEnabled() ? { devVerifyUrl: verifyUrl } : {};
}

export async function verifyMagicLink(rawToken: string): Promise<{ userId: string }> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomic conditional update: only one concurrent request can flip
  // `consumedAt` from null, so a token can never be consumed twice.
  const { count } = await prisma.magicLinkToken.updateMany({
    where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (count !== 1) {
    throw new InvalidTokenError("This sign-in link is invalid or has expired.");
  }

  const record = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!record) {
    throw new InvalidTokenError("This sign-in link is invalid or has expired.");
  }

  const user = await prisma.user.upsert({
    where: { email: record.email },
    update: {},
    create: { email: record.email },
  });

  return { userId: user.id };
}

function buildMagicLinkUrl(rawToken: string): string {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error("APP_BASE_URL is not set");
  }
  const url = new URL("/verify", baseUrl);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  if (isDevFallbackEnabled()) {
    console.log(`[dev] Magic link for ${email}: ${verifyUrl}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set in production");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: "Your EventCast sign-in link",
    text: `Click to sign in (expires in 15 minutes): ${verifyUrl}`,
  });
}

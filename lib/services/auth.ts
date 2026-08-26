import { Resend } from "resend";
import { prisma } from "../prisma";
import { generateToken, hashToken } from "./authCrypto";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const THROTTLE_WINDOW_MS = 60 * 1000;

export class ThrottledError extends Error {}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestMagicLink(rawEmail: string): Promise<void> {
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

  await sendMagicLinkEmail(email, buildMagicLinkUrl(rawToken));
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
  if (process.env.NODE_ENV !== "production") {
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

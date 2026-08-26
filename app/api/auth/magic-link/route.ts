import { NextResponse } from "next/server";
import { isDevFallbackEnabled, requestMagicLink, ThrottledError } from "@/lib/services/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Request body must be JSON.", "body");
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? (body as { email: unknown }).email
      : undefined;

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    return validationError("A valid email is required.", "email");
  }

  let result: { devVerifyUrl?: string };
  try {
    result = await requestMagicLink(email);
  } catch (error) {
    if (error instanceof ThrottledError) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: error.message } },
        { status: 429 },
      );
    }
    throw error;
  }

  // Second guard, independent of the service: even if requestMagicLink()
  // were ever changed incorrectly, this route never forwards a link unless
  // isDevFallbackEnabled() is also true.
  return NextResponse.json({
    ok: true,
    ...(isDevFallbackEnabled() && result.devVerifyUrl
      ? { devVerifyUrl: result.devVerifyUrl }
      : {}),
  });
}

function validationError(message: string, field: string) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message, field } },
    { status: 422 },
  );
}

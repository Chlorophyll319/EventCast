import { NextResponse } from "next/server";
import { requestMagicLink, ThrottledError } from "@/lib/services/auth";

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

  try {
    await requestMagicLink(email);
  } catch (error) {
    if (error instanceof ThrottledError) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: error.message } },
        { status: 429 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

function validationError(message: string, field: string) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message, field } },
    { status: 422 },
  );
}

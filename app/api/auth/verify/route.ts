import { NextResponse } from "next/server";
import { InvalidTokenError, verifyMagicLink } from "@/lib/services/auth";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, signSession } from "@/lib/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError();
  }

  const token =
    typeof body === "object" && body !== null && "token" in body
      ? (body as { token: unknown }).token
      : undefined;

  if (typeof token !== "string" || token.length === 0) {
    return validationError();
  }

  try {
    const { userId } = await verifyMagicLink(token);
    const sessionToken = await signSession(userId);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
}

function validationError() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "A token is required.", field: "token" } },
    { status: 422 },
  );
}

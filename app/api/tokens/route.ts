import { NextResponse } from "next/server";
import type { ApiTokenScope } from "@/lib/generated/prisma/enums";
import { getSessionUserId } from "@/lib/serverSession";
import { createApiToken, listApiTokens } from "@/lib/services/apiToken";

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === process.env.APP_BASE_URL;
}

function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return value === "read" || value === "write";
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return unauthorized();
  }
  if (!isTrustedOrigin(request)) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Request body must be JSON.", "body");
  }

  const scope =
    typeof body === "object" && body !== null && "scope" in body
      ? (body as { scope: unknown }).scope
      : undefined;
  if (!isApiTokenScope(scope)) {
    return validationError("scope must be 'read' or 'write'.", "scope");
  }

  const label =
    typeof body === "object" && body !== null && "label" in body
      ? (body as { label: unknown }).label
      : undefined;
  if (label !== undefined && typeof label !== "string") {
    return validationError("label must be a string.", "label");
  }

  const created = await createApiToken({ userId, scope, label: label ?? null });
  return NextResponse.json(created, { status: 201 });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return unauthorized();
  }

  const tokens = await listApiTokens(userId);
  return NextResponse.json({ tokens });
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
    { status: 401 },
  );
}

function validationError(message: string, field: string) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message, field } },
    { status: 422 },
  );
}

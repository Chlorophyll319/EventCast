import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/serverSession";
import { ApiTokenNotFoundError, revokeApiToken } from "@/lib/services/apiToken";

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === process.env.APP_BASE_URL;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return unauthorized();
  }
  if (!isTrustedOrigin(request)) {
    return unauthorized();
  }

  const { id } = await params;

  try {
    await revokeApiToken(userId, id);
  } catch (error) {
    if (error instanceof ApiTokenNotFoundError) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: error.message } },
        { status: 404 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
    { status: 401 },
  );
}

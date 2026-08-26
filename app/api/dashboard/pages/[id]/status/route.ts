import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/serverSession";
import { setPageStatus } from "@/lib/services/page";
import { mapPageError, validationError, withPublicUrl } from "@/app/api/pages/shared";

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === process.env.APP_BASE_URL;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
    { status: 401 },
  );
}

export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Request body must be JSON.", "body");
  }

  const { id } = await params;
  try {
    const page = await setPageStatus(userId, id, body);
    return NextResponse.json(withPublicUrl(page));
  } catch (error) {
    return mapPageError(error);
  }
}

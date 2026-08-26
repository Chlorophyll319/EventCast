import { NextResponse } from "next/server";
import { setPageStatus } from "@/lib/services/page";
import { authenticate, mapPageError, validationError, withPublicUrl } from "../../shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request, "write");
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Request body must be JSON.", "body");
  }

  const { id } = await params;
  try {
    const page = await setPageStatus(auth.userId, id, body);
    return NextResponse.json(withPublicUrl(page));
  } catch (error) {
    return mapPageError(error);
  }
}

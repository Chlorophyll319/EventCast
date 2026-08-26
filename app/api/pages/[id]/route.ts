import { NextResponse } from "next/server";
import { deletePage, getPageById, updatePage } from "@/lib/services/page";
import { authenticate, mapPageError, validationError, withPublicUrl } from "../shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request, "read");
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const page = await getPageById(auth.userId, id);
  if (!page) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Page not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json(withPublicUrl(page));
}

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
    const page = await updatePage(auth.userId, id, body);
    return NextResponse.json(withPublicUrl(page));
  } catch (error) {
    return mapPageError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request, "write");
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  try {
    await deletePage(auth.userId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return mapPageError(error);
  }
}

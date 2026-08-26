import { NextResponse } from "next/server";
import { createPage, listPages } from "@/lib/services/page";
import { authenticate, mapPageError, validationError, withPublicUrl } from "./shared";

export async function POST(request: Request) {
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

  try {
    const page = await createPage(auth.userId, body);
    return NextResponse.json(withPublicUrl(page), { status: 201 });
  } catch (error) {
    return mapPageError(error);
  }
}

export async function GET(request: Request) {
  const auth = await authenticate(request, "read");
  if (auth instanceof NextResponse) {
    return auth;
  }

  const pages = await listPages(auth.userId);
  return NextResponse.json({ pages: pages.map(withPublicUrl) });
}

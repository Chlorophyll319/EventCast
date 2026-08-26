import { NextResponse } from "next/server";
import { createPage, listPages } from "@/lib/services/page";
import { PageLimitError, PageValidationError } from "@/lib/services/pageErrors";
import { authenticate, withPublicUrl } from "./shared";

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

function mapPageError(error: unknown): NextResponse {
  if (error instanceof PageValidationError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.message, field: error.field } },
      { status: 422 },
    );
  }
  if (error instanceof PageLimitError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.message } },
      { status: 422 },
    );
  }
  throw error;
}

function validationError(message: string, field: string): NextResponse {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message, field } }, { status: 422 });
}

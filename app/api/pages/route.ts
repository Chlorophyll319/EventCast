import { NextResponse } from "next/server";
import type { ApiTokenScope } from "@/lib/generated/prisma/enums";
import {
  InsufficientScopeError,
  RateLimitedError,
  UnauthorizedError,
  verifyApiToken,
  type VerifiedApiToken,
} from "@/lib/services/apiAuth";
import { createPage, listPages } from "@/lib/services/page";
import { PageLimitError, PageValidationError } from "@/lib/services/pageErrors";

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

async function authenticate(
  request: Request,
  scope: ApiTokenScope,
): Promise<VerifiedApiToken | NextResponse> {
  try {
    return await verifyApiToken(request, scope);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: error.message } },
        { status: 429 },
      );
    }
    if (error instanceof UnauthorizedError || error instanceof InsufficientScopeError) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
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

function withPublicUrl<T extends { slug: string }>(page: T): T & { url: string } {
  return { ...page, url: `${process.env.APP_BASE_URL}/p/${page.slug}` };
}

import { NextResponse } from "next/server";
import type { ApiTokenScope } from "@/lib/generated/prisma/enums";
import {
  InsufficientScopeError,
  RateLimitedError,
  UnauthorizedError,
  verifyApiToken,
  type VerifiedApiToken,
} from "@/lib/services/apiAuth";

export async function authenticate(
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

export function withPublicUrl<T extends { slug: string }>(page: T): T & { url: string } {
  return { ...page, url: `${process.env.APP_BASE_URL}/p/${page.slug}` };
}

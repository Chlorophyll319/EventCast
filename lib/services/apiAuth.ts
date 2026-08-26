import type { ApiTokenScope } from "../generated/prisma/enums";
import { prisma } from "../prisma";
import { hashToken } from "./authCrypto";

const LAST_USED_UPDATE_THRESHOLD_MS = 5 * 60 * 1000;

export class UnauthorizedError extends Error {}
export class InsufficientScopeError extends Error {}

export interface VerifiedApiToken {
  tokenId: string;
  userId: string;
  scope: ApiTokenScope;
}

export async function verifyApiToken(
  request: Request,
  requiredScope: ApiTokenScope,
): Promise<VerifiedApiToken> {
  const rawToken = extractBearerToken(request.headers.get("authorization"));
  if (!rawToken) {
    throw new UnauthorizedError("Missing or malformed Authorization header.");
  }

  const record = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.revokedAt) {
    throw new UnauthorizedError("Invalid or revoked API token.");
  }

  if (!hasRequiredScope(record.scope, requiredScope)) {
    throw new InsufficientScopeError(`This token does not have the '${requiredScope}' scope.`);
  }

  touchLastUsedAt(record.id, record.lastUsedAt);

  return { tokenId: record.id, userId: record.userId, scope: record.scope };
}

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/.exec(headerValue);
  return match ? match[1] : null;
}

function hasRequiredScope(tokenScope: ApiTokenScope, required: ApiTokenScope): boolean {
  return tokenScope === "write" || tokenScope === required;
}

function touchLastUsedAt(tokenId: string, lastUsedAt: Date | null): void {
  const now = Date.now();
  if (lastUsedAt && now - lastUsedAt.getTime() < LAST_USED_UPDATE_THRESHOLD_MS) {
    return;
  }
  void prisma.apiToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date(now) } }).catch(() => {});
}

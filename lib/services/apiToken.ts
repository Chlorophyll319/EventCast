import type { ApiTokenScope } from "../generated/prisma/enums";
import { prisma } from "../prisma";
import { generateToken, hashToken } from "./authCrypto";

const TOKEN_PREFIX = "ec_live_";
const TOKEN_DISPLAY_PREFIX_LENGTH = 12;

export class ApiTokenNotFoundError extends Error {}

export interface CreateApiTokenInput {
  userId: string;
  scope: ApiTokenScope;
  label?: string | null;
}

export interface CreatedApiToken {
  id: string;
  token: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  label: string | null;
  createdAt: Date;
}

export async function createApiToken({
  userId,
  scope,
  label,
}: CreateApiTokenInput): Promise<CreatedApiToken> {
  const rawToken = `${TOKEN_PREFIX}${generateToken(24)}`;
  const tokenPrefix = rawToken.slice(0, TOKEN_DISPLAY_PREFIX_LENGTH);

  const record = await prisma.apiToken.create({
    data: {
      userId,
      tokenPrefix,
      tokenHash: hashToken(rawToken),
      scope,
      label: label ?? null,
    },
  });

  return {
    id: record.id,
    token: rawToken,
    tokenPrefix: record.tokenPrefix,
    scope: record.scope,
    label: record.label,
    createdAt: record.createdAt,
  };
}

export interface ApiTokenSummary {
  id: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  return prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tokenPrefix: true,
      scope: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<void> {
  const record = await prisma.apiToken.findFirst({ where: { id: tokenId, userId } });
  if (!record) {
    throw new ApiTokenNotFoundError("API token not found.");
  }
  if (record.revokedAt) {
    return;
  }

  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

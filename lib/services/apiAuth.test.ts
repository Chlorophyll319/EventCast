import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    apiToken: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { InsufficientScopeError, UnauthorizedError, verifyApiToken } from "./apiAuth";

function request(headers: Record<string, string> = {}) {
  return new Request("https://eventcast.example.com/api/pages", { headers });
}

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = "test-secret";
  findUnique.mockReset();
  update.mockReset().mockResolvedValue({});
});

describe("verifyApiToken", () => {
  it("throws UnauthorizedError when the header is missing", async () => {
    await expect(verifyApiToken(request(), "read")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when the header isn't a Bearer token", async () => {
    await expect(
      verifyApiToken(request({ authorization: "Basic abc123" }), "read"),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when no token matches", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "read"),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when the token is revoked", async () => {
    findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      scope: "write",
      revokedAt: new Date(),
      lastUsedAt: null,
    });
    await expect(
      verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "read"),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws InsufficientScopeError when the token scope is 'read' but 'write' is required", async () => {
    findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      scope: "read",
      revokedAt: null,
      lastUsedAt: null,
    });
    await expect(
      verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "write"),
    ).rejects.toThrow(InsufficientScopeError);
  });

  it("allows a 'write' scoped token to satisfy a 'read' requirement", async () => {
    findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      scope: "write",
      revokedAt: null,
      lastUsedAt: null,
    });
    const result = await verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "read");
    expect(result).toEqual({ tokenId: "token-1", userId: "user-1", scope: "write" });
  });

  it("touches lastUsedAt when it has never been set", async () => {
    findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      scope: "read",
      revokedAt: null,
      lastUsedAt: null,
    });
    await verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "read");
    expect(update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("does not touch lastUsedAt when it was updated recently", async () => {
    findUnique.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      scope: "read",
      revokedAt: null,
      lastUsedAt: new Date(),
    });
    await verifyApiToken(request({ authorization: "Bearer ec_live_x" }), "read");
    expect(update).not.toHaveBeenCalled();
  });
});

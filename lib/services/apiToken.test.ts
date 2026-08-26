import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    apiToken: {
      create: (...args: unknown[]) => create(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import {
  ApiTokenNotFoundError,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "./apiToken";

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = "test-secret";
  create.mockReset();
  findMany.mockReset();
  findFirst.mockReset();
  update.mockReset();
});

describe("createApiToken", () => {
  it("returns the plaintext token once, prefixed and hashed for storage", async () => {
    create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "token-1",
        ...data,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    const result = await createApiToken({ userId: "user-1", scope: "write", label: "CLI" });

    expect(result.token).toMatch(/^ec_live_/);
    expect(result.tokenPrefix).toBe(result.token.slice(0, 12));

    const createArgs = create.mock.calls[0][0];
    expect(createArgs.data.userId).toBe("user-1");
    expect(createArgs.data.tokenHash).not.toBe(result.token);
    expect(createArgs.data).not.toHaveProperty("token");
  });
});

describe("listApiTokens", () => {
  it("scopes the query to the given user and excludes tokenHash", async () => {
    findMany.mockResolvedValue([]);
    await listApiTokens("user-1");

    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "user-1" });
    expect(args.select.tokenHash).toBeUndefined();
  });
});

describe("revokeApiToken", () => {
  it("throws ApiTokenNotFoundError when the token doesn't belong to the user", async () => {
    findFirst.mockResolvedValue(null);
    await expect(revokeApiToken("user-1", "token-1")).rejects.toThrow(ApiTokenNotFoundError);
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op when the token is already revoked", async () => {
    findFirst.mockResolvedValue({ id: "token-1", revokedAt: new Date() });
    await revokeApiToken("user-1", "token-1");
    expect(update).not.toHaveBeenCalled();
  });

  it("sets revokedAt when the token is active", async () => {
    findFirst.mockResolvedValue({ id: "token-1", revokedAt: null });
    await revokeApiToken("user-1", "token-1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

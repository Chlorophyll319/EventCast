import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const findUnique = vi.fn();
const userUpsert = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    magicLinkToken: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      create: (...args: unknown[]) => create(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    user: {
      upsert: (...args: unknown[]) => userUpsert(...args),
    },
  },
}));

const send = vi.fn().mockResolvedValue({ data: { id: "email-id" } });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import {
  InvalidTokenError,
  isDevFallbackEnabled,
  normalizeEmail,
  requestMagicLink,
  ThrottledError,
  verifyMagicLink,
} from "./auth";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://eventcast.example.com";
  findFirst.mockReset().mockResolvedValue(null);
  create.mockReset().mockResolvedValue({});
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  findUnique.mockReset().mockResolvedValue({ email: "user@example.com" });
  userUpsert.mockReset().mockResolvedValue({ id: "user-1" });
  send.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.com  ")).toBe("user@example.com");
  });
});

describe("isDevFallbackEnabled", () => {
  it("is true outside production", () => {
    expect(isDevFallbackEnabled()).toBe(true);
  });

  it("is false in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevFallbackEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("requestMagicLink", () => {
  it("creates a MagicLinkToken with a 15 minute expiry", async () => {
    const before = Date.now();
    await requestMagicLink("User@Example.com");

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.email).toBe("user@example.com");
    expect(typeof args.data.tokenHash).toBe("string");
    const expiresAt = args.data.expiresAt as Date;
    expect(expiresAt.getTime() - before).toBeGreaterThan(14 * 60 * 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it("throws ThrottledError when a recent request exists", async () => {
    findFirst.mockResolvedValue({ id: "existing" });
    await expect(requestMagicLink("user@example.com")).rejects.toThrow(ThrottledError);
    expect(create).not.toHaveBeenCalled();
  });

  it("logs to console and returns devVerifyUrl outside production", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await requestMagicLink("user@example.com");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/verify?token="));
    expect(send).not.toHaveBeenCalled();
    expect(result.devVerifyUrl).toContain("/verify?token=");
    logSpy.mockRestore();
  });

  it("sends via Resend and does not return devVerifyUrl in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "login@eventcast.example.com";

    const result = await requestMagicLink("user@example.com");

    expect(send).toHaveBeenCalledTimes(1);
    const args = send.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.text).toContain("/verify?token=");
    expect(result).toEqual({});
    expect(result.devVerifyUrl).toBeUndefined();

    vi.unstubAllEnvs();
  });

  it("throws when APP_BASE_URL is not set", async () => {
    delete process.env.APP_BASE_URL;
    await expect(requestMagicLink("user@example.com")).rejects.toThrow(
      "APP_BASE_URL is not set",
    );
  });
});

describe("verifyMagicLink", () => {
  it("upserts the user and returns the userId when the token is valid", async () => {
    const result = await verifyMagicLink("raw-token");

    expect(updateMany).toHaveBeenCalledTimes(1);
    const where = updateMany.mock.calls[0][0].where;
    expect(where.consumedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);

    expect(userUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "user@example.com" } }),
    );
    expect(result).toEqual({ userId: "user-1" });
  });

  it("throws InvalidTokenError when no row matches (expired, used, or unknown)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(verifyMagicLink("raw-token")).rejects.toThrow(InvalidTokenError);
    expect(userUpsert).not.toHaveBeenCalled();
  });
});

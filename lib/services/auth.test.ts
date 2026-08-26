import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    magicLinkToken: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const send = vi.fn().mockResolvedValue({ data: { id: "email-id" } });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { normalizeEmail, requestMagicLink, ThrottledError } from "./auth";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://eventcast.example.com";
  findFirst.mockReset().mockResolvedValue(null);
  create.mockReset().mockResolvedValue({});
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

  it("logs to console instead of sending email outside production", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await requestMagicLink("user@example.com");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/verify?token="));
    expect(send).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("sends via Resend in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "login@eventcast.example.com";

    await requestMagicLink("user@example.com");

    expect(send).toHaveBeenCalledTimes(1);
    const args = send.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.text).toContain("/verify?token=");
  });

  it("throws when APP_BASE_URL is not set", async () => {
    delete process.env.APP_BASE_URL;
    await expect(requestMagicLink("user@example.com")).rejects.toThrow(
      "APP_BASE_URL is not set",
    );
  });
});

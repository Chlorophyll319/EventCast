import { beforeEach, describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./authCrypto";

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = "test-secret";
});

describe("generateToken", () => {
  it("returns a url-safe random string of sufficient length", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(32);
  });

  it("returns different values on each call", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input and secret", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });

  it("produces different hashes when the secret changes", () => {
    const hashed = hashToken("abc");
    process.env.TOKEN_HASH_SECRET = "different-secret";
    expect(hashToken("abc")).not.toBe(hashed);
  });

  it("throws when TOKEN_HASH_SECRET is not set", () => {
    delete process.env.TOKEN_HASH_SECRET;
    expect(() => hashToken("abc")).toThrow("TOKEN_HASH_SECRET is not set");
  });
});

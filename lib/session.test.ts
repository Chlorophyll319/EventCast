import { beforeEach, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

describe("signSession / verifySession", () => {
  it("round-trips the userId through a signed token", async () => {
    const token = await signSession("user-123");
    const result = await verifySession(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession("user-123");
    // Flip a character in the middle of the signature segment rather than
    // the last character: base64url's final char can have ignored padding
    // bits, so tampering it can decode to the same bytes and pass verification.
    const mid = Math.floor(token.length / 2);
    const tampered = `${token.slice(0, mid)}${token[mid] === "a" ? "b" : "a"}${token.slice(mid + 1)}`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession("user-123");
    process.env.SESSION_SECRET = "another-secret";
    expect(await verifySession(token)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});

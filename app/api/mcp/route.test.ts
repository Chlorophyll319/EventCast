import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.fn();
vi.mock("../pages/shared", () => ({
  authenticate: (...args: unknown[]) => authenticate(...args),
}));

const createPage = vi.fn();
const listPages = vi.fn();
const getPageById = vi.fn();
const updatePage = vi.fn();
const setPageStatus = vi.fn();
const deletePage = vi.fn();
vi.mock("@/lib/services/page", () => ({
  createPage: (...args: unknown[]) => createPage(...args),
  listPages: (...args: unknown[]) => listPages(...args),
  getPageById: (...args: unknown[]) => getPageById(...args),
  updatePage: (...args: unknown[]) => updatePage(...args),
  setPageStatus: (...args: unknown[]) => setPageStatus(...args),
  deletePage: (...args: unknown[]) => deletePage(...args),
}));

import { POST } from "./route";

function jsonRpcRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer irrelevant-in-tests",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_BASE_URL = "https://eventcast.example.com";
});

describe("POST /api/mcp", () => {
  it("returns 401 without invoking any tool when authenticate() rejects", async () => {
    authenticate.mockResolvedValue(
      NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header." } }, { status: 401 }),
    );

    const response = await POST(
      jsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete_page", arguments: { id: "p1" } } }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(deletePage).not.toHaveBeenCalled();
  });

  it("requires only the lowest (read) scope for non tools/call methods like tools/list", async () => {
    authenticate.mockResolvedValue({ tokenId: "t1", userId: "user-1", scope: "read" });

    const response = await POST(jsonRpcRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));

    expect(authenticate).toHaveBeenCalledWith(expect.anything(), "read");
    expect(response.status).toBe(200);
    const body = await response.json();
    const toolNames = body.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(toolNames).toEqual(
      ["create_page", "delete_page", "get_page", "list_pages", "set_page_status", "update_page"].sort(),
    );
  });

  it("resolves the tool's requiredScope from the registry for tools/call and enforces it via authenticate()", async () => {
    authenticate.mockResolvedValue(
      NextResponse.json({ error: { code: "UNAUTHORIZED", message: "This token does not have the 'write' scope." } }, { status: 401 }),
    );

    const response = await POST(
      jsonRpcRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_page", arguments: {} } }),
    );

    expect(authenticate).toHaveBeenCalledWith(expect.anything(), "write");
    expect(response.status).toBe(401);
  });

  it("dispatches tools/call create_page to the page service and returns the result wrapped with a public url", async () => {
    authenticate.mockResolvedValue({ tokenId: "t1", userId: "user-1", scope: "write" });
    createPage.mockResolvedValue({
      id: "page-1",
      slug: "abcd1234",
      title: "市集擺攤週",
      dateRangeStart: new Date("2026-09-01T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-09-07T00:00:00.000Z"),
      template: "timeline",
      status: "unlisted",
      timezone: "UTC",
      viewCount: 0,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      tags: [],
      events: [],
    });
    const args = { title: "市集擺攤週", dateRangeStart: "2026-09-01", dateRangeEnd: "2026-09-07", template: "timeline" };

    const response = await POST(
      jsonRpcRequest({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_page", arguments: args } }),
    );

    expect(response.status).toBe(200);
    expect(createPage).toHaveBeenCalledWith("user-1", args);
    const body = await response.json();
    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toMatchObject({ id: "page-1", url: "https://eventcast.example.com/p/abcd1234" });
  });

  it("dispatches tools/call get_page for a missing page as a tool-level NOT_FOUND error, not an HTTP error", async () => {
    authenticate.mockResolvedValue({ tokenId: "t1", userId: "user-1", scope: "read" });
    getPageById.mockResolvedValue(null);

    const response = await POST(
      jsonRpcRequest({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_page", arguments: { id: "missing" } } }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toEqual({ code: "NOT_FOUND", message: "Page not found." });
  });
});

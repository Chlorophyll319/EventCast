import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const createPage = vi.fn();
const listPages = vi.fn();
const getPageById = vi.fn();
const updatePage = vi.fn();
const setPageStatus = vi.fn();
const deletePage = vi.fn();

vi.mock("./page", () => ({
  createPage: (...args: unknown[]) => createPage(...args),
  listPages: (...args: unknown[]) => listPages(...args),
  getPageById: (...args: unknown[]) => getPageById(...args),
  updatePage: (...args: unknown[]) => updatePage(...args),
  setPageStatus: (...args: unknown[]) => setPageStatus(...args),
  deletePage: (...args: unknown[]) => deletePage(...args),
}));

import { findMcpTool, mapErrorToMcpContent, MCP_TOOLS } from "./mcpTools";
import { PageLimitError, PageNotFoundError, PageValidationError } from "./pageErrors";

function pageDetail(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_BASE_URL = "https://eventcast.example.com";
});

describe("MCP_TOOLS registry", () => {
  it("declares exactly the 6 tools from api.md, with the matching required scope", () => {
    const expected: Record<string, "read" | "write"> = {
      create_page: "write",
      list_pages: "read",
      get_page: "read",
      update_page: "write",
      set_page_status: "write",
      delete_page: "write",
    };
    expect(MCP_TOOLS.map((tool) => tool.name).sort()).toEqual(Object.keys(expected).sort());
    for (const tool of MCP_TOOLS) {
      expect(tool.requiredScope).toBe(expected[tool.name]);
    }
  });

  it("findMcpTool looks up a tool by name and returns undefined for unknown names", () => {
    expect(findMcpTool("create_page")?.name).toBe("create_page");
    expect(findMcpTool("not_a_tool")).toBeUndefined();
  });

  it("each tool's inputSchema accepts a minimal valid example matching api.md's shape", () => {
    const examples: Record<string, unknown> = {
      create_page: {
        title: "市集擺攤週",
        dateRangeStart: "2026-09-01",
        dateRangeEnd: "2026-09-07",
        template: "timeline",
        tags: [{ label: "擺攤", color: "orange" }],
        events: [{ name: "第一天", startTime: "2026-09-01T10:00:00.000Z", tagLabel: "擺攤" }],
      },
      list_pages: {},
      get_page: { id: "page-1" },
      update_page: { id: "page-1", title: "新標題", removeEventIds: ["event-1"] },
      set_page_status: { id: "page-1", status: "public" },
      delete_page: { id: "page-1" },
    };
    for (const tool of MCP_TOOLS) {
      const schema = z.object(tool.inputSchema);
      expect(schema.safeParse(examples[tool.name]).success).toBe(true);
    }
  });
});

describe("tool execute() dispatch", () => {
  it("create_page forwards args to createPage and wraps the result with a public url", async () => {
    createPage.mockResolvedValue(pageDetail());
    const tool = findMcpTool("create_page")!;
    const args = { title: "市集擺攤週", dateRangeStart: "2026-09-01", dateRangeEnd: "2026-09-07", template: "timeline" };

    const result = await tool.execute("user-1", args);

    expect(createPage).toHaveBeenCalledWith("user-1", args);
    expect(result).toMatchObject({ id: "page-1", url: "https://eventcast.example.com/p/abcd1234" });
  });

  it("list_pages wraps each page with a public url under a pages[] key", async () => {
    listPages.mockResolvedValue([pageDetail({ id: "page-1", slug: "aaa" }), pageDetail({ id: "page-2", slug: "bbb" })]);
    const tool = findMcpTool("list_pages")!;

    const result = await tool.execute("user-1", {});

    expect(listPages).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      pages: [
        expect.objectContaining({ id: "page-1", url: "https://eventcast.example.com/p/aaa" }),
        expect.objectContaining({ id: "page-2", url: "https://eventcast.example.com/p/bbb" }),
      ],
    });
  });

  it("get_page returns the page wrapped with a public url when found", async () => {
    getPageById.mockResolvedValue(pageDetail());
    const tool = findMcpTool("get_page")!;

    const result = await tool.execute("user-1", { id: "page-1" });

    expect(getPageById).toHaveBeenCalledWith("user-1", "page-1");
    expect(result).toMatchObject({ id: "page-1", url: "https://eventcast.example.com/p/abcd1234" });
  });

  it("get_page throws PageNotFoundError when the page does not exist", async () => {
    getPageById.mockResolvedValue(null);
    const tool = findMcpTool("get_page")!;

    await expect(tool.execute("user-1", { id: "missing" })).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it("update_page strips the top-level id before forwarding the rest as rawInput", async () => {
    updatePage.mockResolvedValue(pageDetail({ title: "新標題" }));
    const tool = findMcpTool("update_page")!;

    const result = await tool.execute("user-1", { id: "page-1", title: "新標題" });

    expect(updatePage).toHaveBeenCalledWith("user-1", "page-1", { title: "新標題" });
    expect(result).toMatchObject({ title: "新標題", url: "https://eventcast.example.com/p/abcd1234" });
  });

  it("set_page_status forwards id and status separately to setPageStatus", async () => {
    setPageStatus.mockResolvedValue(pageDetail({ status: "public" }));
    const tool = findMcpTool("set_page_status")!;

    const result = await tool.execute("user-1", { id: "page-1", status: "public" });

    expect(setPageStatus).toHaveBeenCalledWith("user-1", "page-1", { status: "public" });
    expect(result).toMatchObject({ status: "public" });
  });

  it("delete_page calls deletePage and returns a confirmation payload", async () => {
    deletePage.mockResolvedValue(undefined);
    const tool = findMcpTool("delete_page")!;

    const result = await tool.execute("user-1", { id: "page-1" });

    expect(deletePage).toHaveBeenCalledWith("user-1", "page-1");
    expect(result).toEqual({ id: "page-1", deleted: true });
  });
});

describe("mapErrorToMcpContent", () => {
  it("maps PageValidationError to VALIDATION_ERROR with the field", () => {
    const result = mapErrorToMcpContent(new PageValidationError("bad value", "tags[0].color"));
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "bad value",
      field: "tags[0].color",
    });
    expect(result.content[0].text).toBe("bad value");
  });

  it("maps PageLimitError to VALIDATION_ERROR without a field", () => {
    const result = mapErrorToMcpContent(new PageLimitError("too many pages"));
    expect(result.structuredContent.error).toEqual({ code: "VALIDATION_ERROR", message: "too many pages" });
  });

  it("maps PageNotFoundError to NOT_FOUND", () => {
    const result = mapErrorToMcpContent(new PageNotFoundError("Page not found."));
    expect(result.structuredContent.error).toEqual({ code: "NOT_FOUND", message: "Page not found." });
  });

  it("rethrows errors it does not recognize", () => {
    const unexpected = new Error("boom");
    expect(() => mapErrorToMcpContent(unexpected)).toThrow(unexpected);
  });
});

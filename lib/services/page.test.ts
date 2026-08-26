import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const pageCreate = vi.fn();
const tagCreate = vi.fn();
const eventCreate = vi.fn();
const transaction = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    page: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const generateUniquePageSlug = vi.fn();
vi.mock("./slug", () => ({
  generateUniquePageSlug: (...args: unknown[]) => generateUniquePageSlug(...args),
  SlugGenerationError: class SlugGenerationError extends Error {},
}));

import { Prisma } from "../generated/prisma/client";
import { createPage, getPageById, listPages } from "./page";
import { PageLimitError } from "./pageErrors";

function tx() {
  return {
    page: { count, create: pageCreate },
    tag: { create: tagCreate },
    event: { create: eventCreate },
  };
}

function pageRecord(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "市集擺攤週",
    dateRangeStart: "2026-09-01T00:00:00.000Z",
    dateRangeEnd: "2026-09-07T00:00:00.000Z",
    template: "timeline",
    tags: [{ label: "顧攤", color: "orange" }],
    events: [
      { name: "早班", startTime: "2026-09-01T08:00:00.000Z", tagLabel: "顧攤" },
      { name: "晚班", startTime: "2026-09-01T02:00:00.000Z", tagLabel: "顧攤" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  count.mockReset();
  pageCreate.mockReset();
  tagCreate.mockReset();
  eventCreate.mockReset();
  transaction.mockReset();
  generateUniquePageSlug.mockReset();
  findMany.mockReset();
  findFirst.mockReset();

  generateUniquePageSlug.mockResolvedValue("abcd1234");
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx()));
});

describe("createPage", () => {
  it("creates a page with tags and events, sorting events by startTime", async () => {
    count.mockResolvedValue(0);
    pageCreate.mockResolvedValue(pageRecord());
    tagCreate.mockResolvedValue({ id: "tag-1", label: "顧攤", color: "orange" });
    eventCreate
      .mockResolvedValueOnce({
        id: "event-1",
        name: "早班",
        startTime: new Date("2026-09-01T08:00:00.000Z"),
        endTime: null,
        tagId: "tag-1",
        location: null,
        note: null,
      })
      .mockResolvedValueOnce({
        id: "event-2",
        name: "晚班",
        startTime: new Date("2026-09-01T02:00:00.000Z"),
        endTime: null,
        tagId: "tag-1",
        location: null,
        note: null,
      });

    const result = await createPage("user-1", validBody());

    expect(result.slug).toBe("abcd1234");
    expect(result.timezone).toBe("UTC");
    expect(result.tags).toEqual([{ id: "tag-1", label: "顧攤", color: "orange" }]);
    expect(result.events.map((event) => event.id)).toEqual(["event-2", "event-1"]);
    expect(pageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", slug: "abcd1234", timezone: "UTC" }),
    });
    expect(eventCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ tagId: "tag-1" }),
    });
  });

  it("throws PageLimitError when the user already has 10 active pages", async () => {
    count.mockResolvedValue(10);

    await expect(createPage("user-1", validBody({ tags: [], events: [] }))).rejects.toThrow(PageLimitError);
    expect(pageCreate).not.toHaveBeenCalled();
  });

  it("counts only non-soft-deleted pages toward the limit", async () => {
    count.mockResolvedValue(0);
    pageCreate.mockResolvedValue(pageRecord());

    await createPage("user-1", validBody({ tags: [], events: [] }));

    expect(count).toHaveBeenCalledWith({ where: { userId: "user-1", deletedAt: null } });
  });

  it("retries with a new slug when create hits a unique constraint conflict on slug", async () => {
    count.mockResolvedValue(0);
    generateUniquePageSlug.mockResolvedValueOnce("dup00001").mockResolvedValueOnce("free0001");

    const conflictError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["slug"] },
    });
    pageCreate.mockRejectedValueOnce(conflictError).mockResolvedValueOnce(pageRecord({ slug: "free0001" }));

    const result = await createPage("user-1", validBody({ tags: [], events: [] }));

    expect(result.slug).toBe("free0001");
    expect(generateUniquePageSlug).toHaveBeenCalledTimes(2);
  });

  it("does not retry when create fails for a reason unrelated to the slug", async () => {
    count.mockResolvedValue(0);
    const otherError = new Error("connection lost");
    pageCreate.mockRejectedValueOnce(otherError);

    await expect(createPage("user-1", validBody({ tags: [], events: [] }))).rejects.toThrow("connection lost");
    expect(generateUniquePageSlug).toHaveBeenCalledTimes(1);
  });

  it("propagates validation errors without touching the database", async () => {
    await expect(createPage("user-1", validBody({ title: undefined }))).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("listPages", () => {
  it("queries by userId, excludes soft-deleted pages, and orders by createdAt desc", async () => {
    findMany.mockResolvedValue([pageRecord({ id: "page-2" }), pageRecord({ id: "page-1" })]);

    const result = await listPages("user-1");

    expect(result.map((page) => page.id)).toEqual(["page-2", "page-1"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("getPageById", () => {
  it("returns the page with tags and events sorted by startTime when found", async () => {
    findFirst.mockResolvedValue({
      ...pageRecord(),
      tags: [{ id: "tag-1", label: "顧攤", color: "orange" }],
      events: [
        {
          id: "event-1",
          name: "早班",
          startTime: new Date("2026-09-01T02:00:00.000Z"),
          endTime: null,
          tagId: "tag-1",
          location: null,
          note: null,
        },
      ],
    });

    const result = await getPageById("user-1", "page-1");

    expect(result?.tags).toEqual([{ id: "tag-1", label: "顧攤", color: "orange" }]);
    expect(result?.events).toHaveLength(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page-1", userId: "user-1", deletedAt: null },
        include: { tags: true, events: { orderBy: { startTime: "asc" } } },
      }),
    );
  });

  it("returns null when the page does not exist or belongs to another user", async () => {
    findFirst.mockResolvedValue(null);

    const result = await getPageById("user-1", "someone-elses-page");

    expect(result).toBeNull();
  });
});

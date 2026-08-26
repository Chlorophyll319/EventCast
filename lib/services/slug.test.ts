import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("../prisma", () => ({
  prisma: { page: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const nanoidMock = vi.fn();
vi.mock("nanoid", () => ({ nanoid: (...args: unknown[]) => nanoidMock(...args) }));

import { generateUniquePageSlug, SlugGenerationError } from "./slug";

beforeEach(() => {
  findUnique.mockReset();
  nanoidMock.mockReset();
});

describe("generateUniquePageSlug", () => {
  it("returns the first candidate when it is unused", async () => {
    nanoidMock.mockReturnValue("abcd1234");
    findUnique.mockResolvedValue(null);

    await expect(generateUniquePageSlug()).resolves.toBe("abcd1234");
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: "abcd1234" }, select: { id: true } });
  });

  it("retries when a candidate collides, and returns the next unused one", async () => {
    nanoidMock.mockReturnValueOnce("dup00001").mockReturnValueOnce("dup00002").mockReturnValueOnce("free0001");
    findUnique
      .mockResolvedValueOnce({ id: "page-1" })
      .mockResolvedValueOnce({ id: "page-2" })
      .mockResolvedValueOnce(null);

    await expect(generateUniquePageSlug()).resolves.toBe("free0001");
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it("throws SlugGenerationError after exceeding the max retry count", async () => {
    nanoidMock.mockReturnValue("dup00001");
    findUnique.mockResolvedValue({ id: "page-x" });

    await expect(generateUniquePageSlug()).rejects.toThrow(SlugGenerationError);
    expect(findUnique).toHaveBeenCalledTimes(5);
  });
});

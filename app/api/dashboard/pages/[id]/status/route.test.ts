import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUserId = vi.fn();
vi.mock("@/lib/serverSession", () => ({
  getSessionUserId: (...args: unknown[]) => getSessionUserId(...args),
}));

const setPageStatus = vi.fn();
vi.mock("@/lib/services/page", () => ({
  setPageStatus: (...args: unknown[]) => setPageStatus(...args),
}));

import { PageNotFoundError, PageValidationError } from "@/lib/services/pageErrors";
import { PATCH } from "./route";

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/dashboard/pages/p1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://eventcast.example.com", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_BASE_URL = "https://eventcast.example.com";
});

describe("PATCH /api/dashboard/pages/[id]/status", () => {
  it("returns 401 when there is no session", async () => {
    getSessionUserId.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "public" }), paramsFor("p1"));

    expect(response.status).toBe(401);
    expect(setPageStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when the request origin does not match APP_BASE_URL", async () => {
    getSessionUserId.mockResolvedValue("user-1");

    const response = await PATCH(
      patchRequest({ status: "public" }, { origin: "https://evil.example.com" }),
      paramsFor("p1"),
    );

    expect(response.status).toBe(401);
    expect(setPageStatus).not.toHaveBeenCalled();
  });

  it("returns 422 when the request body is not valid JSON", async () => {
    getSessionUserId.mockResolvedValue("user-1");

    const response = await PATCH(patchRequest("not-json"), paramsFor("p1"));

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("VALIDATION_ERROR");
    expect(setPageStatus).not.toHaveBeenCalled();
  });

  it("calls setPageStatus and returns the updated page with a public url on success", async () => {
    getSessionUserId.mockResolvedValue("user-1");
    setPageStatus.mockResolvedValue({ id: "p1", slug: "my-page", status: "public" });

    const response = await PATCH(patchRequest({ status: "public" }), paramsFor("p1"));

    expect(setPageStatus).toHaveBeenCalledWith("user-1", "p1", { status: "public" });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("public");
    expect(data.url).toBe("https://eventcast.example.com/p/my-page");
  });

  it("returns 404 when the page does not exist or belongs to another user", async () => {
    getSessionUserId.mockResolvedValue("user-1");
    setPageStatus.mockRejectedValue(new PageNotFoundError("Page not found."));

    const response = await PATCH(patchRequest({ status: "public" }), paramsFor("missing"));

    expect(response.status).toBe(404);
  });

  it("returns 422 when the status value is invalid", async () => {
    getSessionUserId.mockResolvedValue("user-1");
    setPageStatus.mockRejectedValue(new PageValidationError("Invalid status.", "status"));

    const response = await PATCH(patchRequest({ status: "not-a-status" }), paramsFor("p1"));

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.field).toBe("status");
  });
});

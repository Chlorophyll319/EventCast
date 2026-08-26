import { describe, expect, it } from "vitest";
import { PageValidationError } from "./pageErrors";
import { validateCreatePageInput } from "./pageValidation";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "市集擺攤週",
    dateRangeStart: "2026-09-01T00:00:00.000Z",
    dateRangeEnd: "2026-09-07T00:00:00.000Z",
    template: "timeline",
    tags: [{ label: "顧攤", color: "orange" }],
    events: [
      {
        name: "假日市集",
        startTime: "2026-09-01T02:00:00.000Z",
        tagLabel: "顧攤",
      },
    ],
    ...overrides,
  };
}

function expectFieldError(fn: () => unknown, field: string) {
  try {
    fn();
    throw new Error("expected PageValidationError to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(PageValidationError);
    expect((error as PageValidationError).field).toBe(field);
  }
}

describe("validateCreatePageInput", () => {
  it("accepts a fully valid input and normalizes dates", () => {
    const result = validateCreatePageInput(validInput());
    expect(result.title).toBe("市集擺攤週");
    expect(result.dateRangeStart).toBeInstanceOf(Date);
    expect(result.template).toBe("timeline");
    expect(result.tags).toEqual([{ label: "顧攤", color: "orange" }]);
    expect(result.events[0].tagLabel).toBe("顧攤");
  });

  it("accepts input with no tags or events", () => {
    const result = validateCreatePageInput(validInput({ tags: undefined, events: undefined }));
    expect(result.tags).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it("rejects a non-object body", () => {
    expectFieldError(() => validateCreatePageInput("not an object"), "body");
  });

  it("rejects a missing title", () => {
    expectFieldError(() => validateCreatePageInput(validInput({ title: undefined })), "title");
  });

  it("rejects a title over the length limit", () => {
    expectFieldError(() => validateCreatePageInput(validInput({ title: "a".repeat(101) })), "title");
  });

  it("rejects an invalid dateRangeStart", () => {
    expectFieldError(
      () => validateCreatePageInput(validInput({ dateRangeStart: "not-a-date" })),
      "dateRangeStart",
    );
  });

  it("rejects an invalid template", () => {
    expectFieldError(() => validateCreatePageInput(validInput({ template: "grid" })), "template");
  });

  it("rejects an invalid tag color", () => {
    expectFieldError(
      () => validateCreatePageInput(validInput({ tags: [{ label: "顧攤", color: "neon" }] })),
      "tags[0].color",
    );
  });

  it("rejects duplicate tag labels within the same request", () => {
    expectFieldError(
      () =>
        validateCreatePageInput(
          validInput({
            tags: [
              { label: "顧攤", color: "orange" },
              { label: "顧攤", color: "blue" },
            ],
          }),
        ),
      "tags[1].label",
    );
  });

  it("rejects an event name over the length limit", () => {
    expectFieldError(
      () =>
        validateCreatePageInput(
          validInput({ events: [{ name: "a".repeat(101), startTime: "2026-09-01T02:00:00.000Z" }] }),
        ),
      "events[0].name",
    );
  });

  it("rejects an event tagLabel with no matching tag in the same request", () => {
    expectFieldError(
      () =>
        validateCreatePageInput(
          validInput({
            tags: [],
            events: [
              {
                name: "假日市集",
                startTime: "2026-09-01T02:00:00.000Z",
                tagLabel: "顧攤",
              },
            ],
          }),
        ),
      "events[0].tagLabel",
    );
  });

  it("allows multiple events to reference the same tagLabel", () => {
    const result = validateCreatePageInput(
      validInput({
        events: [
          { name: "早班", startTime: "2026-09-01T01:00:00.000Z", tagLabel: "顧攤" },
          { name: "晚班", startTime: "2026-09-01T08:00:00.000Z", tagLabel: "顧攤" },
        ],
      }),
    );
    expect(result.events).toHaveLength(2);
    expect(result.events.every((event) => event.tagLabel === "顧攤")).toBe(true);
  });

  it("rejects events that is not an array", () => {
    expectFieldError(() => validateCreatePageInput(validInput({ events: "nope" })), "events");
  });
});

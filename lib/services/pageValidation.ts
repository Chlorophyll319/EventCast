import { PageTemplate, TagColor } from "../generated/prisma/enums";
import { PageValidationError } from "./pageErrors";

const TITLE_MAX_LENGTH = 100;
const EVENT_NAME_MAX_LENGTH = 100;
const LOCATION_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 500;

const PAGE_TEMPLATES = new Set<string>(Object.values(PageTemplate));
const TAG_COLORS = new Set<string>(Object.values(TagColor));

export interface ValidatedTag {
  label: string;
  color: TagColor;
}

export interface ValidatedEvent {
  name: string;
  startTime: Date;
  endTime: Date | null;
  tagLabel: string | null;
  location: string | null;
  note: string | null;
}

export interface ValidatedCreatePageInput {
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  template: PageTemplate;
  tags: ValidatedTag[];
  events: ValidatedEvent[];
}

export function validateCreatePageInput(body: unknown): ValidatedCreatePageInput {
  if (typeof body !== "object" || body === null) {
    throw new PageValidationError("Request body must be a JSON object.", "body");
  }
  const input = body as Record<string, unknown>;

  const title = validateRequiredString(input.title, "title", TITLE_MAX_LENGTH);
  const dateRangeStart = validateRequiredDate(input.dateRangeStart, "dateRangeStart");
  const dateRangeEnd = validateRequiredDate(input.dateRangeEnd, "dateRangeEnd");
  const template = validateTemplate(input.template);
  const tags = validateTags(input.tags);
  const events = validateEvents(input.events, tags);

  return { title, dateRangeStart, dateRangeEnd, template, tags, events };
}

function validateRequiredString(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PageValidationError(`${field} is required and must be a non-empty string.`, field);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new PageValidationError(`${field} must be at most ${maxLength} characters.`, field);
  }
  return value;
}

function validateOptionalString(value: unknown, field: string, maxLength?: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PageValidationError(`${field} must be a string.`, field);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new PageValidationError(`${field} must be at most ${maxLength} characters.`, field);
  }
  return value;
}

function validateRequiredDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PageValidationError(`${field} must be a valid ISO date string.`, field);
  }
  return new Date(value);
}

function validateOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PageValidationError(`${field} must be a valid ISO date string.`, field);
  }
  return new Date(value);
}

function validateTemplate(value: unknown): PageTemplate {
  if (typeof value !== "string" || !PAGE_TEMPLATES.has(value)) {
    throw new PageValidationError("template must be one of the allowed values.", "template");
  }
  return value as PageTemplate;
}

function validateTagColor(value: unknown, field: string): TagColor {
  if (typeof value !== "string" || !TAG_COLORS.has(value)) {
    throw new PageValidationError("color must be one of the allowed values.", field);
  }
  return value as TagColor;
}

function validateTags(value: unknown): ValidatedTag[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PageValidationError("tags must be an array.", "tags");
  }

  const seenLabels = new Set<string>();
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each tag must be an object.", `tags[${index}]`);
    }
    const tag = raw as Record<string, unknown>;
    const label = validateRequiredString(tag.label, `tags[${index}].label`);
    if (seenLabels.has(label)) {
      throw new PageValidationError(`Duplicate tag label '${label}'.`, `tags[${index}].label`);
    }
    seenLabels.add(label);
    const color = validateTagColor(tag.color, `tags[${index}].color`);
    return { label, color };
  });
}

function validateEvents(value: unknown, tags: ValidatedTag[]): ValidatedEvent[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PageValidationError("events must be an array.", "events");
  }

  const tagLabels = new Set(tags.map((tag) => tag.label));

  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each event must be an object.", `events[${index}]`);
    }
    const event = raw as Record<string, unknown>;
    const name = validateRequiredString(event.name, `events[${index}].name`, EVENT_NAME_MAX_LENGTH);
    const startTime = validateRequiredDate(event.startTime, `events[${index}].startTime`);
    const endTime = validateOptionalDate(event.endTime, `events[${index}].endTime`);
    const location = validateOptionalString(event.location, `events[${index}].location`, LOCATION_MAX_LENGTH);
    const note = validateOptionalString(event.note, `events[${index}].note`, NOTE_MAX_LENGTH);
    const tagLabel = validateOptionalString(event.tagLabel, `events[${index}].tagLabel`);

    if (tagLabel !== null && !tagLabels.has(tagLabel)) {
      throw new PageValidationError(
        `tagLabel '${tagLabel}' does not match any tag in this request.`,
        `events[${index}].tagLabel`,
      );
    }

    return { name, startTime, endTime, tagLabel, location, note };
  });
}

export class PageValidationError extends Error {
  field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

export class PageLimitError extends Error {}

export class PageNotFoundError extends Error {}

export class HttpError extends Error {
  declare readonly status: number;

  constructor(status: number, message?: string) {
    super(message);
    throw new Error('Not implemented');
  }
}

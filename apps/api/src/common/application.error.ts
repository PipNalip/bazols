export type ApplicationErrorCode =
  | 'AUTH_FORBIDDEN'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REQUIRED'
  | 'CSRF_INVALID'
  | 'INPUT_INVALID'
  | 'REPORT_CURRENCY_CONFLICT'
  | 'RESOURCE_CONFLICT'
  | 'RESOURCE_NOT_FOUND'
  | 'SYNC_ACTIVE_CONFLICT'
  | 'SYNC_INVALID_TRANSITION';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'ApplicationError';
  }
}

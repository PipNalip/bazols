export type SourceErrorCode =
  | 'SOURCE_AUTH_FAILED'
  | 'SOURCE_CONTRACT_INVALID'
  | 'SOURCE_DUPLICATE_ID'
  | 'SOURCE_EMPTY_UNEXPECTED'
  | 'SOURCE_MONEY_MISMATCH'
  | 'SOURCE_OPERATION_UNKNOWN'
  | 'SOURCE_PAGINATION_INVALID'
  | 'SOURCE_REDIRECT_BLOCKED'
  | 'SOURCE_RESPONSE_UNSUCCESSFUL'
  | 'SOURCE_TRANSPORT_FAILED'
  | 'SOURCE_UNIT_UNAVAILABLE';

export class SourceError extends Error {
  constructor(
    public readonly code: SourceErrorCode,
    public readonly endpoint?: string,
    public readonly correlationId?: string,
  ) {
    super(
      [
        code,
        endpoint ? `endpoint=${endpoint}` : undefined,
        correlationId ? `correlationId=${correlationId}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    );
    this.name = 'SourceError';
  }
}

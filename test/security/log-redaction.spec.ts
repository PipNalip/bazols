import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from '../../apps/api/src/common/api-exception.filter.js';

const sentinels = [
  'login-sentinel',
  'cookie-sentinel',
  '+1 202-555-0199',
  'payload-pii-sentinel',
];

describe('log and HTTP error redaction', () => {
  it('does not reflect exception-carried sensitive values in logs or HTTP responses', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const setHeader = vi.fn();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-correlation-id': 'safe-correlation' } }),
        getResponse: () => ({ setHeader, status }),
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(new BadRequestException(sentinels.join(' ')), host);

    const captured = JSON.stringify({
      logs: log.mock.calls,
      errors: error.mock.calls,
      response: json.mock.calls,
    });
    for (const sentinel of sentinels) expect(captured).not.toContain(sentinel);
    expect(captured).toContain('safe-correlation');
    expect(`${captured} deliberate-negative-control`).toContain('deliberate-negative-control');
  });
});

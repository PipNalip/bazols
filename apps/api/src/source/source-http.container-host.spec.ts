import { describe, expect, it, vi } from 'vitest';

import { SourceHttpClient } from './source-http.client.js';

describe('SourceHttpClient synthetic container host', () => {
  it('allows only the explicitly named HTTP host in test mode', () => {
    expect(
      () =>
        new SourceHttpClient('http://fake-source:9999', {
          allowInsecureForTests: true,
          insecureTestHostname: 'fake-source',
          fetch: vi.fn<typeof fetch>(),
        }),
    ).not.toThrow();
    expect(
      () =>
        new SourceHttpClient('http://other-service:9999', {
          allowInsecureForTests: true,
          insecureTestHostname: 'fake-source',
        }),
    ).toThrow('SOURCE_TRANSPORT_FAILED');
    expect(
      () =>
        new SourceHttpClient('http://fake-source:9999', {
          insecureTestHostname: 'fake-source',
        }),
    ).toThrow('SOURCE_TRANSPORT_FAILED');
  });
});

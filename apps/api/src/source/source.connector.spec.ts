import { afterEach, describe, expect, it } from 'vitest';

import { startFakeSource, type FakeSource } from '../../../../test/fake-source/server.js';
import { SourceConnector } from './source.connector.js';
import { SourceConnectorFactory } from './source-connector.factory.js';
import { SourceHttpClient } from './source-http.client.js';

const unitId = '10000000-0000-4000-8000-000000000001';
const sources: FakeSource[] = [];

async function connector(
  options: Parameters<typeof startFakeSource>[0] = {},
  credentials = { login: 'source-login', password: 'source-password' },
): Promise<{ connector: SourceConnector; source: FakeSource }> {
  const source = await startFakeSource(options);
  sources.push(source);
  return {
    source,
    connector: new SourceConnector(
      new SourceHttpClient(source.url, { allowInsecureForTests: true }),
      credentials,
    ),
  };
}

const request = {
  sourceUnitId: unitId,
  sourceRole: 'SYNTHETIC_REPORT_VIEWER',
  beginDate: '2026-09-01',
  endDate: '2026-09-30',
  pageSize: 50,
  correlationId: 'correlation-collect',
};

afterEach(async () => {
  await Promise.all(sources.splice(0).map((source) => source.close()));
});

describe('SourceConnector', () => {
  it('creates a fresh connector and cookie jar for every operation', () => {
    const factory = new SourceConnectorFactory({
      baseUrl: 'https://source.example.invalid',
      login: 'source-login',
      password: 'source-password',
      allowInsecureForTests: false,
    });

    expect(factory.create()).not.toBe(factory.create());
  });

  it('discovers only safe unit and role metadata through GET requests', async () => {
    const setup = await connector();

    const units = await setup.connector.discover('correlation-discovery');

    expect(units).toEqual([
      {
        id: unitId,
        roles: ['SYNTHETIC_REPORT_VIEWER'],
      },
    ]);
    expect(setup.source.calls).toEqual(['authenticate', 'permissions']);
  });

  it('collects a complete validated report in restaurant context', async () => {
    const setup = await connector();

    const result = await setup.connector.collectReport(request);

    expect(result.kind).toBe('data');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.response.data.totalRows).toBe(2);
    expect(setup.source.calls).toEqual([
      'authenticate',
      'permissions',
      'setRole',
      'employeeRating:1',
    ]);
  });

  it('fails before report fetch when the restaurant context is unavailable', async () => {
    const setup = await connector();

    await expect(
      setup.connector.collectReport({ ...request, sourceUnitId: 'unavailable-unit' }),
    ).rejects.toMatchObject({ code: 'SOURCE_UNIT_UNAVAILABLE' });
    expect(setup.source.calls).toEqual(['authenticate', 'permissions']);
  });

  it('maps authentication failure to a safe code', async () => {
    const setup = await connector({ authFailure: true });

    await expect(setup.connector.collectReport(request)).rejects.toMatchObject({
      code: 'SOURCE_AUTH_FAILED',
    });
    expect(setup.source.calls).toEqual(['authenticate']);
  });

  it('requests page two when totalRows is larger than the first page', async () => {
    const setup = await connector();

    const result = await setup.connector.collectReport({ ...request, pageSize: 1 });

    expect(result.kind).toBe('data');
    expect(result.pages).toHaveLength(2);
    expect(setup.source.calls).toContain('employeeRating:2');
  });

  it.each([
    { repeatedPagination: true },
    { contradictoryPagination: true },
    { duplicateOrderAcrossPages: true },
    { duplicateItemAcrossPages: true },
  ])('fails closed on contradictory or repeated pagination: %o', async (options) => {
    const setup = await connector(options);

    await expect(
      setup.connector.collectReport({ ...request, pageSize: 1 }),
    ).rejects.toMatchObject({ code: 'SOURCE_PAGINATION_INVALID' });
  });

  it('exposes malformed raw page bytes to the snapshot hook before parsing fails', async () => {
    const setup = await connector({
      malformedRating: true,
      responseSentinel: 'malformed-response-sentinel',
    });
    const captured: Buffer[] = [];

    await expect(
      setup.connector.collectReport(request, (page) => {
        captured.push(page.body);
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_CONTRACT_INVALID' });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.toString('utf8')).toContain('malformed-response-sentinel');
  });

  it('represents an empty successful result distinctly', async () => {
    const setup = await connector({ empty: true });

    const result = await setup.connector.collectReport(request);

    expect(result).toMatchObject({ kind: 'empty', totalRows: 0 });
    expect(result.pages).toHaveLength(1);
  });

  it('does not expose credentials or response PII in failures', async () => {
    const setup = await connector(
      { authFailure: true, responseSentinel: 'response-pii-sentinel' },
      { login: 'login-sentinel', password: 'password-sentinel' },
    );

    let error: unknown;
    try {
      await setup.connector.collectReport(request);
    } catch (caught) {
      error = caught;
    }

    const output = JSON.stringify(error) + String(error);
    expect(output).not.toContain('login-sentinel');
    expect(output).not.toContain('password-sentinel');
    expect(output).not.toContain('response-pii-sentinel');
  });
});

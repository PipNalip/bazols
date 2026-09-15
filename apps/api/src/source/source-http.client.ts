import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { SourceError } from './source.errors.js';
import { buildSourceRoute, type SourceOperation } from './source-routes.js';

export type SourceHttpResponse = {
  body: Buffer;
  contentType: string;
  status: number;
};

type SourceHttpClientOptions = {
  allowInsecureForTests?: boolean;
  fetch?: typeof fetch;
};

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

export class SourceHttpClient {
  readonly #baseUrl: URL;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, options: SourceHttpClientOptions = {}) {
    this.#baseUrl = new URL(baseUrl);
    const isLoopback = ['127.0.0.1', '::1', 'localhost'].includes(this.#baseUrl.hostname);
    const allowsLoopbackHttp =
      options.allowInsecureForTests === true &&
      this.#baseUrl.protocol === 'http:' &&
      isLoopback;
    if (
      (this.#baseUrl.protocol !== 'https:' && !allowsLoopbackHttp) ||
      this.#baseUrl.username !== '' ||
      this.#baseUrl.password !== '' ||
      this.#baseUrl.search !== '' ||
      this.#baseUrl.hash !== ''
    ) {
      throw new SourceError('SOURCE_TRANSPORT_FAILED');
    }

    const baseFetch = options.fetch ?? globalThis.fetch;
    const guardedFetch: typeof fetch = async (input, init) => {
      const response = await baseFetch(input, { ...init, redirect: 'manual' });
      if (isRedirect(response)) {
        throw new SourceError('SOURCE_REDIRECT_BLOCKED');
      }
      return response;
    };

    this.#fetch = makeFetchCookie(guardedFetch, new CookieJar());
  }

  async execute(
    operation: SourceOperation,
    correlationId: string,
  ): Promise<SourceHttpResponse> {
    const route = buildSourceRoute(operation, correlationId);
    const url = new URL(route.path, this.#baseUrl);
    url.search = route.query.toString();

    let response: Response;
    try {
      response = await this.#fetch(url, { method: 'GET', redirect: 'follow' });
    } catch (error) {
      if (error instanceof SourceError) {
        throw new SourceError(error.code, route.endpoint, correlationId);
      }
      throw new SourceError('SOURCE_TRANSPORT_FAILED', route.endpoint, correlationId);
    }

    if (!response.ok) {
      const code =
        route.endpoint === 'authenticate' && response.status === 401
          ? 'SOURCE_AUTH_FAILED'
          : 'SOURCE_TRANSPORT_FAILED';
      throw new SourceError(code, route.endpoint, correlationId);
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      status: response.status,
    };
  }
}

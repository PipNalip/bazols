import type { Request } from 'express';

import type { AuthenticatedUser } from './session.service.js';

export type AuthenticatedRequest = Request & {
  authUser?: AuthenticatedUser;
  sessionToken?: string;
};

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthenticatedRequest, readCookie } from './auth-request.js';
import { SessionService } from './session.service.js';
import { APP_ORIGIN, SESSION_COOKIE } from './tokens.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_ORIGIN) private readonly allowedOrigin: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.headers.origin !== this.allowedOrigin) {
      throw new ForbiddenException('Origin rejected');
    }
    return true;
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }
    const user = await this.sessions.authenticate(token);
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    request.authUser = user;
    request.sessionToken = token;
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const csrf = request.headers['x-csrf-token'];
    if (
      !request.sessionToken ||
      typeof csrf !== 'string' ||
      !this.sessions.validateCsrf(request.sessionToken, csrf)
    ) {
      throw new ForbiddenException('CSRF validation failed');
    }
    return true;
  }
}

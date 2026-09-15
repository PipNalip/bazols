import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { correlationId } from '../common/correlation.js';
import { PrismaService } from '../db/prisma.service.js';
import type { AuthenticatedRequest } from './auth-request.js';
import { CsrfGuard, OriginGuard, SessionGuard } from './auth.guards.js';
import { PasswordService } from './password.service.js';
import { LoginRateLimiter } from './rate-limiter.service.js';
import { SessionService } from './session.service.js';
import { COOKIE_SECURE, SESSION_COOKIE } from './tokens.js';

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(1_024),
});

@Controller('/api/auth')
export class AuthController {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly rateLimiter: LoginRateLimiter,
    @Inject(COOKIE_SECURE) private readonly secureCookie: boolean,
  ) {
    this.dummyHash = passwords.hash('dummy-password-never-authenticates');
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async login(
    @Body() input: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const parsed = credentialsSchema.safeParse(input);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const username = parsed.data.username.toLowerCase();
    const rateIp = request.ip ?? 'unknown';
    if (!this.rateLimiter.consume(rateIp, username)) {
      throw new HttpException('Too many login attempts', 429);
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    const valid = await this.passwords.verify(
      user?.passwordHash ?? (await this.dummyHash),
      parsed.data.password,
    );
    if (!user || !user.active || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.rateLimiter.reset(rateIp);
    const session = await this.sessions.create(user.id, new Date(), {
      actorId: user.id,
      eventType: 'AUTH_LOGIN',
      correlationId: correlationId(request),
    });
    response.cookie(SESSION_COOKIE, session.token, this.#cookieOptions(session.expiresAt));
    return {
      user: { id: user.id, username: user.username, role: user.role },
      csrfToken: session.csrfToken,
    };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest): unknown {
    return {
      user: request.authUser,
      csrfToken: this.sessions.csrfFor(request.sessionToken!),
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(OriginGuard, SessionGuard, CsrfGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.revoke(request.sessionToken!, new Date(), {
      actorId: request.authUser!.id,
      eventType: 'AUTH_LOGOUT',
      correlationId: correlationId(request),
    });
    response.clearCookie(SESSION_COOKIE, this.#cookieOptions());
  }

  #cookieOptions(expires?: Date): {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/api';
    expires?: Date;
  } {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secureCookie,
      path: '/api',
      ...(expires ? { expires } : {}),
    };
  }
}

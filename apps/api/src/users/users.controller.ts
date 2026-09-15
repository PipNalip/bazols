import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth-request.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { correlationId } from '../common/correlation.js';
import { mapApplicationError } from '../common/http-error.js';
import {
  createManagerSchema,
  replaceAssignmentsSchema,
  resetPasswordSchema,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('/api/users')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  @UseGuards(OriginGuard, CsrfGuard)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = createManagerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid manager');
    }
    return mapApplicationError(() =>
      this.users.create(parsed.data, request.authUser!.id, correlationId(request)),
    );
  }

  @Put(':id/restaurants')
  @HttpCode(200)
  @UseGuards(OriginGuard, CsrfGuard)
  replaceAssignments(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = replaceAssignmentsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid assignments');
    }
    return mapApplicationError(() =>
      this.users.replaceAssignments(
        id,
        parsed.data.restaurantIds,
        request.authUser!.id,
        correlationId(request),
      ),
    );
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @UseGuards(OriginGuard, CsrfGuard)
  resetPassword(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid password');
    }
    return mapApplicationError(() =>
      this.users.resetPassword(
        id,
        parsed.data.temporaryPassword,
        request.authUser!.id,
        correlationId(request),
      ),
    );
  }

  @Post(':id/block')
  @HttpCode(200)
  @UseGuards(OriginGuard, CsrfGuard)
  block(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return mapApplicationError(() =>
      this.users.block(id, request.authUser!.id, correlationId(request)),
    );
  }
}

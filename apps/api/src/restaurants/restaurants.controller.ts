import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth-request.js';
import { CsrfGuard, OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { correlationId } from '../common/correlation.js';
import { mapApplicationError } from '../common/http-error.js';
import { restaurantMappingSchema } from './restaurants.dto.js';
import { RestaurantsService } from './restaurants.service.js';

@Controller('/api/restaurants')
@UseGuards(SessionGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.restaurants.list(request.authUser!);
  }

  @Post()
  @Roles('ADMIN')
  @UseGuards(OriginGuard, CsrfGuard)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = restaurantMappingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid restaurant mapping');
    }
    return mapApplicationError(() =>
      this.restaurants.create(parsed.data, request.authUser!.id, correlationId(request)),
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  @UseGuards(OriginGuard, CsrfGuard)
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = restaurantMappingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid restaurant mapping');
    }
    return mapApplicationError(() =>
      this.restaurants.update(id, parsed.data, request.authUser!.id, correlationId(request)),
    );
  }
}

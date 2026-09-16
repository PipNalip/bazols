import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/auth-request.js';
import { SessionGuard } from '../auth/auth.guards.js';
import { mapApplicationError } from '../common/http-error.js';
import { RestaurantAccessService } from '../restaurants/restaurant-access.service.js';
import { EmployeeRankingService } from './employee-ranking.service.js';
import { ProductRankingService } from './product-ranking.service.js';
import { employeeReportQuerySchema, productReportQuerySchema } from './reports.dto.js';

@Controller('/api/restaurants/:restaurantId/reports')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    private readonly access: RestaurantAccessService,
    private readonly employees: EmployeeRankingService,
    private readonly products: ProductRankingService,
  ) {}

  @Get('employees')
  employeesReport(
    @Param('restaurantId') restaurantId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = employeeReportQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid report query');
    return mapApplicationError(async () => {
      await this.access.assertAccess(request.authUser!, restaurantId);
      return this.employees.get(restaurantId, parsed.data.from, parsed.data.to, parsed.data.sort);
    });
  }

  @Get('products')
  productsReport(
    @Param('restaurantId') restaurantId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = productReportQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid report query');
    return mapApplicationError(async () => {
      await this.access.assertAccess(request.authUser!, restaurantId);
      return this.products.get(restaurantId, parsed.data.from, parsed.data.to, parsed.data.sort);
    });
  }
}

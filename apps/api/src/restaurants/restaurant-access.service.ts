import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/session.service.js';
import { PrismaService } from '../db/prisma.service.js';

@Injectable()
export class RestaurantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(user: AuthenticatedUser, restaurantId: string): Promise<void> {
    if (user.role === 'ADMIN') {
      return;
    }
    const assignment = await this.prisma.userRestaurant.findFirst({
      where: {
        userId: user.id,
        restaurantId,
        restaurant: { active: true },
      },
      select: { userId: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Forbidden');
    }
  }
}

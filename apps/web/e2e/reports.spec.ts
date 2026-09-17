import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const username = 'e2e-phase3-manager';
const password = 'synthetic-e2e-password';
const restaurantSourceId = 'e2e-phase3-restaurant';

async function removeFixture() {
  const restaurant = await prisma.restaurant.findUnique({ where: { sourceUnitId: restaurantSourceId } });
  if (restaurant) {
    await prisma.productCostSnapshot.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.materialCostSnapshot.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.orderItem.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.employee.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.product.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.material.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.syncRun.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
  }
  await prisma.user.deleteMany({ where: { username } });
}

test.beforeAll(async () => {
  await removeFixture();
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password),
      role: 'MANAGER',
    },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      sourceUnitId: restaurantSourceId,
      sourceRole: 'manager',
      timezone: 'Europe/Moscow',
      displayName: 'E2E Restaurant',
      users: { create: { userId: user.id } },
    },
  });
  const syncRun = await prisma.syncRun.create({
    data: {
      restaurantId: restaurant.id,
      requestedById: user.id,
      beginDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'SUCCEEDED',
      employeesCount: 2,
      ordersCount: 3,
      productsCount: 2,
      orderItemsCount: 3,
      finishedAt: new Date('2026-09-15T10:00:00.000Z'),
    },
  });
  const [anna, boris, ayran, borscht] = await Promise.all([
    prisma.employee.create({
      data: { restaurantId: restaurant.id, sourceId: 'employee-anna', displayName: 'Анна' },
    }),
    prisma.employee.create({
      data: { restaurantId: restaurant.id, sourceId: 'employee-boris', displayName: 'Борис' },
    }),
    prisma.product.create({
      data: { restaurantId: restaurant.id, sourceId: 'product-ayran', displayName: 'Айран' },
    }),
    prisma.product.create({
      data: { restaurantId: restaurant.id, sourceId: 'product-borscht', displayName: 'Борщ' },
    }),
  ]);
  const orders = await Promise.all([
    prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        sourceId: 'order-anna',
        employeeId: anna.id,
        occurredAt: new Date('2026-09-10T09:00:00.000Z'),
        price: '100.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
    }),
    prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        sourceId: 'order-boris-1',
        employeeId: boris.id,
        occurredAt: new Date('2026-09-11T09:00:00.000Z'),
        price: '40.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
    }),
    prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        sourceId: 'order-boris-2',
        employeeId: boris.id,
        occurredAt: new Date('2026-09-12T09:00:00.000Z'),
        price: '60.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
    }),
  ]);
  await prisma.orderItem.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        sourceId: 'item-ayran',
        orderId: orders[0].id,
        productId: ayran.id,
        priceWithDiscountForOrder: '100.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
      {
        restaurantId: restaurant.id,
        sourceId: 'item-borscht-1',
        orderId: orders[1].id,
        productId: borscht.id,
        priceWithDiscountForOrder: '40.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
      {
        restaurantId: restaurant.id,
        sourceId: 'item-borscht-2',
        orderId: orders[2].id,
        productId: borscht.id,
        priceWithDiscountForOrder: '60.00',
        currency: 'RUB',
        lastSeenSyncRunId: syncRun.id,
      },
    ],
  });
  await prisma.productCostSnapshot.create({
    data: {
      restaurantId: restaurant.id,
      productId: ayran.id,
      lastSeenSyncRunId: syncRun.id,
      effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
      sourceUnitId: restaurantSourceId,
      sourceTradeAreaId: 'e2e-trade-area',
      autoCost: '40.00',
      averageAutoCost: '40.00',
      reportedPrice: '100.00',
      fc: '0',
      extraCharge: '0',
      isTotalCost: false,
    },
  });
});

test.afterAll(async () => {
  await removeFixture();
  await prisma.$disconnect();
});

test('manager logs in, chooses a period and explores both rankings', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill(username);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { name: 'Рейтинги' })).toBeVisible();
  await expect(page.getByLabel('Ресторан')).toHaveText(/E2E Restaurant/);
  await page.getByLabel('Дата начала').fill('2026-09-01');
  await page.getByLabel('Дата окончания').fill('2026-09-30');

  const employees = page.getByRole('table', { name: 'Рейтинг сотрудников' });
  await expect(employees.getByRole('row').nth(1)).toContainText('Анна');
  await page.getByRole('button', { name: 'По заказам' }).click();
  await expect(employees.getByRole('row').nth(1)).toContainText('Борис');

  await page.getByRole('tab', { name: 'Товары' }).click();
  const products = page.getByRole('table', { name: 'Рейтинг товаров' });
  await expect(products.getByRole('row').nth(1)).toContainText('Борщ');
  await expect(products.getByRole('columnheader', { name: 'Себестоимость' })).toBeVisible();
  await expect(products.getByRole('columnheader', { name: 'Валовая маржа' })).toBeVisible();
  await expect(products.getByRole('columnheader', { name: 'Маржа %' })).toBeVisible();
  await expect(page.getByText('Покрытие себестоимостью: 1 из 3 ед. (33,33 %)')).toBeVisible();
  await expect(products.getByRole('row').filter({ hasText: 'Борщ' })).toContainText('Нет данных');
  await page.getByRole('button', { name: 'По себестоимости' }).click();
  await expect(products.getByRole('row').nth(1)).toContainText('Айран');
  await expect(products.getByRole('row').nth(1)).toContainText('40,00');
  await page.getByRole('button', { name: 'По валовой марже' }).click();
  await expect(products.getByRole('row').nth(1)).toContainText('Айран');
  await expect(products.getByRole('row').nth(1)).toContainText('60,00');
});

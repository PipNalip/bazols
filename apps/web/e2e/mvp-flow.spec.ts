import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const adminUsername = 'e2e-mvp-admin';
const adminPassword = 'synthetic-admin-password';
const managerUsername = 'e2e-mvp-manager';
const managerPassword = 'synthetic-manager-password';
const sourceUnitId = '10000000-0000-4000-8000-000000000001';
const otherSourceUnitId = '20000000-0000-4000-8000-000000000002';

async function cleanupFixture() {
  const users = await prisma.user.findMany({ where: { username: { in: [adminUsername, managerUsername] } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  const restaurants = await prisma.restaurant.findMany({ where: { sourceUnitId: { in: [sourceUnitId, otherSourceUnitId] } } });
  for (const restaurant of restaurants) {
    await prisma.auditEvent.deleteMany({ where: { OR: [{ restaurantId: restaurant.id }, { actorId: { in: userIds } }] } });
    await prisma.orderItem.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.product.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.employee.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.rawSnapshot.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.syncRun.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.userRestaurant.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
  }
  if (userIds.length) {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRestaurant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

test.beforeAll(async () => {
  await cleanupFixture();
  const output = execFileSync('node', ['--env-file-if-exists=.env', 'apps/api/dist/create-admin.js', adminUsername], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    input: adminPassword,
  });
  expect(output).toContain('Administrator created');
  expect(output).not.toContain(adminUsername);
  expect(output).not.toContain(adminPassword);
});

test.afterAll(async () => {
  await cleanupFixture();
  await prisma.$disconnect();
});

test('admin runs the complete fake-source flow and provisions a scoped manager', async ({ page, request, context }) => {
  const browserOutput: string[] = [];
  page.on('console', (message) => browserOutput.push(message.text()));
  page.on('pageerror', (error) => browserOutput.push(error.message));
  await page.goto('/');
  await page.getByLabel('Логин').fill(adminUsername);
  await page.getByLabel('Пароль').fill(adminPassword);
  await page.getByRole('button', { name: 'Войти' }).click();

  await context.addCookies([{ name: 'privacy_probe', value: 'cookie-sentinel', url: 'http://127.0.0.1:5173' }]);
  const invalidResponse = await page.evaluate(async () => {
    const response = await fetch('/api/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'payload-pii-sentinel' }),
    });
    return response.text();
  });
  expect(invalidResponse).not.toContain('payload-pii-sentinel');

  await page.getByRole('link', { name: 'Синхронизация' }).click();
  await page.getByRole('button', { name: 'Добавить ресторан' }).click();
  await page.getByLabel('Название ресторана').fill('MVP E2E Restaurant');
  await page.getByLabel('Часовой пояс').fill('Europe/Moscow');
  await expect(page.getByRole('button', { name: 'Сохранить ресторан' })).toBeEnabled();
  await page.getByRole('button', { name: 'Сохранить ресторан' }).click();
  await expect(page.getByRole('status')).toContainText('Ресторан добавлен');

  await page.getByLabel('Дата начала').fill('2026-09-01');
  await page.getByLabel('Дата окончания').fill('2026-09-16');
  await page.getByRole('button', { name: 'Запустить синхронизацию' }).click();
  await expect(page.getByRole('status')).toContainText('Синхронизация поставлена в очередь');
  await expect(page.getByRole('table', { name: 'Журнал синхронизаций' })).toContainText('Завершена', { timeout: 15_000 });

  await page.getByRole('link', { name: 'Рейтинги' }).click();
  await page.getByLabel('Дата начала').fill('2026-09-01');
  await page.getByLabel('Дата окончания').fill('2026-09-16');
  await expect(page.getByRole('table', { name: 'Рейтинг сотрудников' })).toContainText('Synthetic Employee Alpha');
  await page.getByRole('tab', { name: 'Товары' }).click();
  await expect(page.getByRole('table', { name: 'Рейтинг товаров' })).toContainText('Synthetic Tea');

  await request.post('http://127.0.0.1:9999/__control', { data: { malformedRating: true } });
  await page.getByRole('link', { name: 'Синхронизация' }).click();
  await page.getByLabel('Дата начала').fill('2026-09-01');
  await page.getByLabel('Дата окончания').fill('2026-09-16');
  await page.getByRole('button', { name: 'Запустить синхронизацию' }).click();
  await expect(page.getByRole('table', { name: 'Журнал синхронизаций' })).toContainText('Ошибка', { timeout: 15_000 });
  await expect(page.getByRole('table', { name: 'Журнал синхронизаций' })).toContainText('SOURCE_CONTRACT_INVALID');
  await page.getByRole('link', { name: 'Рейтинги' }).click();
  await expect(page.getByText('Последняя синхронизация завершилась ошибкой. Показаны последние успешно загруженные данные.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Рейтинг сотрудников' })).toContainText('Synthetic Employee Alpha');

  await page.getByRole('link', { name: 'Пользователи' }).click();
  await page.getByRole('button', { name: 'Добавить менеджера' }).click();
  await page.getByLabel('Логин').fill(managerUsername);
  await page.getByLabel('Временный пароль').fill(managerPassword);
  await page.getByRole('checkbox', { name: 'MVP E2E Restaurant' }).check();
  await page.getByRole('button', { name: 'Создать менеджера' }).click();
  await expect(page.getByRole('status')).toContainText('Менеджер создан');

  const otherRestaurant = await prisma.restaurant.create({
    data: {
      sourceUnitId: otherSourceUnitId,
      sourceRole: 'SYNTHETIC_REPORT_VIEWER',
      timezone: 'UTC',
      displayName: 'Unassigned E2E Restaurant',
    },
  });

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByLabel('Логин').fill(managerUsername);
  await page.getByLabel('Пароль').fill(managerPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Рейтинги' })).toBeVisible();
  const deniedStatus = await page.evaluate(async (restaurantId) => {
    const response = await fetch(`/api/restaurants/${restaurantId}/reports/employees?from=2026-09-01&to=2026-09-16&sort=revenue`);
    return response.status;
  }, otherRestaurant.id);
  expect(deniedStatus).toBe(403);
  await expect(page.getByRole('link', { name: 'Пользователи' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Рейтинги' })).toBeVisible();

  const capturedOutput = [
    ...browserOutput,
    ...['fake-source', 'api', 'worker', 'web'].map((name) => readFileSync(`.e2e-logs/${name}.log`, 'utf8')),
  ].join('\n');
  for (const sentinel of ['source-login', 'source-password', 'cookie-sentinel', '+1 202-555-0101', 'payload-pii-sentinel']) {
    expect(capturedOutput).not.toContain(sentinel);
  }
});

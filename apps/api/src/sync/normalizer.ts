import { SourceError } from '../source/source.errors.js';
import type { EmployeeRatingResponse } from '../source/source.schemas.js';

export type NormalizedPage = {
  employees: Array<{ sourceId: string; displayName: string }>;
  products: Array<{ sourceId: string; displayName: string }>;
  orders: Array<{
    sourceId: string;
    employeeSourceId: string;
    occurredAt: Date;
    price: string;
    currency: string;
  }>;
  items: Array<{
    sourceId: string;
    orderSourceId: string;
    productSourceId: string;
    priceWithDiscountForOrder: string;
    currency: string;
  }>;
};

function addUnique(seen: Set<string>, value: string): void {
  if (seen.has(value)) {
    throw new SourceError('SOURCE_DUPLICATE_ID');
  }
  seen.add(value);
}

export function normalizePage(response: EmployeeRatingResponse): NormalizedPage {
  const employees: NormalizedPage['employees'] = [];
  const products = new Map<string, NormalizedPage['products'][number]>();
  const orders: NormalizedPage['orders'] = [];
  const items: NormalizedPage['items'] = [];
  const employeeIds = new Set<string>();
  const orderIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const employee of response.data.rows) {
    addUnique(employeeIds, employee.id);
    employees.push({ sourceId: employee.id, displayName: employee.displayName });

    for (const order of employee.orders) {
      addUnique(orderIds, order.id);
      orders.push({
        sourceId: order.id,
        employeeSourceId: employee.id,
        occurredAt: new Date(order.date),
        price: order.price.value,
        currency: order.price.currency,
      });

      for (const item of order.items) {
        addUnique(itemIds, item.id);
        const existingProduct = products.get(item.product.id);
        if (existingProduct && existingProduct.displayName !== item.product.name) {
          throw new SourceError('SOURCE_DUPLICATE_ID');
        }
        products.set(item.product.id, {
          sourceId: item.product.id,
          displayName: item.product.name,
        });
        items.push({
          sourceId: item.id,
          orderSourceId: order.id,
          productSourceId: item.product.id,
          priceWithDiscountForOrder: item.priceWithDiscountForOrder.value,
          currency: item.priceWithDiscountForOrder.currency,
        });
      }
    }
  }

  return {
    employees,
    products: [...products.values()],
    orders,
    items,
  };
}

export function normalizePages(responses: EmployeeRatingResponse[]): NormalizedPage {
  const result: NormalizedPage = { employees: [], products: [], orders: [], items: [] };
  const employeeIds = new Set<string>();
  const orderIds = new Set<string>();
  const itemIds = new Set<string>();
  const products = new Map<string, NormalizedPage['products'][number]>();

  for (const response of responses) {
    const page = normalizePage(response);
    for (const employee of page.employees) {
      addUnique(employeeIds, employee.sourceId);
      result.employees.push(employee);
    }
    for (const order of page.orders) {
      addUnique(orderIds, order.sourceId);
      result.orders.push(order);
    }
    for (const item of page.items) {
      addUnique(itemIds, item.sourceId);
      result.items.push(item);
    }
    for (const product of page.products) {
      const existing = products.get(product.sourceId);
      if (existing && existing.displayName !== product.displayName) {
        throw new SourceError('SOURCE_DUPLICATE_ID');
      }
      products.set(product.sourceId, product);
    }
  }

  result.products = [...products.values()];
  return result;
}

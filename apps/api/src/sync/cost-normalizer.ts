import { SourceError } from '../source/source.errors.js';
import type {
  MaterialAutoCostsResponse,
  ProductAutoCostsResponse,
} from '../source/source.schemas.js';

export type NormalizedProductCost = {
  productSourceId: string;
  productName: string;
  effectiveDate: Date;
  sourceUnitId: string;
  sourceTradeAreaId: string;
  autoCost: string;
  averageAutoCost: string;
  reportedPrice: string;
  fc: string;
  extraCharge: string;
  isTotalCost: boolean;
};

export type NormalizedMaterialCost = {
  materialSourceId: string;
  materialName: string;
  materialType: number;
  unitOfMeasure: number;
  effectiveDate: Date;
  sourceUnitId: string;
  sourceDepartmentId: string;
  autoCost: string;
  sourceCurrencyCode: number;
};

export type NormalizedCosts = {
  productCosts: NormalizedProductCost[];
  materialCosts: NormalizedMaterialCost[];
};

function decimalText(value: number): string {
  return String(value);
}

function calendarDate(value: string): { key: string; date: Date } {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
  const key = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : dotted
      ? `${dotted[3]}-${dotted[2]}-${dotted[1]}`
      : undefined;
  if (!key) throw new SourceError('SOURCE_CONTRACT_INVALID');
  return { key, date: new Date(`${key}T00:00:00.000Z`) };
}

function unique(seen: Set<string>, key: string): void {
  if (seen.has(key)) throw new SourceError('SOURCE_DUPLICATE_ID');
  seen.add(key);
}

export function normalizeCosts(
  products: ProductAutoCostsResponse[],
  materials: MaterialAutoCostsResponse[],
  input: { sourceUnitId: string; productDate: string; beginDate: string; endDate: string },
): NormalizedCosts {
  const productCosts: NormalizedProductCost[] = [];
  const materialCosts: NormalizedMaterialCost[] = [];
  const productKeys = new Set<string>();
  const materialKeys = new Set<string>();
  const productDate = calendarDate(input.productDate);

  for (const response of products) {
    for (const product of response.values) {
      for (const tradeArea of product.autoCostProductByTradeArea) {
        for (const unit of tradeArea.autoCostProductByUnit) {
          if (unit.unitId !== input.sourceUnitId) continue;
          if (unit.productId !== product.productId) {
            throw new SourceError('SOURCE_CONTRACT_INVALID');
          }
          unique(
            productKeys,
            [product.productId, productDate.key, unit.unitId, tradeArea.tradeAreaId].join(':'),
          );
          productCosts.push({
            productSourceId: product.productId,
            productName: product.productName,
            effectiveDate: productDate.date,
            sourceUnitId: unit.unitId,
            sourceTradeAreaId: tradeArea.tradeAreaId,
            autoCost: decimalText(unit.autoCost),
            averageAutoCost: decimalText(tradeArea.averageAutoCost),
            reportedPrice: decimalText(tradeArea.price),
            fc: decimalText(tradeArea.fc),
            extraCharge: decimalText(tradeArea.extraCharge),
            isTotalCost: unit.isTotalCost,
          });
        }
      }
    }
  }

  for (const response of materials) {
    for (const material of response.data.values) {
      for (const byDate of material.autoCostMaterialViewsByDates) {
        const effective = calendarDate(byDate.date);
        if (effective.key < input.beginDate || effective.key > input.endDate) {
          throw new SourceError('SOURCE_CONTRACT_INVALID');
        }
        for (const view of byDate.autoCostMaterialViews) {
          if (view.unitId !== input.sourceUnitId) continue;
          if (
            view.materialId !== material.materialId ||
            view.materialName !== material.materialName ||
            view.materialUnitOfMeasure !== material.materialUnitOfMeasure
          ) {
            throw new SourceError('SOURCE_CONTRACT_INVALID');
          }
          unique(
            materialKeys,
            [material.materialId, effective.key, view.unitId, view.departmentId].join(':'),
          );
          materialCosts.push({
            materialSourceId: material.materialId,
            materialName: material.materialName,
            materialType: material.materialType,
            unitOfMeasure: material.materialUnitOfMeasure,
            effectiveDate: effective.date,
            sourceUnitId: view.unitId,
            sourceDepartmentId: view.departmentId,
            autoCost: decimalText(view.autoCost),
            sourceCurrencyCode: view.currency,
          });
        }
      }
    }
  }

  return { productCosts, materialCosts };
}

# Product and material AutoCost history

Status: implemented for issue #36 and consumed by the issue #37 product margin report; not deployed.

## Outcome

Each manual synchronization imports source-reported product and material AutoCost into restaurant-scoped history in the same database transaction as the normalized sales report. A failed or incomplete cost feed cannot publish partial normalized data and cannot remove the last successful history.

## Source scope

- Product cost uses `InventoryControl/AutoCostProduct/GetAutoCostProducts` for the synchronization `endDate`.
- Material cost uses `InventoryControl/AutoCostMaterials/GetAutoCostMaterials` for the inclusive synchronization range.
- Product pagination is zero-based; material pagination is one-based. Both must reach a stable `totalRows` exactly.
- Only rows whose source unit matches the restaurant's configured `sourceUnitId` are normalized.
- Supply documents and current-menu endpoints are excluded because their live monetary contracts or permissions are not confirmed.

## Persistence contract

- `ProductCostSnapshot` is unique by restaurant, product, effective date, source unit and source trade area.
- `MaterialCostSnapshot` is unique by restaurant, material, effective date, source unit and source department.
- Reprocessing the same source page updates the same snapshot instead of adding a duplicate.
- Product `price` is stored as `reportedPrice`; it is source evidence only and is not exposed as the current menu price.
- Material numeric `currency` is stored as `sourceCurrencyCode`; it is not presented as an ISO currency without reconciliation.
- Monetary source numbers are converted immediately to decimal text and persisted as PostgreSQL `Decimal(18,6)`. Bazols performs no floating-point cost calculations.
- Missing rows remain unknown. Empty successful cost feeds create no zero-valued snapshots.

## Atomicity and evidence

Raw response bytes are encrypted and stored before contract parsing. Sales and cost normalization then publish in one Prisma transaction. Malformed schema, contradictory pagination, duplicate source identities, out-of-range dates or invalid state transitions fail closed with a safe code; encrypted raw evidence remains available for approved offline diagnosis.

A successful `SyncRun` exposes separate `productCostSnapshotsCount` and `materialCostSnapshotsCount`. Existing sales counters retain their previous meaning.

## Not included

- material-cost attribution, recipe decomposition or purchase-price calculations;
- price screens or alerts;
- historical daily product backfill inside one broad synchronization;
- supply-price history;
- scheduling, deployment or retention changes.

Issue #37 attributes the latest non-future product AutoCost to each sold item, publishes COGS, gross margin and cost coverage, and leaves incomplete rows unknown. The 2026-09-17 reconciliation permits that Level 1 calculation for `RUB` only. `reportedPrice` remains unverified and is not used as a current menu price.

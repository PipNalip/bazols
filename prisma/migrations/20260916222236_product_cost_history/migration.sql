-- AlterTable
ALTER TABLE "SyncRun"
ADD COLUMN "productCostSnapshotsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "materialCostSnapshotsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "materialType" INTEGER NOT NULL,
    "unitOfMeasure" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCostSnapshot" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lastSeenSyncRunId" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "sourceUnitId" TEXT NOT NULL,
    "sourceTradeAreaId" TEXT NOT NULL,
    "autoCost" DECIMAL(18,6) NOT NULL,
    "averageAutoCost" DECIMAL(18,6) NOT NULL,
    "reportedPrice" DECIMAL(18,6) NOT NULL,
    "fc" DECIMAL(18,6) NOT NULL,
    "extraCharge" DECIMAL(18,6) NOT NULL,
    "isTotalCost" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCostSnapshot" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "lastSeenSyncRunId" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "sourceUnitId" TEXT NOT NULL,
    "sourceDepartmentId" TEXT NOT NULL,
    "autoCost" DECIMAL(18,6) NOT NULL,
    "sourceCurrencyCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialCostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_restaurantId_sourceId_key" ON "Material"("restaurantId", "sourceId");
CREATE UNIQUE INDEX "Material_restaurantId_id_key" ON "Material"("restaurantId", "id");
CREATE UNIQUE INDEX "ProductCostSnapshot_restaurantId_productId_effectiveDate_sourceUnitId_sourceTradeAreaId_key" ON "ProductCostSnapshot"("restaurantId", "productId", "effectiveDate", "sourceUnitId", "sourceTradeAreaId");
CREATE INDEX "ProductCostSnapshot_lastSeenSyncRunId_idx" ON "ProductCostSnapshot"("lastSeenSyncRunId");
CREATE INDEX "ProductCostSnapshot_restaurantId_effectiveDate_idx" ON "ProductCostSnapshot"("restaurantId", "effectiveDate");
CREATE UNIQUE INDEX "MaterialCostSnapshot_restaurantId_materialId_effectiveDate_sourceUnitId_sourceDepartmentId_key" ON "MaterialCostSnapshot"("restaurantId", "materialId", "effectiveDate", "sourceUnitId", "sourceDepartmentId");
CREATE INDEX "MaterialCostSnapshot_lastSeenSyncRunId_idx" ON "MaterialCostSnapshot"("lastSeenSyncRunId");
CREATE INDEX "MaterialCostSnapshot_restaurantId_effectiveDate_idx" ON "MaterialCostSnapshot"("restaurantId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductCostSnapshot" ADD CONSTRAINT "ProductCostSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductCostSnapshot" ADD CONSTRAINT "ProductCostSnapshot_restaurantId_productId_fkey" FOREIGN KEY ("restaurantId", "productId") REFERENCES "Product"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductCostSnapshot" ADD CONSTRAINT "ProductCostSnapshot_restaurantId_lastSeenSyncRunId_fkey" FOREIGN KEY ("restaurantId", "lastSeenSyncRunId") REFERENCES "SyncRun"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialCostSnapshot" ADD CONSTRAINT "MaterialCostSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialCostSnapshot" ADD CONSTRAINT "MaterialCostSnapshot_restaurantId_materialId_fkey" FOREIGN KEY ("restaurantId", "materialId") REFERENCES "Material"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialCostSnapshot" ADD CONSTRAINT "MaterialCostSnapshot_restaurantId_lastSeenSyncRunId_fkey" FOREIGN KEY ("restaurantId", "lastSeenSyncRunId") REFERENCES "SyncRun"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

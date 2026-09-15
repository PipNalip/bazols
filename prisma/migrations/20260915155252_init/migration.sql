-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" UUID NOT NULL,
    "sourceUnitId" TEXT NOT NULL,
    "sourceRole" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRestaurant" (
    "userId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRestaurant_pkey" PRIMARY KEY ("userId","restaurantId")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "beginDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "SyncRunStatus" NOT NULL,
    "requestedById" UUID NOT NULL,
    "employeesCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "productsCount" INTEGER NOT NULL DEFAULT 0,
    "orderItemsCount" INTEGER NOT NULL DEFAULT 0,
    "safeErrorCode" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawSnapshot" (
    "id" UUID NOT NULL,
    "syncRunId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "algorithmVersion" INTEGER NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenSyncRunId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "priceWithDiscountForOrder" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenSyncRunId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "eventType" TEXT NOT NULL,
    "restaurantId" UUID,
    "syncRunId" UUID,
    "correlationId" TEXT NOT NULL,
    "safeMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_sourceUnitId_key" ON "Restaurant"("sourceUnitId");

-- CreateIndex
CREATE INDEX "UserRestaurant_restaurantId_idx" ON "UserRestaurant"("restaurantId");

-- CreateIndex
CREATE INDEX "SyncRun_requestedById_idx" ON "SyncRun"("requestedById");

-- CreateIndex
CREATE INDEX "SyncRun_restaurantId_createdAt_idx" ON "SyncRun"("restaurantId", "createdAt");

-- Allow at most one queued or running sync per restaurant.
CREATE UNIQUE INDEX "SyncRun_one_active_per_restaurant_key"
ON "SyncRun"("restaurantId")
WHERE "status" IN ('QUEUED', 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "SyncRun_restaurantId_id_key" ON "SyncRun"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "RawSnapshot_syncRunId_idx" ON "RawSnapshot"("syncRunId");

-- CreateIndex
CREATE INDEX "RawSnapshot_restaurantId_receivedAt_idx" ON "RawSnapshot"("restaurantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_restaurantId_sourceId_key" ON "Employee"("restaurantId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_restaurantId_id_key" ON "Employee"("restaurantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_restaurantId_sourceId_key" ON "Product"("restaurantId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_restaurantId_id_key" ON "Product"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "Order_restaurantId_occurredAt_idx" ON "Order"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Order_lastSeenSyncRunId_idx" ON "Order"("lastSeenSyncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_sourceId_key" ON "Order"("restaurantId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_id_key" ON "Order"("restaurantId", "id");

-- CreateIndex
CREATE INDEX "OrderItem_restaurantId_productId_idx" ON "OrderItem"("restaurantId", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_lastSeenSyncRunId_idx" ON "OrderItem"("lastSeenSyncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_restaurantId_sourceId_key" ON "OrderItem"("restaurantId", "sourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_restaurantId_createdAt_idx" ON "AuditEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_syncRunId_idx" ON "AuditEvent"("syncRunId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestaurant" ADD CONSTRAINT "UserRestaurant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRestaurant" ADD CONSTRAINT "UserRestaurant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_restaurantId_syncRunId_fkey" FOREIGN KEY ("restaurantId", "syncRunId") REFERENCES "SyncRun"("restaurantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawSnapshot" ADD CONSTRAINT "RawSnapshot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_employeeId_fkey" FOREIGN KEY ("restaurantId", "employeeId") REFERENCES "Employee"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_lastSeenSyncRunId_fkey" FOREIGN KEY ("restaurantId", "lastSeenSyncRunId") REFERENCES "SyncRun"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_orderId_fkey" FOREIGN KEY ("restaurantId", "orderId") REFERENCES "Order"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_productId_fkey" FOREIGN KEY ("restaurantId", "productId") REFERENCES "Product"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_lastSeenSyncRunId_fkey" FOREIGN KEY ("restaurantId", "lastSeenSyncRunId") REFERENCES "SyncRun"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

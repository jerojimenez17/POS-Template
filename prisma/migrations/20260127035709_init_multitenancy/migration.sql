/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Business` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_businessId_fkey";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "CashMovement" ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "businessId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "businessId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

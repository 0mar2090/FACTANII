-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'QUEUED', 'SENDING', 'ACCEPTED', 'REJECTED', 'OBSERVED');

-- AlterTable: convert status column from text to enum
ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoices" ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus";
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

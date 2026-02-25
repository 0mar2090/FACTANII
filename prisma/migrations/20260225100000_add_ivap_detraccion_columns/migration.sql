-- AlterTable: Add IVAP, detraccion, anticipos, exportacion columns to invoices
ALTER TABLE "invoices" ADD COLUMN "op_ivap" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "igv_ivap" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "codigo_detraccion" TEXT;
ALTER TABLE "invoices" ADD COLUMN "porcentaje_detraccion" DECIMAL(5,4);
ALTER TABLE "invoices" ADD COLUMN "monto_detraccion" DECIMAL(12,2);
ALTER TABLE "invoices" ADD COLUMN "cuenta_detraccion" TEXT;
ALTER TABLE "invoices" ADD COLUMN "anticipos_data" JSONB;
ALTER TABLE "invoices" ADD COLUMN "docs_relacionados_data" JSONB;
ALTER TABLE "invoices" ADD COLUMN "op_exportacion" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: Add series columns for retencion, percepcion, guia remision to companies
ALTER TABLE "companies" ADD COLUMN "serie_retencion" TEXT NOT NULL DEFAULT 'R001';
ALTER TABLE "companies" ADD COLUMN "serie_percepcion" TEXT NOT NULL DEFAULT 'P001';
ALTER TABLE "companies" ADD COLUMN "serie_guia_remision" TEXT NOT NULL DEFAULT 'T001';

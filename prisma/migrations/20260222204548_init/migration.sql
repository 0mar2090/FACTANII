-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "direccion" TEXT NOT NULL,
    "ubigeo" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "distrito" TEXT NOT NULL,
    "urbanizacion" TEXT,
    "codigo_pais" TEXT NOT NULL DEFAULT 'PE',
    "sol_user" TEXT,
    "sol_pass" TEXT,
    "sol_iv" TEXT,
    "sol_tag" TEXT,
    "serie_factura" TEXT NOT NULL DEFAULT 'F001',
    "serie_boleta" TEXT NOT NULL DEFAULT 'B001',
    "serie_nc_factura" TEXT NOT NULL DEFAULT 'FC01',
    "serie_nd_factura" TEXT NOT NULL DEFAULT 'FD01',
    "serie_nc_boleta" TEXT NOT NULL DEFAULT 'BC01',
    "serie_nd_boleta" TEXT NOT NULL DEFAULT 'BD01',
    "next_correlativo" JSONB NOT NULL DEFAULT '{}',
    "is_beta" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "pfx_data" BYTEA NOT NULL,
    "pfx_iv" TEXT NOT NULL,
    "pfx_auth_tag" TEXT NOT NULL,
    "passphrase" TEXT NOT NULL,
    "passphrase_iv" TEXT NOT NULL,
    "passphrase_tag" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tipo_doc" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "tipo_operacion" TEXT NOT NULL DEFAULT '0101',
    "fecha_emision" TIMESTAMP(3) NOT NULL,
    "fecha_vencimiento" TIMESTAMP(3),
    "cliente_tipo_doc" TEXT NOT NULL,
    "cliente_num_doc" TEXT NOT NULL,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_direccion" TEXT,
    "cliente_email" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "op_gravadas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "op_exoneradas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "op_inafectas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "op_gratuitas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igv" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "icbper" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otros_cargos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otros_tributos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento_global" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_venta" DECIMAL(12,2) NOT NULL,
    "forma_pago" TEXT NOT NULL DEFAULT 'Contado',
    "cuotas" JSONB,
    "doc_ref_tipo" TEXT,
    "doc_ref_serie" TEXT,
    "doc_ref_correlativo" INTEGER,
    "motivo_nota" TEXT,
    "xml_content" TEXT,
    "xml_hash" TEXT,
    "xml_signed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sunat_code" TEXT,
    "sunat_message" TEXT,
    "sunat_notes" JSONB,
    "cdr_zip" BYTEA,
    "pdf_url" TEXT,
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "unidad_medida" TEXT NOT NULL DEFAULT 'NIU',
    "descripcion" TEXT NOT NULL,
    "codigo" TEXT,
    "codigo_sunat" TEXT,
    "valor_unitario" DECIMAL(12,4) NOT NULL,
    "precio_unitario" DECIMAL(12,4) NOT NULL,
    "valor_venta" DECIMAL(12,2) NOT NULL,
    "tipo_afectacion" TEXT NOT NULL DEFAULT '10',
    "igv" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "icbper" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "price_monthly" DECIMAL(8,2) NOT NULL,
    "max_invoices" INTEGER NOT NULL,
    "max_companies" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "mp_preapproval_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "invoices_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "companies_ruc_key" ON "companies"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_user_id_company_id_key" ON "company_users"("user_id", "company_id");

-- CreateIndex
CREATE INDEX "invoices_company_id_status_idx" ON "invoices"("company_id", "status");

-- CreateIndex
CREATE INDEX "invoices_company_id_fecha_emision_idx" ON "invoices"("company_id", "fecha_emision");

-- CreateIndex
CREATE INDEX "invoices_company_id_cliente_num_doc_idx" ON "invoices"("company_id", "cliente_num_doc");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_company_id_tipo_doc_serie_correlativo_key" ON "invoices"("company_id", "tipo_doc", "serie", "correlativo");

-- CreateIndex
CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_company_id_key" ON "subscriptions"("company_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

# Base de Datos — FacturaPE Backend

## Schema Prisma (PostgreSQL)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// === AUTH ===

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  companyUsers CompanyUser[]
  apiKeys      ApiKey[]

  @@map("users")
}

model ApiKey {
  id         String    @id @default(cuid())
  userId     String    @map("user_id")
  companyId  String    @map("company_id")
  keyHash    String    @unique @map("key_hash")
  prefix     String    // Primeros 8 chars para identificación
  name       String
  lastUsedAt DateTime? @map("last_used_at")
  expiresAt  DateTime? @map("expires_at")
  isActive   Boolean   @default(true) @map("is_active")
  createdAt  DateTime  @default(now()) @map("created_at")

  user    User    @relation(fields: [userId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@map("api_keys")
}

// === TENANCY ===

model Company {
  id              String  @id @default(cuid())
  ruc             String  @unique
  razonSocial     String  @map("razon_social")
  nombreComercial String? @map("nombre_comercial")
  direccion       String
  ubigeo          String  // 6 dígitos
  departamento    String
  provincia       String
  distrito        String
  urbanizacion    String?
  codigoPais      String  @default("PE") @map("codigo_pais")

  // SOL credentials (cifrados AES-256-GCM)
  solUser String? @map("sol_user")
  solPass String? @map("sol_pass")
  solIv   String? @map("sol_iv")
  solTag  String? @map("sol_tag")

  // Series (9 tipos de documento)
  serieFactura      String @default("F001") @map("serie_factura")
  serieBoleta       String @default("B001") @map("serie_boleta")
  serieNCFactura    String @default("FC01") @map("serie_nc_factura")
  serieNDFactura    String @default("FD01") @map("serie_nd_factura")
  serieNCBoleta     String @default("BC01") @map("serie_nc_boleta")
  serieNDBoleta     String @default("BD01") @map("serie_nd_boleta")
  serieRetencion    String @default("R001") @map("serie_retencion")
  seriePercepcion   String @default("P001") @map("serie_percepcion")
  serieGuiaRemision String @default("T001") @map("serie_guia_remision")

  // Correlativos por serie { "F001": 1, "B001": 1 }
  nextCorrelativo Json @default("{}") @map("next_correlativo")

  // Config
  isBeta   Boolean  @default(true) @map("is_beta")
  isActive Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  companyUsers CompanyUser[]
  certificates Certificate[]
  invoices     Invoice[]
  apiKeys      ApiKey[]
  subscription Subscription?
  webhooks     Webhook[]

  @@map("companies")
}

model CompanyUser {
  id        String @id @default(cuid())
  userId    String @map("user_id")
  companyId String @map("company_id")
  role      String @default("member") // owner, admin, member

  user    User    @relation(fields: [userId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@unique([userId, companyId])
  @@map("company_users")
}

// === CERTIFICADOS ===

model Certificate {
  id            String   @id @default(cuid())
  companyId     String   @map("company_id")
  pfxData       Bytes    @map("pfx_data")       // cifrado AES-256-GCM
  pfxIv         String   @map("pfx_iv")
  pfxAuthTag    String   @map("pfx_auth_tag")
  passphrase    String                           // cifrado AES-256-GCM
  passphraseIv  String   @map("passphrase_iv")
  passphraseTag String   @map("passphrase_tag")
  serialNumber  String   @map("serial_number")
  issuer        String
  subject       String
  validFrom     DateTime @map("valid_from")
  validTo       DateTime @map("valid_to")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")

  company Company @relation(fields: [companyId], references: [id])

  @@map("certificates")
}

// === COMPROBANTES ===

enum InvoiceStatus {
  DRAFT
  PENDING
  QUEUED
  SENDING
  ACCEPTED
  REJECTED
  OBSERVED
}

model Invoice {
  id        String @id @default(cuid())
  companyId String @map("company_id")

  // Identificación
  tipoDoc       String @map("tipo_doc")          // 01, 03, 07, 08, 09, 20, 40, RC, RA
  serie         String
  correlativo   Int
  tipoOperacion String @default("0101") @map("tipo_operacion")

  // Fechas
  fechaEmision     DateTime  @map("fecha_emision")
  fechaVencimiento DateTime? @map("fecha_vencimiento")

  // Cliente
  clienteTipoDoc  String  @map("cliente_tipo_doc")   // Cat 06
  clienteNumDoc   String  @map("cliente_num_doc")
  clienteNombre   String  @map("cliente_nombre")
  clienteDireccion String? @map("cliente_direccion")
  clienteEmail    String? @map("cliente_email")

  // Moneda y totales
  moneda         String  @default("PEN")
  opGravadas     Decimal @default(0) @map("op_gravadas") @db.Decimal(12, 2)
  opExoneradas   Decimal @default(0) @map("op_exoneradas") @db.Decimal(12, 2)
  opInafectas    Decimal @default(0) @map("op_inafectas") @db.Decimal(12, 2)
  opGratuitas    Decimal @default(0) @map("op_gratuitas") @db.Decimal(12, 2)
  igv            Decimal @default(0) @db.Decimal(12, 2)
  isc            Decimal @default(0) @db.Decimal(12, 2)
  icbper         Decimal @default(0) @db.Decimal(12, 2)
  opIvap         Decimal @default(0) @map("op_ivap") @db.Decimal(12, 2)
  igvIvap        Decimal @default(0) @map("igv_ivap") @db.Decimal(12, 2)
  otrosCargos    Decimal @default(0) @map("otros_cargos") @db.Decimal(12, 2)
  otrosTributos  Decimal @default(0) @map("otros_tributos") @db.Decimal(12, 2)
  descuentoGlobal Decimal @default(0) @map("descuento_global") @db.Decimal(12, 2)
  totalVenta     Decimal @map("total_venta") @db.Decimal(12, 2)

  // Forma de pago
  formaPago String @default("Contado") @map("forma_pago") // Contado, Credito
  cuotas    Json?  // [{ monto, moneda, fechaPago }]

  // Referencia (NC/ND)
  docRefTipo        String? @map("doc_ref_tipo")
  docRefSerie       String? @map("doc_ref_serie")
  docRefCorrelativo Int?    @map("doc_ref_correlativo")
  motivoNota        String? @map("motivo_nota")

  // Detracción (SPOT)
  codigoDetraccion      String?  @map("codigo_detraccion")       // Cat 54
  porcentajeDetraccion  Decimal? @map("porcentaje_detraccion") @db.Decimal(5, 4)
  montoDetraccion       Decimal? @map("monto_detraccion") @db.Decimal(12, 2)
  cuentaDetraccion      String?  @map("cuenta_detraccion")       // Cuenta BN

  // Anticipos y documentos relacionados (JSON)
  anticiposData         Json?    @map("anticipos_data")
  docsRelacionadosData  Json?    @map("docs_relacionados_data")  // Cat 12

  // Exportación
  opExportacion         Decimal  @default(0) @map("op_exportacion") @db.Decimal(12, 2)

  // XML y firma
  xmlContent String?  @map("xml_content")
  xmlHash    String?  @map("xml_hash")
  xmlSigned  Boolean  @default(false) @map("xml_signed")

  // Estado SUNAT (PostgreSQL enum)
  status       InvoiceStatus @default(DRAFT)
  sunatCode    String? @map("sunat_code")
  sunatMessage String? @map("sunat_message")
  sunatNotes   Json?   @map("sunat_notes")
  cdrZip       Bytes?  @map("cdr_zip")

  // PDF
  pdfUrl String? @map("pdf_url")

  // Tracking
  sentAt        DateTime? @map("sent_at")
  attempts      Int       @default(0)
  lastAttemptAt DateTime? @map("last_attempt_at")
  lastError     String?   @map("last_error")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  company Company       @relation(fields: [companyId], references: [id])
  items   InvoiceItem[]

  @@unique([companyId, tipoDoc, serie, correlativo])
  @@index([companyId, status])
  @@index([companyId, fechaEmision])
  @@index([companyId, clienteNumDoc])
  @@map("invoices")
}

model InvoiceItem {
  id        String @id @default(cuid())
  invoiceId String @map("invoice_id")

  cantidad       Decimal @db.Decimal(12, 3)
  unidadMedida   String  @default("NIU") @map("unidad_medida")
  descripcion    String
  codigo         String?
  codigoSunat    String? @map("codigo_sunat")

  valorUnitario  Decimal @map("valor_unitario") @db.Decimal(12, 4) // Sin IGV
  precioUnitario Decimal @map("precio_unitario") @db.Decimal(12, 4) // Con IGV
  valorVenta     Decimal @map("valor_venta") @db.Decimal(12, 2)

  tipoAfectacion String  @default("10") @map("tipo_afectacion") // Cat 07
  igv            Decimal @default(0) @db.Decimal(12, 2)
  isc            Decimal @default(0) @db.Decimal(12, 2)
  icbper         Decimal @default(0) @db.Decimal(12, 2)
  descuento      Decimal @default(0) @db.Decimal(12, 2)

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@map("invoice_items")
}

// === WEBHOOKS ===

model Webhook {
  id        String   @id @default(cuid())
  companyId String   @map("company_id")
  url       String
  events    String[] // ["invoice.accepted", "invoice.rejected"]
  secret    String?  // HMAC secret for signing
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")

  company Company @relation(fields: [companyId], references: [id])

  @@map("webhooks")
}

// === BILLING ===

model Plan {
  id           String  @id @default(cuid())
  name         String  // Starter, Pro, Business, Enterprise
  slug         String  @unique
  priceMonthly Decimal @map("price_monthly") @db.Decimal(8, 2) // en PEN
  maxInvoices  Int     @map("max_invoices")
  maxCompanies Int     @map("max_companies")
  features     Json    // { webhooks: true, whatsapp: false, ... }
  isActive     Boolean @default(true) @map("is_active")

  subscriptions Subscription[]

  @@map("plans")
}

model Subscription {
  id                 String   @id @default(cuid())
  companyId          String   @unique @map("company_id")
  planId             String   @map("plan_id")
  mpPreapprovalId    String?  @map("mp_preapproval_id") // ID Mercado Pago
  status             String   @default("active") // active, paused, cancelled
  currentPeriodStart DateTime @map("current_period_start")
  currentPeriodEnd   DateTime @map("current_period_end")
  invoicesUsed       Int      @default(0) @map("invoices_used")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  company Company @relation(fields: [companyId], references: [id])
  plan    Plan    @relation(fields: [planId], references: [id])

  @@map("subscriptions")
}
```

## Migraciones Prisma

```
prisma/migrations/
├── 20260222204548_init/                            # Tablas base: users, api_keys, companies, company_users,
│                                                   # certificates, invoices, invoice_items, plans, subscriptions + RLS policies
├── 20260222224827_add_webhook_model/                # Tabla webhooks
├── 20260224180000_invoice_status_enum/              # CREATE TYPE "InvoiceStatus" AS ENUM + ALTER TABLE status TEXT→enum
└── 20260225100000_add_ivap_detraccion_columns/      # 9 columnas invoices (IVAP, detracción, anticipos, exportación)
                                                    # + 3 columnas companies (serie_retencion, serie_percepcion, serie_guia_remision)
```

## Seed Data (`prisma/seed.ts`)

- 4 planes: Starter (S/49, 100 inv), Pro (S/149, 500 inv), Business (S/299, 2000 inv), Enterprise (S/599, unlimited)

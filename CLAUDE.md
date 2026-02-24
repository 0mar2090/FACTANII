# CLAUDE.md — FacturaPE Backend

## Proyecto
Backend SaaS de facturación electrónica para SUNAT Perú. Conexión DIRECTA a web services SUNAT (SEE-Del Contribuyente). Sin intermediarios PSE/OSE. Soporta los 9 tipos de CPE: Factura (01), Boleta (03), NC (07), ND (08), GRE (09), CRE (20), CPE (40), Resumen Diario (RC), Comunicación de Baja (RA).

## Stack Tecnológico (versiones exactas Feb 2026)
- **Runtime:** Node.js 22 LTS
- **Framework:** NestJS 11.1 + Fastify 5.7 (`@nestjs/platform-fastify`)
- **ORM:** Prisma 7.4 con `@prisma/adapter-pg` (driver adapter obligatorio)
- **BD:** PostgreSQL 16 con Row-Level Security (RLS)
- **Colas:** BullMQ 5.66 + Redis 7 (`@nestjs/bullmq` 11.x)
- **XML:** xmlbuilder2 4.x (generación UBL 2.1) + fast-xml-parser 5.x (parseo CDR)
- **Firma:** xml-crypto 6.x (XMLDSig SHA-256) + node-forge 1.3 (PFX→PEM)
- **SOAP:** soap 1.1 (node-soap) con WS-Security + WSDLs locales (`src/modules/sunat-client/wsdl/`)
- **REST (GRE):** axios 1.13 (OAuth2 + REST API para Guía de Remisión)
- **PDF:** pdfmake 0.3 (facturas A4 + tickets 80mm) + qrcode 1.5
- **Pagos:** mercadopago 2.12 (suscripciones PreApproval)
- **Email:** resend 6.9
- **Auth:** @nestjs/jwt 11 + @nestjs/passport 11 + passport-jwt 4
- **Validación:** class-validator 0.14 + class-transformer 0.5
- **Rate Limit:** @nestjs/throttler 6.5 (3 tiers: short 1s/3req, medium 10s/20req, long 60s/100req)
- **Multi-tenancy:** nestjs-cls 4.5 (AsyncLocalStorage) + PG RLS
- **Compresión:** archiver 7.x (ZIP para SUNAT) + adm-zip 0.5 (leer CDR)
- **Cifrado:** crypto nativo Node.js (AES-256-GCM para certificados y SOL)
- **Docs:** @nestjs/swagger 11 + @fastify/swagger 9 (disponible en `/docs`, no-prod)
- **Monitoring:** @sentry/node 10.x + @nestjs/terminus 11.x (health checks)
- **Uploads:** @fastify/multipart 9.x (5MB limit), @fastify/static 8.x
- **Testing:** vitest 3.x + supertest 7.x (~566 tests, 28 spec files + 4 e2e files)
- **Build tooling:** TypeScript 5.7, SWC (e2e), tsx (seed)
- **Package Manager:** pnpm 9+

## Estructura de Módulos

```
src/
├── main.ts                          # Bootstrap Fastify + Sentry + graceful shutdown
├── app.module.ts                    # Root module (Fases 1-5)
├── generated/prisma/                # Prisma 7 generated client (output local, NO node_modules)
├── common/
│   ├── decorators/                  # @CurrentUser, @Tenant, @Public, @ApiKeyAuth, @SkipTenant, @Roles
│   ├── guards/                      # JwtAuthGuard, ApiKeyGuard, TenantGuard, RolesGuard, TenantThrottlerGuard
│   ├── interceptors/                # LoggingInterceptor, TimeoutInterceptor
│   ├── filters/                     # HttpExceptionFilter, PrismaExceptionFilter, SentryExceptionFilter
│   ├── pipes/                       # ParseRucPipe, ParseDocTypePipe
│   ├── middleware/                   # TenantMiddleware (CLS), CorrelationIdMiddleware (X-Request-ID)
│   ├── interfaces/                  # RequestUser, shared TS interfaces
│   ├── constants/
│   │   └── index.ts                 # Catálogos 01-62, namespaces, endpoints, tasas, detracciones
│   └── utils/
│       ├── tax-calculator.ts        # Cálculos IGV/ISC/ICBPER/IVAP/detracciones
│       ├── amount-to-words.ts       # Monto en letras (español)
│       ├── ruc-validator.ts         # Validación módulo 11
│       ├── encryption.ts            # AES-256-GCM encrypt/decrypt
│       ├── peru-date.ts            # peruNow(), peruToday(), daysBetweenInPeru(), isWithinMaxDays()
│       └── zip.ts                   # Utilidades ZIP
│
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── sunat.config.ts              # SOAP + GRE OAuth2 config
│   ├── jwt.config.ts
│   ├── mercadopago.config.ts
│   ├── resend.config.ts
│   ├── sentry.config.ts
│   └── index.ts                     # Re-exports
│
└── modules/
    ├── auth/                        # JWT + API Keys + refresh tokens + logout
    │   ├── auth.module.ts
    │   ├── auth.controller.ts       # register, login, refresh, logout, change-password, api-keys CRUD
    │   ├── auth.service.ts
    │   ├── strategies/              # jwt.strategy, api-key.strategy
    │   └── dto/                     # register, login, refresh-token, create-api-key, change-password
    │
    ├── users/                       # Gestión de usuarios (GET/PUT /me, GET /me/companies)
    ├── companies/                   # Empresas (tenants) + SOL + migración beta→prod
    │   ├── companies.controller.ts  # CRUD + sol-credentials + migration endpoints
    │   ├── companies.service.ts
    │   └── migration.service.ts     # checkMigrationReadiness, migrateToProduction, revertToBeta
    ├── certificates/                # PFX upload, validar, cifrar AES-256-GCM
    │
    ├── xml-builder/                 # ⭐ CORE: Generación XML UBL 2.1
    │   ├── xml-builder.module.ts
    │   ├── xml-builder.service.ts   # Orquestador (8 métodos build*)
    │   ├── builders/
    │   │   ├── base.builder.ts          # Clase base abstracta (export type XmlNode)
    │   │   ├── invoice.builder.ts       # Factura (01) y Boleta (03) — soporta IVAP, detracciones
    │   │   ├── credit-note.builder.ts   # Nota de Crédito (07)
    │   │   ├── debit-note.builder.ts    # Nota de Débito (08)
    │   │   ├── summary.builder.ts       # Resumen Diario (RC)
    │   │   ├── voided.builder.ts        # Comunicación de Baja (RA)
    │   │   ├── retention.builder.ts     # Comprobante de Retención (20)
    │   │   ├── perception.builder.ts    # Comprobante de Percepción (40)
    │   │   └── guide.builder.ts         # Guía de Remisión (09)
    │   ├── interfaces/
    │   │   └── xml-builder.interfaces.ts  # XmlInvoiceData, XmlRetentionData, XmlPerceptionData, XmlGuideData, etc.
    │   └── validators/
    │       └── xml-validator.ts     # 8 métodos validate* (pre-envío)
    │
    ├── xml-signer/                  # ⭐ CORE: Firma digital XMLDSig SHA-256
    │   ├── xml-signer.service.ts
    │   └── utils/pfx-reader.ts      # PFX→PEM con node-forge
    │
    ├── sunat-client/                # ⭐ CORE: Clientes SUNAT
    │   ├── sunat-client.service.ts  # SOAP: sendBill (endpoint variable), sendSummary, getStatus
    │   ├── sunat-gre-client.service.ts  # REST: OAuth2 + envío GRE
    │   ├── interfaces/
    │   └── wsdl/                    # WSDLs locales: main.wsdl, retention.wsdl, types.wsdl, types.xsd
    │
    ├── cdr-processor/               # Descomprimir ZIP, parsear XML CDR
    │
    ├── invoices/                    # API de comprobantes (9 tipos + batch)
    │   ├── invoices.module.ts
    │   ├── invoices.controller.ts   # 18 endpoints (9 tipos + batch + CRUD + consult-cdr + anular-guia)
    │   ├── invoices.service.ts      # Orquesta: validate → XML → sign → ZIP → send/queue
    │   └── dto/
    │       ├── create-invoice.dto.ts      # Factura/Boleta
    │       ├── create-credit-note.dto.ts  # NC (07)
    │       ├── create-debit-note.dto.ts   # ND (08)
    │       ├── create-summary.dto.ts      # RC
    │       ├── create-voided.dto.ts       # RA
    │       ├── create-retention.dto.ts    # CRE (20)
    │       ├── create-perception.dto.ts   # CPE (40)
    │       ├── create-guide.dto.ts        # GRE (09)
    │       ├── batch-invoice.dto.ts       # Envío masivo (máx 50)
    │       ├── invoice-item.dto.ts
    │       └── invoice-response.dto.ts
    │
    ├── pdf-generator/               # PDF A4 + ticket 80mm
    │   ├── pdf-generator.service.ts # generateA4(), generateTicket()
    │   ├── templates/
    │   │   ├── invoice-a4.template.ts
    │   │   └── invoice-ticket.template.ts
    │   └── interfaces/
    │       └── pdf-data.interface.ts
    │
    ├── queues/                      # BullMQ processors (7 colas)
    │   ├── queues.module.ts
    │   ├── queues.constants.ts      # 7 colas definidas + ALL_QUEUES array
    │   ├── processors/
    │   │   ├── invoice-send.processor.ts   # Envío síncrono a SUNAT
    │   │   ├── pdf-generate.processor.ts   # PDF async
    │   │   ├── email-send.processor.ts     # Email con adjuntos
    │   │   ├── summary-send.processor.ts   # RC/RA → ticket
    │   │   ├── ticket-poll.processor.ts    # Polling getStatus (summary|voided|guide)
    │   │   ├── webhook-send.processor.ts   # Envío HMAC-signed a webhook URLs
    │   │   └── dlq.listener.ts            # Dead Letter Queue monitor
    │   └── interfaces/
    │       └── queue-job-data.interfaces.ts
    │
    ├── consultations/               # RUC, DNI, tipo cambio, validar CPE
    ├── webhooks/                    # CRUD + envío HMAC-signed
    ├── billing/                     # Planes + suscripciones + Mercado Pago (bajo /billing/)
    ├── notifications/               # Emails transaccionales (Resend)
    ├── dashboard/                   # Resumen emisión + reporte mensual PDT 621
    ├── health/                      # Terminus checks: DB, Redis, memory heap, disk
    ├── prisma/                      # PrismaService (global) con tenant extension
    └── redis/                       # RedisModule (@Global) — ioredis client (REDIS_CLIENT token)
```

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

  // Estado SUNAT
  status       String  @default("DRAFT") // DRAFT, PENDING, QUEUED, SENDING, ACCEPTED, REJECTED, OBSERVED
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

## Constantes SUNAT (`src/common/constants/index.ts`)

Todos los catálogos en un solo archivo:

```
TIPO_DOCUMENTO          Cat 01: 01, 03, 07, 08, 09, 20, 40
TIPO_MONEDA             Cat 02: PEN, USD, EUR
UNIDAD_MEDIDA           Cat 03: NIU, ZZ, KGM, LTR, MTR, MTK, HUR, DAY, BX, BG, EA
CODIGO_TRIBUTO          Cat 05: IGV(1000), IVAP(1016), ISC(2000), ICBPER(7152), EXP(9995), GRA(9996), EXO(9997), INA(9998), OTROS(9999)
TIPO_DOC_IDENTIDAD      Cat 06: 0, 1, 4, 6, 7, -
TIPO_AFECTACION_IGV     Cat 07: 10-17, 20-21, 30-36, 40
MOTIVO_NOTA_CREDITO     Cat 09: 01-13
MOTIVO_NOTA_DEBITO      Cat 10: 01, 02, 03, 11
TIPO_DOC_RELACIONADO    Cat 12: documentos relacionados
TIPO_PRECIO             Cat 16: 01, 02
TIPO_OPERACION          Cat 17/51: 0100, 0101, 0104, 0112, 0200-0208 (exportación), 1001, 2001
MODALIDAD_TRANSPORTE    Cat 18: 01 (público), 02 (privado)
MOTIVO_TRASLADO         Cat 20: 01-04, 06-09, 11, 13-14, 17-19
REGIMEN_PERCEPCION      Cat 22: 01 (2%), 02 (1%), 03 (0.5%)
REGIMEN_RETENCION       Cat 23: 01 (3%), 02 (6%)
LEYENDA                 Cat 52: 1000, 1002, 2000, 2001, 2006 (detracción), 2007 (IVAP), 2010
CODIGO_DETRACCION       Cat 54: códigos y tasas por producto/servicio (Anexo I/II/III)
MEDIO_PAGO              Cat 59: métodos de pago
CODIGO_PRODUCTO_SUNAT   Cat 62: categorías UNSPSC + isValidProductCode()

IGV_RATE = 0.18           IGV_RESTAURANT_RATE = 0.105 (MYPEs Ley 32357, ene 2026)
IVAP_RATE = 0.04           ICBPER_RATE = 0.50           UIT_2026 = 5500
MAX_DAYS_BY_DOC_TYPE      { '01':3, '03':7, '07':3, '08':3, '09':7, '20':9, '40':9 }
RETENCION_RATES           { '01':0.03, '02':0.06 }
PERCEPCION_RATES          { '01':0.02, '02':0.01, '03':0.005 }
DETRACCION_RATES          Per-code rates map (Cat 54)
DETRACCION_DEFAULT_RATE   = 0.12
DETRACCION_THRESHOLD      = 700 (S/)
DETRACCION_THRESHOLD_TRANSPORT = 400 (S/)

TIPO_DOC_NOMBRES          Human-readable doc type names
CURRENCY_SYMBOLS          PEN/USD/EUR symbols

UBL_NAMESPACES: INVOICE, CREDIT_NOTE, DEBIT_NOTE, SUMMARY_DOCUMENTS, VOIDED_DOCUMENTS,
                DESPATCH_ADVICE, RETENTION, PERCEPTION, CAC, CBC, DS, EXT, SAC, QDT, UDT

SUNAT_ENDPOINTS:   BETA.INVOICE, BETA.RETENTION, PRODUCTION.INVOICE, PRODUCTION.RETENTION,
                   PRODUCTION.CONSULT_CDR, PRODUCTION.CONSULT_VALID
SUNAT_GRE_ENDPOINTS: BETA.AUTH, BETA.API, PRODUCTION.AUTH, PRODUCTION.API
SUNAT_GRE_OAUTH_SCOPE, SUNAT_BETA_CREDENTIALS
```

## Reglas de Desarrollo

### General
- TypeScript estricto (`strict: true`, `strictPropertyInitialization: false`)
- ESM modules (`"type": "module"` en package.json)
- Module/moduleResolution: `NodeNext`
- Imports con extensión `.js` (requerido por Prisma 7 ESM)
- Path aliases: `@common/*`, `@modules/*`, `@config/*`, `@generated/*`
- Usar `pnpm` como package manager
- Convención snake_case en BD, camelCase en código TS
- Todos los endpoints bajo `/api/v1/`
- Respuestas API: `{ success: boolean, data?: T, error?: { code, message } }`
- Logging: pino (pino-pretty en dev, JSON en prod)

### Autenticación
- JWT access token: 15 min, refresh token: 7 días (rotation)
- API Keys: hash SHA-256, prefijo de 8 chars para identificar
- Guards en orden: TenantThrottlerGuard → JwtAuthGuard → ApiKeyGuard → TenantGuard → RolesGuard

### Multi-tenancy
- Cada request DEBE resolver un companyId (del JWT o API Key)
- CLS (nestjs-cls) almacena tenantId en AsyncLocalStorage
- Prisma Client Extension ejecuta SET tenancy.tenant_id antes de cada query
- RLS policies en PostgreSQL filtran automáticamente
- `@SkipTenant()` decorator para rutas sin contexto de empresa

### XML/SUNAT
- **9 tipos de documento**: Factura (01), Boleta (03), NC (07), ND (08), GRE (09), CRE (20), CPE (40), RC, RA
- **7 documentos síncronos** (sendBill): 01, 03, 07, 08, 09, 20, 40
- **2 documentos asíncronos** (sendSummary → ticket → getStatus): RC, RA
- **GRE (09)**: Usa REST API con OAuth2 (NO SOAP), endpoint separado `SUNAT_GRE_ENDPOINTS`
- **CRE/CPE (20/40)**: SOAP pero endpoint `RETENTION` (diferente al de facturas)
- Tasa IGV: 18% (validar con tolerancia ±1 según reglas feb 2026)
- Tasa IVAP: 4% (Arroz Pilado, tipo afectación 17)
- IGV Restaurantes MYPEs: 10.5% (Ley 32357)
- Firma: SHA-256 + RSA (NO SHA-1)
- ZIP name: `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip`
- Envío máximo según MAX_DAYS_BY_DOC_TYPE
- Usuario SOAP: `{RUC}{UsuarioSOL}` (concatenado sin separador)
- `sendBill(endpointType: 'invoice' | 'retention')` — parámetro para elegir endpoint
- WSDLs locales en `src/modules/sunat-client/wsdl/` (main.wsdl, retention.wsdl)

### Colas BullMQ (7 colas)
- `invoice-send`: envío síncrono a SUNAT, 5 intentos, backoff exponencial (2s base), concurrency 5, rate limit 10/s
- `pdf-generate`: generación PDF, 3 intentos, concurrency 5
- `email-send`: envío email con adjuntos, 3 intentos, concurrency 5
- `summary-send`: RC/RA envío → ticket, 5 intentos, backoff exponencial (2s base), concurrency 5, rate limit 10/s
- `ticket-poll`: polling getStatus, 15 intentos, backoff exponencial (10s base, max 5min), concurrency 3
  - `documentType`: 'summary' | 'voided' | 'guide'
- `webhook-send`: envío HMAC-signed a webhook URLs, 3 intentos, backoff exponencial (5s base), concurrency 3
- `dead-letter-queue`: jobs fallidos permanentemente, sin auto-processing (review manual)
  - `DlqListener` monitorea 5 colas principales y reenvía jobs fallidos al DLQ

### Seguridad
- Certificados .pfx cifrados con AES-256-GCM antes de almacenar en BD
- Claves SOL cifradas con AES-256-GCM (con IV y authTag separados)
- Master key en variable de entorno `ENCRYPTION_KEY` (32 bytes hex = 64 chars)
- ENCRYPTION_KEY validado al startup (fail-fast si no es 64 hex chars)
- Rate limiting: 3 req/s burst, 20 req/10s, 100 req/min (configurable via env RATE_LIMIT_*)
- CORS configurado para dominios específicos (env CORS_ORIGIN, default localhost:3001)
- Helmet headers via @fastify/helmet (CSP environment-aware)
- Webhooks firmados con HMAC-SHA256
- CorrelationIdMiddleware: genera `X-Request-ID` en todas las rutas, almacenado en CLS

## Variables de Entorno (.env)

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
CORS_ORIGIN=http://localhost:3001

# Database
DATABASE_URL=postgresql://facturape:facturape@localhost:5432/facturape

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=tu-secret-seguro-min-32-chars
JWT_EXPIRATION=15m
JWT_REFRESH_SECRET=otro-secret-seguro
JWT_REFRESH_EXPIRATION=7d

# Encryption (32 bytes hex = 64 chars)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# SUNAT — SOAP
SUNAT_ENV=beta
SUNAT_BETA_RUC=20000000001
SUNAT_BETA_USER=MODDATOS
SUNAT_BETA_PASS=moddatos

# SUNAT — GRE REST API (OAuth2)
SUNAT_GRE_CLIENT_ID=
SUNAT_GRE_CLIENT_SECRET=

# Mercado Pago
MP_ACCESS_TOKEN=TEST-xxx
MP_WEBHOOK_SECRET=xxx

# Resend
RESEND_API_KEY=re_xxx
EMAIL_FROM=facturas@tudominio.com

# Sentry (opcional)
SENTRY_DSN=

# Rate Limiting (opcionales, usan defaults)
RATE_LIMIT_SHORT_TTL=1000
RATE_LIMIT_SHORT_LIMIT=3
RATE_LIMIT_MEDIUM_TTL=10000
RATE_LIMIT_MEDIUM_LIMIT=20
RATE_LIMIT_LONG_TTL=60000
RATE_LIMIT_LONG_LIMIT=100
```

## Docker Compose (desarrollo)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: facturape
      POSTGRES_PASSWORD: facturape
      POSTGRES_DB: facturape
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U facturape"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

## Endpoints API v1

```
# Auth
POST   /api/v1/auth/register            (@Public)
POST   /api/v1/auth/login               (@Public)
POST   /api/v1/auth/refresh             (@Public)
POST   /api/v1/auth/logout
PATCH  /api/v1/auth/password
POST   /api/v1/auth/api-keys            (@Roles owner/admin)
DELETE /api/v1/auth/api-keys/:id         (@Roles owner/admin)

# Users
GET    /api/v1/users/me
PUT    /api/v1/users/me
GET    /api/v1/users/me/companies

# Companies
POST   /api/v1/companies                 (@SkipTenant)
GET    /api/v1/companies                 (@SkipTenant)
GET    /api/v1/companies/:id             (@SkipTenant)
PUT    /api/v1/companies/:id             (@Roles owner/admin)
PUT    /api/v1/companies/:id/sol-credentials  (@Roles owner/admin)
GET    /api/v1/companies/:id/migration-status
POST   /api/v1/companies/:id/migrate-to-production  (@Roles owner/admin)
POST   /api/v1/companies/:id/revert-to-beta         (@Roles owner/admin)

# Certificates
POST   /api/v1/companies/:companyId/certificate   (multipart upload)
GET    /api/v1/companies/:companyId/certificate

# Comprobantes electrónicos (9 tipos + batch)
POST   /api/v1/invoices/factura            (01 — Factura)
POST   /api/v1/invoices/boleta             (03 — Boleta de Venta)
POST   /api/v1/invoices/nota-credito       (07 — Nota de Crédito)
POST   /api/v1/invoices/nota-debito        (08 — Nota de Débito)
POST   /api/v1/invoices/resumen-diario     (RC — Resumen Diario)
POST   /api/v1/invoices/comunicacion-baja  (RA — Comunicación de Baja)
POST   /api/v1/invoices/retencion          (20 — Comprobante de Retención)
POST   /api/v1/invoices/percepcion         (40 — Comprobante de Percepción)
POST   /api/v1/invoices/guia-remision      (09 — Guía de Remisión)
POST   /api/v1/invoices/batch              (Envío masivo, máx 50)

# Consultas y descargas
GET    /api/v1/invoices                    (listar con filtros: tipoDoc, status, desde, hasta, clienteNumDoc, page, limit)
GET    /api/v1/invoices/:id
GET    /api/v1/invoices/:id/xml
GET    /api/v1/invoices/:id/pdf            (?format=a4|ticket)
GET    /api/v1/invoices/:id/cdr
POST   /api/v1/invoices/:id/resend
GET    /api/v1/invoices/:id/consult-cdr    (consulta CDR en SUNAT, solo producción)
POST   /api/v1/invoices/:id/anular-guia   (anulación GRE via REST API)

# Consultas gratuitas
GET    /api/v1/consultas/ruc/:ruc          (@Public)
GET    /api/v1/consultas/dni/:dni          (@Public)
GET    /api/v1/consultas/tipo-cambio       (@Public)
GET    /api/v1/consultas/validar-cpe       (@Public)

# Webhooks
POST   /api/v1/webhooks
GET    /api/v1/webhooks
DELETE /api/v1/webhooks/:id

# Billing
GET    /api/v1/billing/plans               (@Public)
GET    /api/v1/billing/subscriptions/current
POST   /api/v1/billing/subscriptions
POST   /api/v1/billing/webhook             (@Public, Mercado Pago IPN)

# Dashboard
GET    /api/v1/dashboard/summary           (?from, ?to — resumen por estado y tipo)
GET    /api/v1/dashboard/monthly-report    (?year, ?month — reporte PDT 621)

# Health
GET    /api/v1/health                      (@Public — DB, Redis, memory heap 256MB, disk 90%)
```

## Arquitectura del Flujo de Emisión

### Documentos síncronos (01, 03, 07, 08, 20, 40)
```
DTO → validate → loadCompany/cert/SOL → getCorrelativo → calcTotals →
buildXML → signXML → ZIP → sendBill(SOAP) → processCDR → save → queuePDF → queueWebhook
```

### Resumen Diario / Comunicación de Baja (RC, RA)
```
DTO → validate → loadCompany/cert/SOL → getCorrelativo → buildXML →
signXML → ZIP → sendSummary(SOAP) → ticket → queueTicketPoll → save
```

### Guía de Remisión (09) — REST API
```
DTO → validate → loadCompany/cert/SOL → getCorrelativo → buildXML →
signXML → ZIP → sendGRE(REST+OAuth2) → ticket → queueTicketPoll → save
```

### Helpers internos (InvoicesService)
- `prepareDocumentContext(companyId, options?)` — carga company, cert, SOL (options: `skipQuota`)
- `signAndSendSoap(xmlString, fileName, zipFileName, ruc, solUser, solPass, isBeta, endpointType)` — firma + ZIP + envío SOAP
- `buildXmlCompany(company)` → `XmlCompany`
- `toResponseDto(invoice)` → `InvoiceResponseDto`
- `atomicIncrementCorrelativo(companyId, serie)` — SQL atómico por serie
- `calculateItemsAndTotals(items, options)` — calcula IGV/ISC/ICBPER/IVAP/detracciones

## Migraciones Prisma

```
prisma/migrations/
├── 20260222204548_init/              # Tablas base: users, api_keys, companies, company_users,
│                                     # certificates, invoices, invoice_items, plans, subscriptions
└── 20260222224827_add_webhook_model/  # Tabla webhooks
```

**Nota:** Los campos IVAP, detracción, anticipos y exportación están en el schema Prisma pero requieren una nueva migración (`pnpm db:migrate`) para sincronizar con la BD.

## Seed Data (`prisma/seed.ts`)
- 4 planes: Starter (S/49, 100 inv), Pro (S/149, 500 inv), Business (S/299, 2000 inv), Enterprise (S/599, unlimited)

## Comandos Útiles

```bash
# Desarrollo
pnpm dev                  # NestJS watch mode
pnpm db:migrate           # Prisma migrate dev
pnpm db:seed              # Seed planes de suscripción
pnpm db:studio            # Prisma Studio
pnpm db:generate          # Regenerar Prisma Client

# Testing
pnpm test                 # Vitest (~566 tests, 28 spec files)
pnpm test:e2e             # E2E tests (4 archivos: auth, consultations, health, invoices)
pnpm test:cov             # Coverage (v8 provider)

# Build
pnpm build                # NestJS build (nest build)
rm -f tsconfig.tsbuildinfo && npx tsc --build  # Si build falla por stale tsbuildinfo

# Producción
pnpm start:prod           # NODE_ENV=production node dist/main.js
```

## Notas Técnicas Importantes

### node-forge ESM
```typescript
import forge from 'node-forge';  // default import, NO namespace
```

### Prisma 7 Bytes
```typescript
// Prisma 7 devuelve Uint8Array<ArrayBuffer>, envolver con Buffer:
const pfxBuffer = Buffer.from(certificate.pfxData);
```

### Prisma 7 Generated Client
```typescript
// Output local en src/generated/prisma (NO node_modules)
// prisma.config.ts usa defineConfig con earlyAccess: true y PrismaPg adapter
```

### XmlNode type (base.builder.ts)
```typescript
export type XmlNode = ReturnType<typeof create>;
// Todos los builders usan XmlNode, NO 'any'
```

### formaPago type safety
```typescript
const formaPago: 'Contado' | 'Credito' =
  dto.formaPago === 'Credito' ? 'Credito' : 'Contado';
```

### Build stale fix
Si `npx tsc --noEmit` o `nest build` da errores espurios:
```bash
rm -f tsconfig.tsbuildinfo && npx tsc --build
```

### Graceful Shutdown
`main.ts` implements graceful shutdown with 30s hard timeout for BullMQ queue drain.

### Dockerfile
Multi-stage build (deps → build → production), Node 22-alpine, dumb-init for PID 1, runs as non-root `node` user.

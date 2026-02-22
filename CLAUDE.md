# CLAUDE.md — FacturaPE Backend

## Proyecto
Backend SaaS de facturación electrónica para SUNAT Perú. Conexión DIRECTA a web services SUNAT (SEE-Del Contribuyente). Sin intermediarios PSE/OSE.

## Stack Tecnológico (versiones exactas Feb 2026)
- **Runtime:** Node.js 22 LTS
- **Framework:** NestJS 11.x + Fastify 5.x (`@nestjs/platform-fastify`)
- **ORM:** Prisma 7.x con `@prisma/adapter-pg` (driver adapter obligatorio)
- **BD:** PostgreSQL 16 con Row-Level Security (RLS)
- **Colas:** BullMQ 5.x + Redis 7 (`@nestjs/bullmq`)
- **XML:** xmlbuilder2 (generación UBL 2.1) + fast-xml-parser (parseo CDR)
- **Firma:** xml-crypto 6.x (XMLDSig SHA-256) + node-forge (PFX→PEM)
- **SOAP:** soap (node-soap) con WS-Security
- **PDF:** pdfmake (facturas A4 + tickets 80mm)
- **Pagos:** mercadopago 2.x (suscripciones PreApproval)
- **Email:** resend 6.x
- **Auth:** @nestjs/jwt + @nestjs/passport + passport-jwt
- **Validación:** class-validator + class-transformer
- **Rate Limit:** @nestjs/throttler 6.x
- **Multi-tenancy:** nestjs-cls (AsyncLocalStorage) + PG RLS
- **Compresión:** archiver (ZIP para SUNAT) + adm-zip (leer CDR)
- **Cifrado:** crypto nativo Node.js (AES-256-GCM para certificados)
- **Docs:** @nestjs/swagger + @fastify/swagger
- **Testing:** vitest + supertest
- **Package Manager:** pnpm

## Estructura de Módulos

```
src/
├── main.ts                          # Bootstrap Fastify
├── app.module.ts                    # Root module
├── common/                          # Shared utilities
│   ├── decorators/                  # @CurrentUser, @Tenant, @Public, @ApiKeyAuth
│   ├── guards/                      # JwtAuthGuard, ApiKeyGuard, TenantGuard, RolesGuard
│   ├── interceptors/                # LoggingInterceptor, TimeoutInterceptor
│   ├── filters/                     # HttpExceptionFilter, PrismaExceptionFilter
│   ├── pipes/                       # ParseRucPipe, ParseDocTypePipe
│   ├── middleware/                   # TenantMiddleware (CLS)
│   ├── interfaces/                  # Shared TypeScript interfaces
│   ├── constants/                   # Catálogos SUNAT como enums/objetos
│   │   ├── catalogo-01.ts           # Tipos de documento
│   │   ├── catalogo-05.ts           # Códigos de tributo
│   │   ├── catalogo-06.ts           # Tipos doc identidad
│   │   ├── catalogo-07.ts           # Tipos afectación IGV
│   │   ├── catalogo-09.ts           # Motivos nota crédito
│   │   ├── catalogo-10.ts           # Motivos nota débito
│   │   ├── catalogo-17.ts           # Tipos de operación
│   │   └── index.ts
│   └── utils/                       # Helpers: montoEnLetras, calcularIGV, etc.
│       ├── tax-calculator.ts        # Cálculos IGV/ISC/ICBPER
│       ├── amount-to-words.ts       # Monto en letras (español)
│       ├── ruc-validator.ts         # Validación módulo 11
│       └── encryption.ts            # AES-256-GCM encrypt/decrypt
│
├── prisma/                          # Prisma 7 config
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts
│   └── prisma.config.ts             # OBLIGATORIO en Prisma 7
│
├── modules/
│   ├── auth/                        # Autenticación y autorización
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts       # POST /auth/register, /auth/login, /auth/refresh
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── api-key.strategy.ts
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       └── login.dto.ts
│   │
│   ├── users/                       # Gestión de usuarios
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │
│   ├── companies/                   # Empresas (tenants)
│   │   ├── companies.module.ts
│   │   ├── companies.controller.ts  # CRUD + upload certificado + config SOL
│   │   ├── companies.service.ts
│   │   └── dto/
│   │       ├── create-company.dto.ts
│   │       └── update-sol-credentials.dto.ts
│   │
│   ├── certificates/                # Gestión de certificados digitales
│   │   ├── certificates.module.ts
│   │   ├── certificates.service.ts  # Upload PFX, validar, extraer info, cifrar
│   │   └── dto/
│   │
│   ├── xml-builder/                 # ⭐ CORE: Generación XML UBL 2.1
│   │   ├── xml-builder.module.ts
│   │   ├── xml-builder.service.ts   # Orquestador
│   │   ├── builders/
│   │   │   ├── invoice.builder.ts   # Factura (01) y Boleta (03)
│   │   │   ├── credit-note.builder.ts   # Nota de Crédito (07)
│   │   │   ├── debit-note.builder.ts    # Nota de Débito (08)
│   │   │   ├── summary.builder.ts       # Resumen Diario
│   │   │   ├── voided.builder.ts        # Comunicación de Baja
│   │   │   └── base.builder.ts          # Clase base con namespaces y estructura común
│   │   ├── templates/               # Plantillas XML por tipo de documento
│   │   └── validators/
│   │       └── xml-validator.ts     # Validación pre-envío contra reglas SUNAT
│   │
│   ├── xml-signer/                  # ⭐ CORE: Firma digital XMLDSig
│   │   ├── xml-signer.module.ts
│   │   ├── xml-signer.service.ts    # Firma con xml-crypto + SHA-256
│   │   └── utils/
│   │       └── pfx-reader.ts        # PFX→PEM con node-forge
│   │
│   ├── sunat-client/                # ⭐ CORE: Cliente SOAP para SUNAT
│   │   ├── sunat-client.module.ts
│   │   ├── sunat-client.service.ts  # sendBill, sendSummary, getStatus
│   │   ├── sunat-client.config.ts   # Endpoints beta/producción
│   │   └── interfaces/
│   │       ├── sunat-response.interface.ts
│   │       └── sunat-endpoints.interface.ts
│   │
│   ├── cdr-processor/               # Procesamiento de CDR (respuesta SUNAT)
│   │   ├── cdr-processor.module.ts
│   │   ├── cdr-processor.service.ts # Descomprimir ZIP, parsear XML, extraer códigos
│   │   └── interfaces/
│   │       └── cdr-result.interface.ts
│   │
│   ├── invoices/                    # API de comprobantes
│   │   ├── invoices.module.ts
│   │   ├── invoices.controller.ts   # POST /invoices/factura, /boleta, /nota-credito, etc.
│   │   ├── invoices.service.ts      # Orquesta: validar → XML → firmar → ZIP → cola
│   │   └── dto/
│   │       ├── create-invoice.dto.ts
│   │       ├── create-credit-note.dto.ts
│   │       ├── create-debit-note.dto.ts
│   │       ├── invoice-item.dto.ts
│   │       └── invoice-response.dto.ts
│   │
│   ├── pdf-generator/               # Representación impresa
│   │   ├── pdf-generator.module.ts
│   │   ├── pdf-generator.service.ts
│   │   ├── templates/
│   │   │   ├── invoice-a4.template.ts    # Formato A4
│   │   │   └── invoice-ticket.template.ts # Formato ticket 80mm
│   │   └── interfaces/
│   │
│   ├── queues/                      # BullMQ processors
│   │   ├── queues.module.ts
│   │   ├── processors/
│   │   │   ├── invoice-send.processor.ts   # Envío a SUNAT con reintentos
│   │   │   ├── pdf-generate.processor.ts   # Generación PDF async
│   │   │   ├── email-send.processor.ts     # Envío email con CPE adjunto
│   │   │   └── summary-send.processor.ts   # Resumen diario/baja
│   │   └── interfaces/
│   │
│   ├── consultations/               # APIs de consulta gratuitas
│   │   ├── consultations.module.ts
│   │   ├── consultations.controller.ts  # GET /consultas/ruc/:ruc, /dni/:dni, /tipo-cambio
│   │   └── consultations.service.ts
│   │
│   ├── webhooks/                    # Webhooks salientes a clientes
│   │   ├── webhooks.module.ts
│   │   ├── webhooks.service.ts
│   │   └── dto/
│   │
│   ├── billing/                     # Suscripciones y planes
│   │   ├── billing.module.ts
│   │   ├── billing.controller.ts    # /plans, /subscriptions, /webhook (Mercado Pago)
│   │   ├── billing.service.ts
│   │   └── dto/
│   │
│   └── notifications/               # Emails transaccionales
│       ├── notifications.module.ts
│       └── notifications.service.ts # Resend: bienvenida, factura, alerta
│
├── config/                          # Configuración centralizada
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── sunat.config.ts              # URLs, modo beta/prod
│   ├── jwt.config.ts
│   └── mercadopago.config.ts
│
└── database/                        # SQL adicional
    ├── rls-policies.sql             # Row Level Security
    └── seed-catalogs.sql            # Catálogos SUNAT iniciales
```

## Schema Prisma (PostgreSQL)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === AUTH ===

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  name          String
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  companyUsers  CompanyUser[]
  apiKeys       ApiKey[]

  @@map("users")
}

model ApiKey {
  id          String    @id @default(cuid())
  userId      String    @map("user_id")
  companyId   String    @map("company_id")
  keyHash     String    @unique @map("key_hash")
  prefix      String    // Primeros 8 chars para identificación
  name        String
  lastUsedAt  DateTime? @map("last_used_at")
  expiresAt   DateTime? @map("expires_at")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")

  user        User      @relation(fields: [userId], references: [id])
  company     Company   @relation(fields: [companyId], references: [id])

  @@map("api_keys")
}

// === TENANCY ===

model Company {
  id              String    @id @default(cuid())
  ruc             String    @unique
  razonSocial     String    @map("razon_social")
  nombreComercial String?   @map("nombre_comercial")
  direccion       String
  ubigeo          String    // 6 dígitos
  departamento    String
  provincia       String
  distrito        String
  urbanizacion    String?
  codigoPais      String    @default("PE") @map("codigo_pais")

  // SOL credentials (cifrados AES-256-GCM)
  solUser         String?   @map("sol_user")       // cifrado
  solPass         String?   @map("sol_pass")       // cifrado

  // Config facturación
  serieFactura    String    @default("F001") @map("serie_factura")
  serieBoleta     String    @default("B001") @map("serie_boleta")
  serieNCFactura  String    @default("FC01") @map("serie_nc_factura")
  serieNDFactura  String    @default("FD01") @map("serie_nd_factura")
  serieNCBoleta   String    @default("BC01") @map("serie_nc_boleta")
  serieNDBoleta   String    @default("BD01") @map("serie_nd_boleta")
  nextCorrelativo Json      @default("{}") @map("next_correlativo") // { "F001": 1, "B001": 1 }

  // Entorno
  isBeta          Boolean   @default(true) @map("is_beta")
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  companyUsers    CompanyUser[]
  certificates    Certificate[]
  invoices        Invoice[]
  apiKeys         ApiKey[]
  subscription    Subscription?

  @@map("companies")
}

model CompanyUser {
  id        String    @id @default(cuid())
  userId    String    @map("user_id")
  companyId String    @map("company_id")
  role      String    @default("member") // owner, admin, member

  user      User      @relation(fields: [userId], references: [id])
  company   Company   @relation(fields: [companyId], references: [id])

  @@unique([userId, companyId])
  @@map("company_users")
}

// === CERTIFICADOS ===

model Certificate {
  id              String    @id @default(cuid())
  companyId       String    @map("company_id")
  pfxData         Bytes     @map("pfx_data")       // cifrado AES-256-GCM
  pfxIv           String    @map("pfx_iv")
  pfxAuthTag      String    @map("pfx_auth_tag")
  passphrase      String    // cifrado AES-256-GCM
  passphraseIv    String    @map("passphrase_iv")
  passphraseTag   String    @map("passphrase_tag")
  serialNumber    String    @map("serial_number")
  issuer          String
  subject         String
  validFrom       DateTime  @map("valid_from")
  validTo         DateTime  @map("valid_to")
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")

  company         Company   @relation(fields: [companyId], references: [id])

  @@map("certificates")
}

// === COMPROBANTES ===

model Invoice {
  id                String    @id @default(cuid())
  companyId         String    @map("company_id")

  // Identificación
  tipoDoc           String    @map("tipo_doc")          // 01, 03, 07, 08
  serie             String                               // F001, B001, etc.
  correlativo       Int
  tipoOperacion     String    @default("0101") @map("tipo_operacion")

  // Fechas
  fechaEmision      DateTime  @map("fecha_emision")
  fechaVencimiento  DateTime? @map("fecha_vencimiento")

  // Cliente
  clienteTipoDoc    String    @map("cliente_tipo_doc")   // Cat 06
  clienteNumDoc     String    @map("cliente_num_doc")
  clienteNombre     String    @map("cliente_nombre")
  clienteDireccion  String?   @map("cliente_direccion")
  clienteEmail      String?   @map("cliente_email")

  // Moneda y totales
  moneda            String    @default("PEN")
  opGravadas        Decimal   @default(0) @map("op_gravadas") @db.Decimal(12, 2)
  opExoneradas      Decimal   @default(0) @map("op_exoneradas") @db.Decimal(12, 2)
  opInafectas       Decimal   @default(0) @map("op_inafectas") @db.Decimal(12, 2)
  opGratuitas       Decimal   @default(0) @map("op_gratuitas") @db.Decimal(12, 2)
  igv               Decimal   @default(0) @db.Decimal(12, 2)
  isc               Decimal   @default(0) @db.Decimal(12, 2)
  icbper            Decimal   @default(0) @db.Decimal(12, 2)
  otrosCargos       Decimal   @default(0) @map("otros_cargos") @db.Decimal(12, 2)
  otrosTributos     Decimal   @default(0) @map("otros_tributos") @db.Decimal(12, 2)
  descuentoGlobal   Decimal   @default(0) @map("descuento_global") @db.Decimal(12, 2)
  totalVenta        Decimal   @map("total_venta") @db.Decimal(12, 2)

  // Forma de pago
  formaPago         String    @default("Contado") @map("forma_pago") // Contado, Credito
  cuotas            Json?     // [{ monto, fechaPago }]

  // Nota de crédito/débito
  docRefTipo        String?   @map("doc_ref_tipo")       // Tipo doc referencia
  docRefSerie       String?   @map("doc_ref_serie")
  docRefCorrelativo Int?      @map("doc_ref_correlativo")
  motivoNota        String?   @map("motivo_nota")        // Cat 09 o Cat 10

  // XML y firma
  xmlContent        String?   @map("xml_content")        // XML generado (comprimido)
  xmlHash           String?   @map("xml_hash")           // Hash SHA-256 del XML firmado
  xmlSigned         Boolean   @default(false) @map("xml_signed")

  // Estado SUNAT
  status            String    @default("DRAFT") // DRAFT, PENDING, QUEUED, SENDING, ACCEPTED, REJECTED, OBSERVED
  sunatCode         String?   @map("sunat_code")
  sunatMessage      String?   @map("sunat_message")
  sunatNotes        Json?     @map("sunat_notes")        // Observaciones
  cdrZip            Bytes?    @map("cdr_zip")

  // PDF
  pdfUrl            String?   @map("pdf_url")

  // Tracking
  sentAt            DateTime? @map("sent_at")
  attempts          Int       @default(0)
  lastAttemptAt     DateTime? @map("last_attempt_at")
  lastError         String?   @map("last_error")

  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  company           Company   @relation(fields: [companyId], references: [id])
  items             InvoiceItem[]

  @@unique([companyId, tipoDoc, serie, correlativo])
  @@index([companyId, status])
  @@index([companyId, fechaEmision])
  @@index([companyId, clienteNumDoc])
  @@map("invoices")
}

model InvoiceItem {
  id              String    @id @default(cuid())
  invoiceId       String    @map("invoice_id")

  cantidad        Decimal   @db.Decimal(12, 3)
  unidadMedida    String    @default("NIU") @map("unidad_medida") // Cat 03
  descripcion     String
  codigo          String?   // Código interno del producto
  codigoSunat     String?   @map("codigo_sunat") // Código producto SUNAT

  valorUnitario   Decimal   @map("valor_unitario") @db.Decimal(12, 4) // Sin IGV
  precioUnitario  Decimal   @map("precio_unitario") @db.Decimal(12, 4) // Con IGV
  valorVenta      Decimal   @map("valor_venta") @db.Decimal(12, 2)

  tipoAfectacion  String    @default("10") @map("tipo_afectacion") // Cat 07
  igv             Decimal   @default(0) @db.Decimal(12, 2)
  isc             Decimal   @default(0) @db.Decimal(12, 2)
  icbper          Decimal   @default(0) @db.Decimal(12, 2)
  descuento       Decimal   @default(0) @db.Decimal(12, 2)

  invoice         Invoice   @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@map("invoice_items")
}

// === BILLING ===

model Plan {
  id              String    @id @default(cuid())
  name            String    // Starter, Pro, Business, Enterprise
  slug            String    @unique
  priceMonthly    Decimal   @map("price_monthly") @db.Decimal(8, 2) // en PEN
  maxInvoices     Int       @map("max_invoices") // por mes
  maxCompanies    Int       @map("max_companies")
  features        Json      // { webhooks: true, whatsapp: false, ... }
  isActive        Boolean   @default(true) @map("is_active")

  subscriptions   Subscription[]

  @@map("plans")
}

model Subscription {
  id                String    @id @default(cuid())
  companyId         String    @unique @map("company_id")
  planId            String    @map("plan_id")
  mpPreapprovalId   String?   @map("mp_preapproval_id") // ID Mercado Pago
  status            String    @default("active") // active, paused, cancelled
  currentPeriodStart DateTime @map("current_period_start")
  currentPeriodEnd   DateTime @map("current_period_end")
  invoicesUsed      Int       @default(0) @map("invoices_used") // este período
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  company           Company   @relation(fields: [companyId], references: [id])
  plan              Plan      @relation(fields: [planId], references: [id])

  @@map("subscriptions")
}
```

## Reglas de Desarrollo

### General
- TypeScript estricto (`strict: true`)
- ESM modules (`"type": "module"` en package.json)
- Imports con extensión `.js` (requerido por Prisma 7 ESM)
- Usar `pnpm` como package manager
- Convención snake_case en BD, camelCase en código TS
- Todos los endpoints bajo `/api/v1/`
- Respuestas API: `{ success: boolean, data?: T, error?: { code, message } }`
- Logging estructurado JSON en producción

### Autenticación
- JWT access token: 15 min, refresh token: 7 días (rotation)
- API Keys: hash SHA-256, prefijo de 8 chars para identificar
- Guards en orden: ThrottlerGuard → JwtAuthGuard → TenantGuard → RolesGuard

### Multi-tenancy
- Cada request DEBE resolver un companyId (del JWT o API Key)
- CLS (nestjs-cls) almacena tenantId en AsyncLocalStorage
- Prisma Client Extension ejecuta SET tenancy.tenant_id antes de cada query
- RLS policies en PostgreSQL filtran automáticamente

### XML/SUNAT
- Tasa IGV: 18% (validar con tolerancia ±1 según reglas feb 2026)
- Firma: SHA-256 + RSA (NO SHA-1)
- Namespaces UBL 2.1 exactos (ver sección arriba)
- ZIP name: `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip`
- Envío máximo 3 días calendario desde emisión
- Beta URL: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl`
- Producción URL: `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl`
- Usuario SOAP: `{RUC}{UsuarioSOL}` (concatenado sin separador)

### Colas BullMQ
- Cola `invoice-send`: envío a SUNAT, 5 intentos, backoff exponencial (2s base)
- Cola `pdf-generate`: generación PDF, 3 intentos
- Cola `email-send`: envío email con adjuntos, 3 intentos
- Cola `summary-send`: resúmenes diarios, 5 intentos
- Concurrency: 5 por procesador
- Rate limiter: max 10 jobs/segundo (no saturar SUNAT)

### Seguridad
- Certificados .pfx cifrados con AES-256-GCM antes de almacenar en BD
- Claves SOL cifradas con AES-256-GCM
- Master key en variable de entorno `ENCRYPTION_KEY` (32 bytes hex)
- Rate limiting: 3 req/s burst, 20 req/10s, 100 req/min
- CORS configurado para dominios específicos
- Helmet headers via @fastify/helmet

## Variables de Entorno (.env)

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

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

# SUNAT
SUNAT_ENV=beta
SUNAT_BETA_URL=https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl
SUNAT_PROD_URL=https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl

# Mercado Pago
MP_ACCESS_TOKEN=TEST-xxx
MP_WEBHOOK_SECRET=xxx

# Resend
RESEND_API_KEY=re_xxx
EMAIL_FROM=facturas@tudominio.com
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
      - ./database/rls-policies.sql:/docker-entrypoint-initdb.d/01-rls.sql

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

## Endpoints API v1

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/api-keys          (crear API key)
DELETE /api/v1/auth/api-keys/:id

GET    /api/v1/companies
POST   /api/v1/companies
GET    /api/v1/companies/:id
PUT    /api/v1/companies/:id
POST   /api/v1/companies/:id/certificate   (upload .pfx)
PUT    /api/v1/companies/:id/sol-credentials

POST   /api/v1/invoices/factura         (tipo 01)
POST   /api/v1/invoices/boleta          (tipo 03)
POST   /api/v1/invoices/nota-credito    (tipo 07)
POST   /api/v1/invoices/nota-debito     (tipo 08)
POST   /api/v1/invoices/resumen-diario
POST   /api/v1/invoices/comunicacion-baja
GET    /api/v1/invoices                 (listar con filtros)
GET    /api/v1/invoices/:id
GET    /api/v1/invoices/:id/xml         (descargar XML)
GET    /api/v1/invoices/:id/pdf         (descargar PDF)
GET    /api/v1/invoices/:id/cdr         (descargar CDR)
POST   /api/v1/invoices/:id/resend      (reenviar a SUNAT)

GET    /api/v1/consultas/ruc/:ruc
GET    /api/v1/consultas/dni/:dni
GET    /api/v1/consultas/tipo-cambio
GET    /api/v1/consultas/validar-cpe

GET    /api/v1/plans
GET    /api/v1/subscriptions/current
POST   /api/v1/subscriptions
POST   /api/v1/billing/webhook          (Mercado Pago IPN)
```

## Orden de Implementación (fases)

### Fase 1 — Foundation (arrancar acá)
1. Scaffold NestJS 11 + Fastify
2. Docker Compose (Postgres + Redis)
3. Prisma 7 schema + migraciones + seed
4. Auth module (JWT + API Keys)
5. Companies module (CRUD + RLS)
6. Certificates module (upload + cifrado)
7. Config module centralizado
8. Global guards, filters, interceptors

### Fase 2 — Core Engine
1. Catálogos SUNAT (constantes)
2. Tax calculator utility
3. XML Builder: Factura (01) — el más completo
4. XML Signer (XMLDSig SHA-256)
5. SUNAT Client (SOAP sendBill)
6. CDR Processor (parsear respuesta)
7. Invoices service (orquestación completa)
8. Testing contra beta SUNAT

### Fase 3 — Otros documentos
1. XML Builder: Boleta (03)
2. XML Builder: Nota de Crédito (07)
3. XML Builder: Nota de Débito (08)
4. Resumen Diario
5. Comunicación de Baja
6. Validador pre-envío

### Fase 4 — Productización
1. BullMQ queues + processors
2. PDF Generator (A4 + ticket)
3. Consultas API (RUC, DNI, tipo cambio)
4. Webhooks salientes
5. Billing + Mercado Pago
6. Notifications (Resend)
7. Rate limiting
8. Swagger docs completos

### Fase 5 — Production
1. Health checks + monitoring
2. Logging estructurado
3. Error tracking (Sentry)
4. CI/CD pipeline
5. Dockerfile producción (multi-stage)
6. Testing E2E
7. Migrar empresas de beta → producción
```

## Comandos Útiles

```bash
# Desarrollo
pnpm dev                  # NestJS watch mode
pnpm db:migrate           # Prisma migrate dev
pnpm db:seed              # Seed catálogos
pnpm db:studio            # Prisma Studio

# Testing
pnpm test                 # Vitest
pnpm test:e2e             # E2E tests

# Producción
pnpm build
pnpm start:prod
```

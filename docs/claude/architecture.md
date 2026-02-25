# Arquitectura — FacturaPE Backend

## Estructura de Módulos

```
src/
├── main.ts                          # Bootstrap Fastify + Sentry + graceful shutdown + Swagger global responses
├── app.module.ts                    # Root module (Fases 1-5) — 18 feature modules + 5 guards + 3 filters + 2 interceptors
├── generated/prisma/                # Prisma 7 generated client (output local, NO node_modules)
├── common/
│   ├── decorators/                  # @CurrentUser, @Tenant, @Public, @ApiKeyAuth, @SkipTenant, @Roles + index.ts
│   ├── guards/                      # TenantThrottlerGuard, JwtAuthGuard, ApiKeyGuard, TenantGuard, RolesGuard + index.ts
│   ├── interceptors/                # LoggingInterceptor, TimeoutInterceptor + index.ts
│   ├── filters/                     # PrismaExceptionFilter, HttpExceptionFilter, SentryExceptionFilter + index.ts
│   ├── pipes/                       # ParseRucPipe, ParseDocTypePipe + index.ts
│   ├── middleware/                   # CorrelationIdMiddleware (X-Request-ID vía CLS)
│   ├── interfaces/                  # RequestUser, shared TS interfaces
│   ├── constants/
│   │   └── index.ts                 # Catálogos 01-62, namespaces, endpoints, tasas, detracciones (34 códigos Cat 54)
│   └── utils/
│       ├── tax-calculator.ts        # Cálculos IGV/ISC/ICBPER/IVAP/detracciones/restaurant-mype
│       ├── amount-to-words.ts       # Monto en letras (español)
│       ├── ruc-validator.ts         # Validación módulo 11
│       ├── encryption.ts            # AES-256-GCM encrypt/decrypt
│       ├── peru-date.ts            # peruNow(), peruToday(), daysBetweenInPeru(), isWithinMaxDays()
│       └── zip.ts                   # Utilidades ZIP (archiver + adm-zip)
│
├── config/
│   ├── app.config.ts                # port, apiPrefix, nodeEnv, corsOrigin, rateLimit tiers
│   ├── database.config.ts           # DATABASE_URL
│   ├── redis.config.ts              # REDIS_HOST, REDIS_PORT
│   ├── sunat.config.ts              # SOAP + GRE OAuth2 config
│   ├── jwt.config.ts                # JWT_SECRET (15min), JWT_REFRESH_SECRET (7d)
│   ├── mercadopago.config.ts        # MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET
│   ├── resend.config.ts             # RESEND_API_KEY, EMAIL_FROM
│   ├── sentry.config.ts             # SENTRY_DSN, tracesSampleRate
│   └── index.ts                     # Re-exports allConfigs array
│
└── modules/
    ├── auth/                        # JWT + API Keys + refresh tokens + logout + change-password
    │   ├── auth.module.ts
    │   ├── auth.controller.ts       # 7 endpoints: register, login, refresh, logout, change-password, api-keys CRUD
    │   ├── auth.service.ts
    │   ├── strategies/              # jwt.strategy.ts, api-key.strategy.ts
    │   └── dto/                     # register, login, refresh-token, create-api-key, change-password
    │
    ├── users/                       # Gestión de usuarios (GET/PUT /me, GET /me/companies)
    │   ├── users.controller.ts      # 3 endpoints
    │   ├── users.service.ts
    │   └── dto/                     # update-user, change-password
    │
    ├── companies/                   # Empresas (tenants) + SOL + migración beta→prod
    │   ├── companies.controller.ts  # 8 endpoints: CRUD + sol-credentials + migration
    │   ├── companies.service.ts
    │   ├── migration.service.ts     # checkMigrationReadiness, migrateToProduction, revertToBeta
    │   └── dto/                     # create-company, update-company, update-sol-credentials
    │
    ├── certificates/                # PFX upload, validar, cifrar AES-256-GCM
    │   ├── certificates.controller.ts  # 2 endpoints (upload multipart + get)
    │   ├── certificates.service.ts
    │   └── dto/                     # upload-certificate
    │
    ├── xml-builder/                 # CORE: Generación XML UBL 2.1
    │   ├── xml-builder.module.ts
    │   ├── xml-builder.service.ts   # Orquestador (8 métodos build*)
    │   ├── builders/
    │   │   ├── base.builder.ts          # Clase base abstracta (export type XmlNode)
    │   │   ├── invoice.builder.ts       # Factura (01) y Boleta (03) — IVAP, detracciones, anticipos, exportación
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
    ├── xml-signer/                  # CORE: Firma digital XMLDSig SHA-256
    │   ├── xml-signer.service.ts    # sign(), getXmlHash(), getDigestValue()
    │   └── utils/pfx-reader.ts      # PFX→PEM con node-forge
    │
    ├── sunat-client/                # CORE: Clientes SUNAT
    │   ├── sunat-client.service.ts  # SOAP: sendBill(endpointType), sendSummary, getStatus, consultCdr
    │   ├── sunat-gre-client.service.ts  # REST: OAuth2 + sendGuide, getGuideStatus, anularGuia
    │   ├── interfaces/              # sunat-endpoints, sunat-response, sunat-gre interfaces
    │   └── wsdl/                    # WSDLs locales: main.wsdl, retention.wsdl, types.wsdl, types.xsd
    │
    ├── cdr-processor/               # Descomprimir ZIP, parsear XML CDR
    │   ├── cdr-processor.service.ts # processCdr(cdrZipBuffer) → { code, message, notes }
    │   └── interfaces/              # cdr-result.interface
    │
    ├── invoices/                    # API de comprobantes (9 tipos + batch + 18 endpoints)
    │   ├── invoices.module.ts
    │   ├── invoices.controller.ts   # 18 endpoints (9 tipos + batch + CRUD + consult-cdr + anular-guia)
    │   ├── invoices.service.ts      # Orquesta: validate → XML → sign → ZIP → send/queue
    │   └── dto/
    │       ├── create-invoice.dto.ts      # Factura/Boleta + PaymentInstallmentDto + AnticipoItemDto + DocRelacionadoDto
    │       ├── create-credit-note.dto.ts  # NC (07)
    │       ├── create-debit-note.dto.ts   # ND (08)
    │       ├── create-summary.dto.ts      # RC
    │       ├── create-voided.dto.ts       # RA
    │       ├── create-retention.dto.ts    # CRE (20)
    │       ├── create-perception.dto.ts   # CPE (40)
    │       ├── create-guide.dto.ts        # GRE (09)
    │       ├── batch-invoice.dto.ts       # Envío masivo (máx 50) + batchItemFingerprint()
    │       ├── invoice-item.dto.ts        # Items con ISC, ICBPER, descuento, bolsas plástico
    │       ├── invoice-response.dto.ts
    │       └── index.ts                   # Re-exports
    │
    ├── pdf-generator/               # PDF A4 + ticket 80mm (tasa IGV dinámica, IVAP, detracciones)
    │   ├── pdf-generator.service.ts # generateA4(), generateTicket()
    │   ├── templates/
    │   │   ├── invoice-a4.template.ts     # IGV dinámico (18%/10.5%/4%), IVAP, detracciones, gratuitas, exportación
    │   │   └── invoice-ticket.template.ts # Mismo soporte dinámico para ticket 80mm
    │   └── interfaces/
    │       └── pdf-data.interface.ts      # PdfInvoiceData (con opGratuitas, opIvap, igvRate, detracción)
    │
    ├── queues/                      # BullMQ processors (7 colas)
    │   ├── queues.module.ts
    │   ├── queues.constants.ts      # 7 colas: QUEUE_INVOICE_SEND..QUEUE_DLQ + ALL_QUEUES + QueueName type
    │   ├── processors/
    │   │   ├── invoice-send.processor.ts   # Envío síncrono a SUNAT
    │   │   ├── pdf-generate.processor.ts   # PDF async
    │   │   ├── email-send.processor.ts     # Email con adjuntos (Resend)
    │   │   ├── summary-send.processor.ts   # RC/RA → ticket
    │   │   ├── ticket-poll.processor.ts    # Polling getStatus (summary|voided|guide)
    │   │   ├── webhook-send.processor.ts   # Envío HMAC-signed a webhook URLs
    │   │   └── dlq.listener.ts            # Dead Letter Queue — monitorea 5 colas, reenvía fallidos
    │   └── interfaces/
    │       └── queue-job-data.interfaces.ts
    │
    ├── consultations/               # RUC, DNI, tipo cambio, validar CPE (4 endpoints @Public)
    ├── webhooks/                    # CRUD + envío HMAC-SHA256 signed (3 endpoints)
    ├── billing/                     # Planes + suscripciones + Mercado Pago IPN (4 endpoints bajo /billing/)
    ├── notifications/               # Emails transaccionales (Resend) — sin endpoints, uso interno
    ├── dashboard/                   # Resumen emisión + reporte mensual PDT 621 (2 endpoints)
    ├── health/                      # Terminus checks: DB, Redis, memory heap 256MB, disk 90% (1 endpoint @Public)
    │   ├── health.controller.ts
    │   └── indicators/              # prisma.health-indicator.ts, redis.health-indicator.ts
    ├── prisma/                      # PrismaService (@Global) con tenant extension + RLS
    └── redis/                       # RedisModule (@Global) — ioredis client (REDIS_CLIENT token)
```

## Flujo de Emisión

### Documentos síncronos — SOAP Invoice (01, 03, 07, 08)
```
DTO → validate → loadCompany/cert/SOL → getCorrelativo → calcTotals →
buildXML → signXML → ZIP → sendBill(SOAP, endpoint=invoice) → processCDR → save → queuePDF → queueWebhook
```

### Documentos síncronos — SOAP Retention (20, 40)
```
DTO → validate → loadCompany/cert/SOL → getCorrelativo →
buildXML → signXML → ZIP → sendBill(SOAP, endpoint=retention) → processCDR → save → queuePDF → queueWebhook
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
CODIGO_DETRACCION       Cat 54: 42 códigos organizados por Anexo I/II/III (completo con DETRACCION_RATES)
MEDIO_PAGO              Cat 59: métodos de pago (001-999)
CODIGO_PRODUCTO_SUNAT   Cat 62: categorías UNSPSC + isValidProductCode()

IGV_RATE = 0.18           IGV_RESTAURANT_RATE = 0.10 (MYPEs Ley 31556, 8% IGV + 2% IPM)
IVAP_RATE = 0.04           ICBPER_RATE = 0.50           UIT_2026 = 5500
MAX_DAYS_BY_DOC_TYPE      { '01':3, '03':7, '07':3, '08':3, '09':7, '20':9, '40':9 }
RETENCION_RATES           { '01':0.03, '02':0.06 }
PERCEPCION_RATES          { '01':0.02, '02':0.01, '03':0.005 }
DETRACCION_RATES          42 códigos con tasa específica (Cat 54)
DETRACCION_DEFAULT_RATE   = 0.12
DETRACCION_THRESHOLD      = 700 (S/)
DETRACCION_THRESHOLD_TRANSPORT = 400 (S/)
DETRACCION_THRESHOLD_ANNEX1_UIT_FRACTION = 0.5

TIPO_DOC_NOMBRES          Human-readable doc type names
CURRENCY_SYMBOLS          PEN/USD/EUR symbols

UBL_NAMESPACES: INVOICE, CREDIT_NOTE, DEBIT_NOTE, SUMMARY_DOCUMENTS, VOIDED_DOCUMENTS,
                DESPATCH_ADVICE, RETENTION, PERCEPTION, CAC, CBC, DS, EXT, SAC, QDT, UDT

SUNAT_ENDPOINTS:   BETA.INVOICE, BETA.RETENTION, PRODUCTION.INVOICE, PRODUCTION.RETENTION,
                   PRODUCTION.CONSULT_CDR, PRODUCTION.CONSULT_VALID
SUNAT_GRE_ENDPOINTS: BETA.AUTH, BETA.API, PRODUCTION.AUTH, PRODUCTION.API
SUNAT_GRE_OAUTH_SCOPE, SUNAT_BETA_CREDENTIALS
```

## Colas BullMQ (7 colas)

- `invoice-send`: envío síncrono a SUNAT, 5 intentos, backoff exponencial (2s base), concurrency 5, rate limit 10/s
- `pdf-generate`: generación PDF, 3 intentos, concurrency 5
- `email-send`: envío email con adjuntos, 3 intentos, concurrency 5
- `summary-send`: RC/RA envío → ticket, 5 intentos, backoff exponencial (2s base), concurrency 5, rate limit 10/s
- `ticket-poll`: polling getStatus, 15 intentos, backoff exponencial (10s base, max 5min), concurrency 3
  - `documentType`: 'summary' | 'voided' | 'guide'
- `webhook-send`: envío HMAC-signed a webhook URLs, 3 intentos, backoff exponencial (5s base), concurrency 3
- `dead-letter-queue`: jobs fallidos permanentemente, sin auto-processing (review manual)
  - `DlqListener` monitorea 5 colas principales y reenvía jobs fallidos al DLQ

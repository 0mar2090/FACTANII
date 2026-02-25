# CLAUDE.md — FacturaPE Backend

> Cuando necesites contexto detallado sobre arquitectura, APIs, base de datos o deployment, lee el archivo correspondiente en `docs/claude/`.

## Proyecto

Backend SaaS de facturación electrónica para SUNAT Perú. Conexión DIRECTA a web services SUNAT (SEE-Del Contribuyente). Sin intermediarios PSE/OSE. Soporta los 9 tipos de CPE: Factura (01), Boleta (03), NC (07), ND (08), GRE (09), CRE (20), CPE (40), Resumen Diario (RC), Comunicación de Baja (RA).

## Stack Principal

- **Runtime:** Node.js 22 LTS + NestJS 11.1 + Fastify 5.7
- **BD:** PostgreSQL 16 (RLS) + Prisma 7.4 + Redis 7 (BullMQ)
- **XML:** xmlbuilder2 (UBL 2.1) + xml-crypto (firma SHA-256) + node-forge (PFX)
- **SUNAT:** SOAP (node-soap) + REST (axios, OAuth2 para GRE)
- **PDF:** pdfmake (A4 + ticket 80mm, IGV dinámico)
- **Auth:** JWT + API Keys + multi-tenancy (nestjs-cls + RLS)
- **Testing:** vitest (~709 tests, 33 spec files) + supertest (4 e2e)
- **CI/CD:** GitHub Actions (lint → test → build → Docker GHCR)
- **Storage:** Cloudflare R2 (PDFs) via @aws-sdk/client-s3
- **Package Manager:** pnpm 9+

## Módulos del Sistema

### Infraestructura (src/modules/)
| Módulo | Propósito |
|--------|-----------|
| `prisma/` | Prisma 7 + PrismaPg adapter, CLS multi-tenancy, `withTransaction()`, auto-inject `companyId` |
| `redis/` | ioredis global (lockout, cache, BullMQ backend) |
| `health/` | `/health` — PostgreSQL, Redis, heap (256MB), disco (90%) via @nestjs/terminus |
| `queues/` | 7 colas BullMQ + processors (ver sección Colas) |
| `notifications/` | Emails transaccionales via Resend SDK |

### Autenticación & Tenancy
| Módulo | Propósito |
|--------|-----------|
| `auth/` | JWT + API Keys, register/login/refresh/logout, scrypt password hashing, rate-limit lockout |
| `users/` | Perfil de usuario, cambio de contraseña |
| `companies/` | CRUD empresas, SOL credentials (AES-256-GCM), migración beta→producción, validación RUC mod-11 |
| `certificates/` | Upload PFX (multipart), cifrado AES-256-GCM de pfxData + passphrase |
| `billing/` | Suscripciones SaaS (Mercado Pago), planes, quotas, webhook IPN |

### SUNAT Core
| Módulo | Propósito |
|--------|-----------|
| `xml-builder/` | 8 builders UBL 2.1 + validator pre-envío (XmlValidatorService) |
| `xml-signer/` | Firma digital RSA-SHA256 enveloped, exc-c14n, X.509 en KeyInfo |
| `sunat-client/` | SOAP (sendBill, sendSummary, getStatus) + REST OAuth2 (GRE) |
| `cdr-processor/` | Parseo CDR ZIP → ApplicationResponse → code/description/notes |
| `invoices/` | Orquestador principal: 18 endpoints, emisión, consultas, PDF, XML, CDR |

### Features Complementarios
| Módulo | Propósito |
|--------|-----------|
| `pdf-generator/` | pdfmake A4 + ticket 80mm, QR code, Roboto, IVAP/detracción/ICBPER |
| `consultations/` | Consultas públicas: RUC (SUNAT), DNI (RENIEC), tipo cambio, validar CPE |
| `dashboard/` | Analytics: resumen por estado/tipo, reporte mensual (formato PDT 621) |
| `webhooks/` | Webhook outbound: HMAC-SHA256, retry con backoff |

## Reglas Críticas del Agente

### TypeScript & Imports
- `strict: true`, ESM modules (`"type": "module"`)
- Imports SIEMPRE con extensión `.js` (requerido por Prisma 7 ESM)
- Path aliases: `@common/*`, `@modules/*`, `@config/*`, `@generated/*`
- `import forge from 'node-forge'` — default import, NO namespace
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`

### Prisma 7
- Generated client en `src/generated/prisma/` (NO node_modules)
- Bytes: `Buffer.from(certificate.pfxData)` (Prisma 7 devuelve Uint8Array)
- `InvoiceStatus` es un PostgreSQL ENUM: `DRAFT → PENDING → QUEUED → SENDING → ACCEPTED / REJECTED / OBSERVED`
- `prisma.config.ts` usa `defineConfig` con `earlyAccess: true` y PrismaPg adapter
- Tenant-scoped models: `Invoice`, `InvoiceItem`, `Certificate`, `Webhook`, `Subscription`, `ApiKey`
- Filterable ops (auto-inject companyId): `findFirst`, `findMany`, `findUnique`, `count`, `aggregate`, `groupBy`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`

### SUNAT / XML
- 9 tipos de documento con 4 protocolos distintos:
  - SOAP invoice endpoint: 01, 03, 07, 08
  - SOAP retention endpoint: 20, 40
  - Asíncronos (sendSummary + ticket polling): RC, RA
  - REST API (OAuth2): GRE 09
- Firma: SHA-256 + RSA enveloped, exc-c14n (NUNCA SHA-1)
- ZIP: `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip` — RUC debe empezar con 1 o 2 (ERR-0151)
- Usuario SOAP: `{RUC}{UsuarioSOL}` (concatenado sin separador)
- WSDLs locales en `src/modules/sunat-client/wsdl/`
- Tasas vigentes 2025-2026:
  - IGV: 18% (`IGV_RATE = 0.18`)
  - IVAP: 4% (`IVAP_RATE = 0.04`) — Arroz Pilado
  - IGV MYPE: 10% (`IGV_RESTAURANT_RATE = 0.10`) — Ley 31556 (8% IGV + 2% IPM)
  - ICBPER: S/0.50 por bolsa (`ICBPER_RATE = 0.50`)
  - UIT 2026: S/5,500

### Catálogos SUNAT Implementados
| Catálogo | Constante | Códigos |
|----------|-----------|---------|
| Cat 01 | `TIPO_DOCUMENTO` | 01, 03, 07, 08, 09, 20, 40 |
| Cat 02 | `TIPO_MONEDA` | PEN, USD, EUR |
| Cat 03 | `UNIDAD_MEDIDA` | NIU, ZZ, KGM, LTR, MTR, MTK, HUR, DAY, BX, BG, EA |
| Cat 05 | `CODIGO_TRIBUTO` | 1000(IGV), 1016(IVAP), 2000(ISC), 7152(ICBPER), 9995-9999 |
| Cat 06 | `TIPO_DOC_IDENTIDAD` | 0, 1, 4, 6, 7, - |
| Cat 07 | `TIPO_AFECTACION_IGV` | 10-17(gravado), 20-21(exonerado), 30-36(inafecto), 40(export) |
| Cat 09 | `MOTIVO_NOTA_CREDITO` | 01-13 (13 motivos) |
| Cat 10 | `MOTIVO_NOTA_DEBITO` | 01, 02, 03, 10 |
| Cat 12 | `TIPO_DOCUMENTO_RELACIONADO` | 01-10, 99 |
| Cat 16 | `TIPO_PRECIO` | 01(con IGV), 02(referencial gratuito) |
| Cat 17/51 | `TIPO_OPERACION` | 0100-0112, 0200-0208, 1001, 2001 |
| Cat 18 | `MODALIDAD_TRANSPORTE` | 01(público), 02(privado) |
| Cat 20 | `MOTIVO_TRASLADO` | 01-04, 06-09, 11, 13-14, 17-19 |
| Cat 22 | `REGIMEN_PERCEPCION` | 01(2%), 02(1%), 03(0.5%) |
| Cat 23 | `REGIMEN_RETENCION` | 01(3%), 02(6%) |
| Cat 52 | `LEYENDA` | 1000, 1002, 2000-2001, 2006-2007, 2010 |
| Cat 54 | `CODIGO_DETRACCION` | 42 códigos incluyendo 044-046 (Res. 000086-2025) |
| Cat 59 | `MEDIO_PAGO` | 001-108, 999 (22 códigos) |
| Cat 62 | `CODIGO_PRODUCTO_SUNAT_CATEGORIES` | 56 categorías UNSPSC |

### Detracciones (SPOT)
- `DETRACCION_RATES`: Record<string, number> con 42 tasas por código Cat 54
- Umbrales: S/700 general (`DETRACCION_THRESHOLD`), S/400 transporte (`DETRACCION_THRESHOLD_TRANSPORT`)
- Códigos minería 2025: 044 (oro/concentrados, 10%), 045 (no auríferos, 10%), 046 (beneficio minerales, 12%)

### Multi-tenancy
- Todo request resuelve `companyId` (JWT o API Key)
- CLS → Prisma extension → `SET tenancy.tenant_id` → RLS
- `@SkipTenant()` para rutas sin contexto de empresa
- 26 tests de aislamiento RLS en `prisma/tenant-isolation.spec.ts`

### Seguridad
- Certificados PFX y claves SOL cifrados con AES-256-GCM (IV: 96-bit, auth tag: 128-bit)
- `ENCRYPTION_KEY`: 64 hex chars, validado al startup
- Passwords: scrypt (64-byte derived key) + timingSafeEqual con length check
- Guards (orden de ejecución): TenantThrottlerGuard → JwtAuthGuard → ApiKeyGuard → TenantGuard → RolesGuard
- Rate limiting: 3 req/s, 20 req/10s, 100 req/min
- HMAC-SHA256 para webhooks y billing webhooks
- API Keys: prefijo `fpe_`, hash HMAC-SHA256

### Decoradores Disponibles
| Decorador | Propósito |
|-----------|-----------|
| `@Public()` | Bypass JwtAuthGuard |
| `@SkipTenant()` | Bypass TenantGuard |
| `@ApiKeyAuth()` | Marca ruta como API-key auth |
| `@CurrentUser()` | Inyecta `RequestUser` del JWT |
| `@Tenant()` | Inyecta `companyId` del CLS |
| `@Roles(...roles)` | Requiere roles (owner/admin/member) |

### Colas BullMQ (7 queues)
| Cola | Concurrency | Reintentos | Propósito |
|------|------------|------------|-----------|
| `invoice-send` | 5 | 5 (exp backoff 2s) | Build XML → Sign → ZIP → sendBill SOAP → CDR → webhook+PDF+email |
| `pdf-generate` | 5 | 3 | Invoice → PDF (A4/ticket) → R2 upload → update pdfUrl |
| `email-send` | 5 | 3 | Email transaccional via Resend con attachments |
| `summary-send` | 5 | 5 (exp backoff 2s) | ZIP XML → sendSummary SOAP → ticket |
| `ticket-poll` | 3 | 20 (30s fixed) | getStatus (RC/RA SOAP) o getGuideStatus (GRE REST) |
| `webhook-send` | 3 | 3 (exp backoff 5s) | POST JSON + HMAC-SHA256, timeout 10s |
| `dead-letter-queue` | N/A | 0 | Captura jobs permanentemente fallidos de todas las colas |

### Post-send Pipeline
Después de `invoice-send` exitoso:
1. Webhook notification (`invoice.accepted` / `invoice.observed` / `invoice.rejected`)
2. Queue `pdf-generate`
3. Si `clienteEmail` + status ACCEPTED/OBSERVED → queue `email-send` con XML adjunto

### Convenciones de Código
- snake_case en BD, camelCase en TS
- Endpoints bajo `/api/v1/`
- Respuestas: `{ success: boolean, data?: T, error?: { code, message } }`
- Paginación: `{ success, data, meta: { total, page, limit, totalPages } }`
- `XmlNode = ReturnType<typeof create>` — NO usar `any` en builders
- `formaPago: 'Contado' | 'Credito'` — type-safe
- `includesValue()` helper en xml-validator para checks type-safe en objetos `as const`
- Tax calculator usa `safeRound()` (notación exponencial) para evitar errores IEEE 754

### Filters Globales
| Filter | Propósito |
|--------|-----------|
| `PrismaExceptionFilter` | Errores Prisma → HTTP estructurado |
| `HttpExceptionFilter` | HttpException → `{ success: false, error }` |
| `SentryExceptionFilter` | Catch-all para Sentry reporting |

### Interceptors Globales
| Interceptor | Propósito |
|-------------|-----------|
| `LoggingInterceptor` | Log request/response con correlation ID |
| `TimeoutInterceptor` | Timeout enforcement por request |

### Middleware
| Middleware | Propósito |
|------------|-----------|
| `CorrelationIdMiddleware` | `X-Correlation-ID` en cada request |
| `TenantMiddleware` | Resolución de tenant context |

### Pipes
| Pipe | Propósito |
|------|-----------|
| `ParseDocTypePipe` | Valida/normaliza tipo documento SUNAT |
| `ParseRucPipe` | Valida formato RUC |

### Build
- Si build falla por tsbuildinfo stale: `rm -f tsconfig.tsbuildinfo && npx tsc --build`
- Graceful shutdown: 30s hard timeout para BullMQ drain

## Utilidades (src/common/utils/)

| Archivo | Propósito | Exports Clave |
|---------|-----------|---------------|
| `tax-calculator.ts` | Motor de cálculo fiscal SUNAT | `calculateItemTaxes()`, `calculateInvoiceTotals()`, `round2()`, `round4()`, `isGravado()`, `isExonerado()`, `isInafecto()`, `isExportacion()`, `isIvap()`, `isGratuita()`, `getDetraccionRate()`, `calculateDetraccionAmount()` |
| `encryption.ts` | AES-256-GCM | `encrypt()`, `decrypt()`, `encryptBuffer()`, `decryptBuffer()` |
| `zip.ts` | ZIP SUNAT | `createZipFromXml()`, `extractXmlFromZip()`, `buildSunatFileName()` (valida ERR-0151) |
| `peru-date.ts` | Timezone UTC-5 (America/Lima) | `peruNow()`, `peruToday()`, `daysBetweenInPeru()`, `isWithinMaxDays()` |
| `amount-to-words.ts` | Monto en letras (español) | `amountToWords(amount, currency)` — requerido Leyenda 1000 |
| `ruc-validator.ts` | Validación RUC/DNI | `isValidRuc()` (módulo 11), `isValidDni()`, `getRucType()` |

## Testing

### Cobertura actual: ~709 tests, 33 spec files, 4 e2e
```
vitest config thresholds:
  lines: 60%, functions: 60%, branches: 50%, statements: 60%
```

### Tests por Área
| Área | Tests | Archivos |
|------|-------|----------|
| XML Builders | ~199 | 6 spec files (invoice, NC/ND, retention/perception, guide, summary, beta integration) |
| XML Validator | ~144 | 5 spec files (core, complete, deep, new-docs, retention-perception) |
| Tax Calculator | ~70 | 7 spec files (main, MYPE, IVAP, ISC, detracciones, exportación, gratuitas) |
| Auth | ~26 | auth.service.spec.ts (register, login, refresh, logout, API keys) |
| Companies | ~16 | companies.service.spec.ts (CRUD, SOL credentials, cache) |
| Billing | ~23 | billing.service.spec.ts (plans, subscriptions, quotas, webhooks) |
| Tenant Isolation | ~26 | tenant-isolation.spec.ts (RLS, cross-tenant, non-tenant models) |
| SUNAT Client | ~25 | sunat-client.spec.ts (SOAP send, getStatus, error handling) |
| Queue Processors | ~22 | invoice-send.spec.ts (pipeline completo) |
| Utilidades | ~99 | encryption, zip, peru-date, amount-to-words, ruc-validator |
| Other | ~27 | CDR processor, XML signer, PDF generator, invoices service |

### E2E Tests (test/)
- `auth.e2e-spec.ts` — Register, login, refresh flow (5 tests)
- `health.e2e-spec.ts` — Health endpoint (1 test)
- `consultations.e2e-spec.ts` — RUC/DNI lookups (5 tests)
- `invoices.e2e-spec.ts` — Invoice creation flow (21 tests)

## CI/CD Pipeline

4 jobs secuenciales en `.github/workflows/ci.yml`:

| Job | Trigger | Servicios | Descripción |
|-----|---------|-----------|-------------|
| `lint-and-typecheck` | push/PR | — | pnpm install → db:generate → ESLint → `tsc --noEmit` |
| `test` | needs #1 | Postgres 16 + Redis 7 | Migrations → unit tests → E2E tests → coverage report |
| `build` | needs #2 | — | `pnpm build` → upload dist/ artifact |
| `docker` | needs #3, main only | — | Build & push to GHCR (docker/build-push-action@v6) |

## Comandos Frecuentes

```bash
# Desarrollo
pnpm dev                  # NestJS watch mode
pnpm db:migrate           # Prisma migrate dev
pnpm db:migrate:prod      # Prisma migrate deploy
pnpm db:seed              # Seed planes
pnpm db:generate          # Regenerar Prisma Client
pnpm db:studio            # Prisma Studio

# Testing
pnpm test                 # Vitest (~709 tests)
pnpm test:e2e             # E2E tests (4 specs, 32 tests)
pnpm test:cov             # Coverage con thresholds

# Build & Deploy
pnpm build                # nest build
pnpm lint                 # ESLint
pnpm format               # Prettier
pnpm start:prod           # Producción
```

## Interfaces Clave

### XML Builder Interfaces (`xml-builder/interfaces/xml-builder.interfaces.ts`)
| Interface | Uso |
|-----------|-----|
| `XmlCompany` | Emisor (ruc, razonSocial, dirección, ubigeo) |
| `XmlClient` | Receptor (tipoDocIdentidad, numDocIdentidad, nombre) |
| `XmlInvoiceItem` | Línea con valores calculados (valorUnitario, precioUnitario, igv, isc, icbper) |
| `XmlPaymentTerms` | `formaPago: 'Contado' \| 'Credito'`, cuotas[] |
| `XmlDetraccion` | Código Cat 54, porcentaje, monto, cuentaBN |
| `XmlAnticipo` | Anticipo aplicado (tipoDoc, serie, correlativo, monto) |
| `XmlInvoiceData` | Factura/Boleta (01/03) — incluye opIvap, igvIvap, opExportacion, detraccion |
| `XmlCreditNoteData` | NC (07) con docRef, motivoNota (Cat 09) |
| `XmlDebitNoteData` | ND (08) con docRef, motivoNota (Cat 10) |
| `XmlSummaryData/Line` | RC — estado '1'(add)/'2'(modify)/'3'(void), incluye opExportacion |
| `XmlVoidedData/Line` | RA — motivo de baja |
| `XmlRetentionData/Line` | CRE (20) — régimen Cat 23, tipoCambio |
| `XmlPerceptionData/Line` | CPE (40) — régimen Cat 22, tipoCambio |
| `XmlGuideData/Item/Address` | GRE (09) — multi-conductor, indicadorM1L, autorizacionEspecial |

### Respuestas Estándar (`common/interfaces/index.ts`)
- `ApiResponse<T>` — `{ success, data?, error? }`
- `PaginatedResponse<T>` — `{ success, data, meta: { total, page, limit, totalPages } }`
- `JwtPayload` — sub, email, companyId, role, jti
- `RequestUser` — userId, email, companyId, role

## Correcciones SUNAT 2025-2026 Aplicadas

| Fix | Detalle |
|-----|---------|
| ERR-0151 | RUC en nombre ZIP debe empezar con 1 o 2 |
| Ley 31556 | IGV MYPE = 10% (8% IGV + 2% IPM), NO 10.5% |
| Cat 10 | MOTIVO_NOTA_DEBITO.OTROS = '10' (no '11') |
| Cat 54 | Códigos minería 044, 045, 046 (Res. 000086-2025, 000121-2025) |
| Cat 20 | Motivo 19: Traslado Mercancía Extranjera (Res. 000133-2025) |
| Perception | SUNATNetTotalCashed = importeCobrado - importePercibido |
| Guide | autorizacionEspecial usa cbc:SpecialInstructions (no cac:) |
| Summary | BillingPayment code '04' + TaxSubtotal para exportación |

## Documentación Detallada

| Tema | Archivo | Contenido |
|------|---------|-----------|
| Arquitectura | [`docs/claude/architecture.md`](docs/claude/architecture.md) | Estructura de módulos, flujo de emisión, constantes SUNAT, colas BullMQ |
| API | [`docs/claude/api-spec.md`](docs/claude/api-spec.md) | Stack tecnológico completo, 52+ endpoints con decoradores |
| Base de datos | [`docs/claude/database.md`](docs/claude/database.md) | Schema Prisma completo, migraciones, seed data |
| Deployment | [`docs/claude/deployment.md`](docs/claude/deployment.md) | Variables de entorno, Docker Compose, Dockerfile |
| Convenciones | [`docs/claude/conventions.md`](docs/claude/conventions.md) | Reglas de desarrollo, seguridad, notas técnicas, archivos de test |

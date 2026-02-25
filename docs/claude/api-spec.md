# API Specification — FacturaPE Backend

## Stack Tecnológico (versiones exactas Feb 2026)

- **Runtime:** Node.js 22 LTS (`"engines": { "node": ">=22.0.0" }`)
- **Framework:** NestJS 11.1 + Fastify 5.7 (`@nestjs/platform-fastify`)
- **ORM:** Prisma 7.4 con `@prisma/adapter-pg` (driver adapter obligatorio)
- **BD:** PostgreSQL 16 con Row-Level Security (RLS) + InvoiceStatus enum
- **Colas:** BullMQ 5.66 + Redis 7 (`@nestjs/bullmq` 11.x)
- **XML:** xmlbuilder2 4.x (generación UBL 2.1) + fast-xml-parser 5.x (parseo CDR)
- **Firma:** xml-crypto 6.x (XMLDSig SHA-256) + node-forge 1.3 (PFX→PEM)
- **SOAP:** soap 1.1 (node-soap) con WS-Security + WSDLs locales (`src/modules/sunat-client/wsdl/`)
- **REST (GRE):** axios 1.13 (OAuth2 + REST API para Guía de Remisión)
- **PDF:** pdfmake 0.3 (facturas A4 + tickets 80mm, tasa IGV dinámica) + qrcode 1.5
- **Pagos:** mercadopago 2.12 (suscripciones PreApproval)
- **Email:** resend 6.9
- **Auth:** @nestjs/jwt 11 + @nestjs/passport 11 + passport-jwt 4 + passport 0.7
- **Validación:** class-validator 0.14 + class-transformer 0.5
- **Rate Limit:** @nestjs/throttler 6.5 (3 tiers: short 1s/3req, medium 10s/20req, long 60s/100req)
- **Multi-tenancy:** nestjs-cls 4.5 (AsyncLocalStorage) + PG RLS
- **Compresión:** archiver 7.x (ZIP para SUNAT) + adm-zip 0.5 (leer CDR)
- **Cifrado:** crypto nativo Node.js (AES-256-GCM para certificados y SOL)
- **Docs:** @nestjs/swagger 11 + @fastify/swagger 9 (en `/docs`, no-prod, respuestas globales 401/403/429)
- **Monitoring:** @sentry/node 10.x + @nestjs/terminus 11.x (health checks)
- **Uploads:** @fastify/multipart 9.x (5MB limit), @fastify/static 8.x
- **Security:** @fastify/helmet 12.x (CSP environment-aware)
- **Storage:** @aws-sdk/client-s3 3.x (preparado para almacenamiento S3)
- **Testing:** vitest 3.x + supertest 7.x (~709 tests, 33 spec files + 4 e2e files)
- **Build tooling:** TypeScript 5.7, SWC (e2e via unplugin-swc), tsx (seed)
- **Package Manager:** pnpm 9+ (`"pnpm": ">=9.0.0"`)
- **Otros:** dotenv 17.x, reflect-metadata 0.2, rxjs 7.8

## Endpoints API v1

```
# Auth (7 endpoints)
POST   /api/v1/auth/register            (@Public)
POST   /api/v1/auth/login               (@Public)
POST   /api/v1/auth/refresh             (@Public)
POST   /api/v1/auth/logout
PATCH  /api/v1/auth/password
POST   /api/v1/auth/api-keys            (@Roles owner/admin)
DELETE /api/v1/auth/api-keys/:id         (@Roles owner/admin)

# Users (3 endpoints)
GET    /api/v1/users/me
PUT    /api/v1/users/me
GET    /api/v1/users/me/companies

# Companies (8 endpoints)
POST   /api/v1/companies                 (@SkipTenant)
GET    /api/v1/companies                 (@SkipTenant)
GET    /api/v1/companies/:id             (@SkipTenant)
PUT    /api/v1/companies/:id             (@Roles owner/admin)
PUT    /api/v1/companies/:id/sol-credentials  (@Roles owner/admin)
GET    /api/v1/companies/:id/migration-status
POST   /api/v1/companies/:id/migrate-to-production  (@Roles owner/admin)
POST   /api/v1/companies/:id/revert-to-beta         (@Roles owner/admin)

# Certificates (2 endpoints)
POST   /api/v1/companies/:companyId/certificate   (multipart upload, 5MB max)
GET    /api/v1/companies/:companyId/certificate

# Comprobantes electrónicos — 18 endpoints (9 tipos + batch + CRUD)
POST   /api/v1/invoices/factura            (01 — Factura)
POST   /api/v1/invoices/boleta             (03 — Boleta de Venta)
POST   /api/v1/invoices/nota-credito       (07 — Nota de Crédito)
POST   /api/v1/invoices/nota-debito        (08 — Nota de Débito)
POST   /api/v1/invoices/resumen-diario     (RC — Resumen Diario)
POST   /api/v1/invoices/comunicacion-baja  (RA — Comunicación de Baja)
POST   /api/v1/invoices/retencion          (20 — Comprobante de Retención)
POST   /api/v1/invoices/percepcion         (40 — Comprobante de Percepción)
POST   /api/v1/invoices/guia-remision      (09 — Guía de Remisión)
POST   /api/v1/invoices/batch              (Envío masivo, máx 50, con deduplicación)
GET    /api/v1/invoices                    (listar con filtros: tipoDoc, status, desde, hasta, clienteNumDoc, page, limit)
GET    /api/v1/invoices/:id
GET    /api/v1/invoices/:id/xml
GET    /api/v1/invoices/:id/pdf            (?format=a4|ticket)
GET    /api/v1/invoices/:id/cdr
POST   /api/v1/invoices/:id/resend
GET    /api/v1/invoices/:id/consult-cdr    (consulta CDR en SUNAT, solo producción)
POST   /api/v1/invoices/:id/anular-guia   (anulación GRE via REST API)

# Consultas gratuitas (4 endpoints)
GET    /api/v1/consultas/ruc/:ruc          (@Public)
GET    /api/v1/consultas/dni/:dni          (@Public)
GET    /api/v1/consultas/tipo-cambio       (@Public)
GET    /api/v1/consultas/validar-cpe       (@Public)

# Webhooks (3 endpoints)
POST   /api/v1/webhooks
GET    /api/v1/webhooks
DELETE /api/v1/webhooks/:id

# Billing (4 endpoints)
GET    /api/v1/billing/plans               (@Public)
GET    /api/v1/billing/subscriptions/current
POST   /api/v1/billing/subscriptions
POST   /api/v1/billing/webhook             (@Public, Mercado Pago IPN)

# Dashboard (2 endpoints)
GET    /api/v1/dashboard/summary           (?from, ?to — resumen por estado y tipo)
GET    /api/v1/dashboard/monthly-report    (?year, ?month — reporte PDT 621)

# Health (1 endpoint)
GET    /api/v1/health                      (@Public — DB, Redis, memory heap 256MB, disk 90%)
```

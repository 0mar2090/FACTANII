<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/NestJS-11.1-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma-7.4-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Tests-709-brightgreen?logo=vitest&logoColor=white" alt="Tests" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-Proprietary-blue" alt="License" />
</p>

<h1 align="center">FacturaPE</h1>

<p align="center">
  Backend SaaS de facturaci&oacute;n electr&oacute;nica con conexi&oacute;n <strong>directa</strong> a SUNAT Per&uacute;
  <br />
  <em>SEE-Del Contribuyente &middot; Sin intermediarios PSE/OSE</em>
  <br /><br />
  <strong>52 endpoints</strong> &middot; <strong>9 tipos de CPE</strong> &middot; <strong>4 protocolos SUNAT</strong> &middot; <strong>7 colas BullMQ</strong> &middot; <strong>Multi-tenant RLS</strong>
</p>

---

## Tabla de Contenidos

- [Descripcion General](#descripcion-general)
- [Stack Tecnologico](#stack-tecnologico)
- [Arquitectura](#arquitectura)
- [Primeros Pasos](#primeros-pasos)
- [Variables de Entorno](#variables-de-entorno)
- [Scripts Disponibles](#scripts-disponibles)
- [API Endpoints](#api-endpoints)
- [Flujo de Facturacion](#flujo-de-facturacion)
- [Colas de Procesamiento](#colas-de-procesamiento)
- [Impuestos Soportados](#impuestos-soportados)
- [Seguridad](#seguridad)
- [Testing](#testing)
- [Docker](#docker)
- [CI/CD](#cicd)
- [Planes de Suscripcion](#planes-de-suscripcion)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Licencia](#licencia)

---

## Descripcion General

**FacturaPE** es una plataforma backend multi-tenant para emitir comprobantes de pago electronicos (CPE) validados por SUNAT Peru. El sistema se conecta directamente a los web services de SUNAT sin depender de proveedores PSE u OSE, otorgando control total sobre el flujo de facturacion.

### Documentos soportados

| Codigo | Documento                    | Protocolo          | Endpoint SUNAT     |
|--------|------------------------------|--------------------|--------------------|
| `01`   | Factura Electronica          | SOAP `sendBill`    | Invoice            |
| `03`   | Boleta de Venta              | SOAP `sendBill`    | Invoice            |
| `07`   | Nota de Credito              | SOAP `sendBill`    | Invoice            |
| `08`   | Nota de Debito               | SOAP `sendBill`    | Invoice            |
| `09`   | Guia de Remision (GRE)       | REST API OAuth2    | GRE API            |
| `20`   | Comprobante de Retencion     | SOAP `sendBill`    | Retention          |
| `40`   | Comprobante de Percepcion    | SOAP `sendBill`    | Retention          |
| `RC`   | Resumen Diario               | SOAP `sendSummary` | Invoice            |
| `RA`   | Comunicacion de Baja         | SOAP `sendSummary` | Invoice            |

### Ciclo de vida del comprobante (InvoiceStatus)

```
DRAFT → PENDING → QUEUED → SENDING → ACCEPTED / REJECTED / OBSERVED
```

| Estado     | Descripcion                                                |
|------------|------------------------------------------------------------|
| `DRAFT`    | Creado, aun no enviado                                     |
| `PENDING`  | Listo para envio                                           |
| `QUEUED`   | Encolado en BullMQ                                         |
| `SENDING`  | En proceso de envio a SUNAT                                |
| `ACCEPTED` | Aceptado por SUNAT (codigo 0)                              |
| `REJECTED` | Rechazado por SUNAT (error de validacion)                  |
| `OBSERVED` | Aceptado con observaciones (codigo 0 + notas informativas) |

### Capacidades principales

**Emision y procesamiento**
- Generacion de XML UBL 2.1 con todos los namespaces requeridos por SUNAT
- Firma digital XMLDSig con SHA-256 + RSA (certificados .pfx)
- Envio SOAP sincrono (`sendBill`) y asincrono (`sendSummary` + polling `getStatus`)
- Envio REST API con OAuth2 para Guia de Remision Electronica (GRE)
- Procesamiento automatico de CDR (Constancia de Recepcion)
- Generacion de PDF en formatos A4 y ticket 80mm con tasa IGV dinamica
- Emision masiva (batch) de hasta 50 comprobantes con deduplicacion
- Validacion pre-envio contra reglas SUNAT por tipo de documento

**Impuestos y regimen fiscal**
- Soporte completo: IGV 18%, IVAP 4% (Arroz Pilado), ISC, ICBPER S/0.50
- IGV reducido 10% para MYPEs restaurantes/hoteles (Ley 31556)
- Detracciones SPOT: 42 codigos Cat 54, umbrales S/700 y S/400
- Retenciones (3%/6%) y percepciones (0.5%/1%/2%)
- Operaciones gratuitas, exoneradas, inafectas y de exportacion

**Infraestructura**
- Sistema de 7 colas con reintentos y backoff exponencial (BullMQ)
- Dead Letter Queue (DLQ) para jobs fallidos con review manual
- Multi-tenancy con Row-Level Security en PostgreSQL
- Emails transaccionales con adjuntos XML/PDF (Resend)
- Webhooks salientes con HMAC-SHA256 para notificaciones en tiempo real
- Almacenamiento de PDFs en Cloudflare R2 (S3-compatible)

**Negocio y operaciones**
- Suscripciones y planes con Mercado Pago (PreApproval)
- Dashboard con resumen de emision y reporte mensual PDT 621
- Migracion beta a produccion con validacion de requisitos
- Consultas gratuitas: RUC, DNI, tipo de cambio, validar CPE
- Swagger/OpenAPI con respuestas globales 401/403/429
- Health checks: base de datos, Redis, memoria heap (256MB), disco (90%)
- Correlation ID (`X-Request-ID`) en todas las respuestas

---

## Stack Tecnologico

| Capa             | Tecnologia                                       |
|------------------|--------------------------------------------------|
| Runtime          | Node.js 22 LTS                                   |
| Framework        | NestJS 11.1 + Fastify 5.7                        |
| ORM              | Prisma 7.4 (driver adapter `@prisma/adapter-pg`) |
| Base de datos    | PostgreSQL 16 + Row-Level Security               |
| Colas            | BullMQ 5.66 + Redis 7 (ioredis 5.6)              |
| XML              | xmlbuilder2 4 (UBL 2.1) + fast-xml-parser 5 (CDR)|
| Firma digital    | xml-crypto 6 (XMLDSig) + node-forge 1.3 (PFX)    |
| SOAP             | node-soap 1.1 (WS-Security) + WSDLs locales      |
| REST (GRE)       | axios 1.13 (OAuth2 + REST API SUNAT)              |
| PDF              | pdfmake 0.3 (A4 + ticket 80mm) + qrcode 1.5      |
| Storage          | Cloudflare R2 via @aws-sdk/client-s3 3.x          |
| Pagos            | mercadopago 2.12 (PreApproval)                    |
| Email            | Resend 6.9                                        |
| Auth             | JWT (access 15min + refresh 7d) + API Keys        |
| Validacion       | class-validator 0.14 + class-transformer 0.5      |
| Rate Limiting    | @nestjs/throttler 6.5 (3 tiers configurables)     |
| Multi-tenancy    | nestjs-cls 4.5 (AsyncLocalStorage) + PG RLS       |
| Compresion       | archiver 7 (ZIP SUNAT) + adm-zip 0.5 (CDR)       |
| Cifrado          | crypto nativo Node.js (AES-256-GCM)               |
| Uploads          | @fastify/multipart 9 (5MB limit)                  |
| Docs             | @nestjs/swagger 11 + @fastify/swagger 9           |
| Testing          | Vitest 3 + Supertest 7 (~709 tests, 37 archivos)  |
| Monitoreo        | Sentry 10 + Health Checks (@nestjs/terminus 11)    |
| Package Manager  | pnpm 9+                                           |

---

## Arquitectura

```
                                   FacturaPE Backend
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌────────────────┐  │
    │  │ REST API │──>│ Validacion│──>│ XML UBL  │──>│ Firma XMLDSig  │  │
    │  │ (Fastify)│   │ (class-v +│   │ 2.1      │   │ SHA-256 + RSA  │  │
    │  │ 52 endp. │   │ xml-valid)│   │ 8 build. │   │ (exc-c14n)     │  │
    │  └──────────┘   └───────────┘   └──────────┘   └───────┬────────┘  │
    │       │                                                  │           │
    │       │              ┌───────────────────────────────────┘           │
    │       │              ▼                                               │
    │       │   ┌──────────────────────────────────────────────┐          │
    │       │   │          SUNAT Web Services                  │          │
    │       │   │                                              │          │
    │       │   │  SOAP sendBill (Invoice) ─── 01,03,07,08    │          │
    │       │   │  SOAP sendBill (Retention) ── 20,40         │          │
    │       │   │  SOAP sendSummary ────── RC, RA → ticket    │          │
    │       │   │  REST OAuth2 + API ────── 09 (GRE) → ticket │          │
    │       │   │  SOAP getStatus ──────── poll tickets       │          │
    │       │   │  SOAP consultCdr ──────── consulta CDR      │          │
    │       │   │                                              │          │
    │       │   └──────────────────┬───────────────────────────┘          │
    │       │                      │ CDR                                  │
    │       │                      ▼                                      │
    │       │     ┌─────────┐    ┌──────────────────┐                    │
    │       │     │ BullMQ  │<───│ CDR Processor    │                    │
    │       │     │ 7 Colas │    │ (fast-xml-parser)│                    │
    │       │     └────┬────┘    └──────────────────┘                    │
    │       │          │                                                  │
    │       │     ┌────┴───────────────────────────────┐                 │
    │       │     │          │         │      │        │                 │
    │       │     ▼          ▼         ▼      ▼        ▼                 │
    │       │  ┌──────┐  ┌───────┐  ┌─────┐  ┌────┐  ┌─────┐           │
    │       │  │ PDF  │  │ Email │  │Poll │  │Hook│  │ DLQ │           │
    │       │  │ Gen  │  │ Send  │  │Tick.│  │Send│  │     │           │
    │       │  └──┬───┘  └───────┘  └─────┘  └────┘  └─────┘           │
    │       │     │                                                      │
    │       │     ▼                                                      │
    │       │  ┌──────────────────┐                                     │
    │       │  │ Cloudflare R2    │                                     │
    │       │  │ (PDF storage)    │                                     │
    │       │  └──────────────────┘                                     │
    │       │                                                             │
    │  ┌────┴────────────────────────────────────────────────────────┐    │
    │  │                  PostgreSQL 16 (RLS)                        │    │
    │  │  users─companies─invoices─certificates─webhooks─billing    │    │
    │  │  10 modelos + InvoiceStatus enum + 4 migraciones           │    │
    │  └────────────────────────────────────────────────────────────┘    │
    └──────────────────────────────────────────────────────────────────────┘
```

### Modulos (19 modulos en src/modules/)

**Autenticacion y tenancy:**
`AuthModule` · `UsersModule` · `CompaniesModule` · `CertificatesModule`

**Core XML y facturacion:**
`XmlBuilderModule` · `XmlSignerModule` · `SunatClientModule` · `CdrProcessorModule` · `InvoicesModule`

**Procesamiento asincrono y notificaciones:**
`QueuesModule` · `PdfGeneratorModule` · `NotificationsModule` · `WebhooksModule`

**Negocio:**
`ConsultationsModule` · `BillingModule` · `DashboardModule`

**Infraestructura (global):**
`PrismaModule` · `RedisModule` · `HealthModule`

---

## Primeros Pasos

### Requisitos previos

- **Node.js** >= 22.0.0
- **pnpm** >= 9.0.0
- **Docker** y **Docker Compose** (para PostgreSQL y Redis)

### Instalacion

```bash
# 1. Clonar el repositorio
git clone <repo-url> facturape-backend
cd facturape-backend

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Levantar servicios de infraestructura
docker compose up -d postgres redis

# 5. Generar Prisma Client
pnpm db:generate

# 6. Ejecutar migraciones
pnpm db:migrate

# 7. Seed de datos iniciales (planes de suscripcion)
pnpm db:seed

# 8. Iniciar en modo desarrollo
pnpm dev
```

### Verificar que funciona

```bash
# Health check (debe retornar status: "ok")
curl http://localhost:3000/api/v1/health

# Swagger UI (solo en desarrollo)
open http://localhost:3000/docs
```

### SUNAT Beta (pruebas)

El modo beta viene preconfigurado. Credenciales por defecto:

| Campo    | Valor          |
|----------|----------------|
| RUC      | `20000000001`  |
| Usuario  | `MODDATOS`     |
| Clave    | `moddatos`     |

---

## Variables de Entorno

### Requeridas

| Variable         | Descripcion                                    | Ejemplo                           |
|------------------|------------------------------------------------|-----------------------------------|
| `DATABASE_URL`   | Conexion PostgreSQL                            | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET`     | Secret para access tokens (min 32 chars)       | (generar aleatoriamente)          |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens                 | (generar aleatoriamente)          |
| `ENCRYPTION_KEY` | Clave AES-256-GCM (64 hex chars = 32 bytes)   | (ver comando abajo)              |

### Opcionales

| Variable                   | Descripcion                                    | Default                     |
|----------------------------|------------------------------------------------|-----------------------------|
| `NODE_ENV`                 | Entorno de ejecucion                           | `development`               |
| `PORT`                     | Puerto del servidor                            | `3000`                      |
| `API_PREFIX`               | Prefijo global de rutas                        | `api/v1`                    |
| `CORS_ORIGIN`              | Origenes CORS permitidos (separados por coma)  | `http://localhost:3001`     |
| `REDIS_HOST`               | Host de Redis                                  | `localhost`                 |
| `REDIS_PORT`               | Puerto de Redis                                | `6379`                      |
| `JWT_EXPIRATION`           | Expiracion del access token                    | `15m`                       |
| `JWT_REFRESH_EXPIRATION`   | Expiracion del refresh token                   | `7d`                        |
| `SUNAT_ENV`                | Entorno SUNAT: `beta` o `production`           | `beta`                      |
| `SUNAT_BETA_RUC`           | RUC de pruebas beta                            | `20000000001`               |
| `SUNAT_BETA_USER`          | Usuario SOL de pruebas beta                    | `MODDATOS`                  |
| `SUNAT_BETA_PASS`          | Clave SOL de pruebas beta                      | `moddatos`                  |
| `SUNAT_GRE_CLIENT_ID`      | Client ID OAuth2 para API GRE                  | (requerido para GRE)        |
| `SUNAT_GRE_CLIENT_SECRET`  | Client Secret OAuth2 para API GRE              | (requerido para GRE)        |
| `MP_ACCESS_TOKEN`          | Token de Mercado Pago                          | (opcional)                  |
| `MP_WEBHOOK_SECRET`        | Secret para webhook IPN de Mercado Pago        | (opcional)                  |
| `RESEND_API_KEY`           | API Key de Resend para emails                  | (opcional)                  |
| `EMAIL_FROM`               | Direccion de remitente                         | `facturas@facturape.com`    |
| `SENTRY_DSN`               | DSN de Sentry para error tracking              | (opcional)                  |
| `SENTRY_TRACES_SAMPLE_RATE`| Sample rate para traces de Sentry              | `0.1`                       |
| `RATE_LIMIT_SHORT_TTL`     | Ventana corta en ms                            | `1000`                      |
| `RATE_LIMIT_SHORT_LIMIT`   | Limite ventana corta                           | `3`                         |
| `RATE_LIMIT_MEDIUM_TTL`    | Ventana media en ms                            | `10000`                     |
| `RATE_LIMIT_MEDIUM_LIMIT`  | Limite ventana media                           | `20`                        |
| `RATE_LIMIT_LONG_TTL`      | Ventana larga en ms                            | `60000`                     |
| `RATE_LIMIT_LONG_LIMIT`    | Limite ventana larga                           | `100`                       |

**Generar `ENCRYPTION_KEY`:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Scripts Disponibles

```bash
# Desarrollo
pnpm dev                   # Servidor en watch mode (hot reload)
pnpm build                 # Compilar TypeScript a dist/ (nest build)
pnpm start                 # Ejecutar build compilado
pnpm start:prod            # Produccion con NODE_ENV=production

# Base de datos
pnpm db:generate           # Generar Prisma Client (output: src/generated/prisma/)
pnpm db:migrate            # Crear y aplicar migraciones (dev)
pnpm db:migrate:prod       # Aplicar migraciones (produccion, sin generar)
pnpm db:seed               # Seed de planes de suscripcion (tsx prisma/seed.ts)
pnpm db:studio             # Prisma Studio (UI visual para BD)
pnpm db:reset              # Reset completo de BD + migraciones

# Testing
pnpm test                  # Unit tests con Vitest (~709 tests, 33 spec files)
pnpm test:e2e              # Tests E2E (4 archivos, 32 tests, requiere BD activa)
pnpm test:cov              # Tests con reporte de cobertura (V8 provider)

# Calidad de codigo
pnpm lint                  # ESLint (src/)
pnpm format                # Prettier (src/)
```

---

## API Endpoints

Todos los endpoints estan bajo el prefijo `/api/v1/`. Autenticacion requerida salvo indicacion contraria. Swagger disponible en `/docs` (solo en desarrollo). Todas las operaciones incluyen respuestas globales **401** (Unauthorized), **403** (Forbidden) y **429** (Too Many Requests).

### Autenticacion (7 endpoints)

| Metodo | Ruta                          | Descripcion                     | Auth     |
|--------|-------------------------------|---------------------------------|----------|
| POST   | `/auth/register`              | Registro de usuario             | Publica  |
| POST   | `/auth/login`                 | Login (retorna JWT + refresh)   | Publica  |
| POST   | `/auth/refresh`               | Renovar access token            | Publica  |
| POST   | `/auth/logout`                | Cerrar sesion (revocar token)   | JWT      |
| PATCH  | `/auth/password`              | Cambiar contrasena              | JWT      |
| POST   | `/auth/api-keys`              | Crear API Key                   | Roles    |
| DELETE | `/auth/api-keys/:id`          | Revocar API Key                 | Roles    |

### Usuarios (3 endpoints)

| Metodo | Ruta                          | Descripcion                     |
|--------|-------------------------------|---------------------------------|
| GET    | `/users/me`                   | Perfil del usuario autenticado  |
| PUT    | `/users/me`                   | Actualizar perfil               |
| GET    | `/users/me/companies`         | Empresas del usuario            |

### Empresas y Certificados (10 endpoints)

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/companies`                            | Listar empresas del usuario     |
| POST   | `/companies`                            | Registrar empresa               |
| GET    | `/companies/:id`                        | Detalle de empresa              |
| PUT    | `/companies/:id`                        | Actualizar empresa              |
| PUT    | `/companies/:id/sol-credentials`        | Configurar clave SOL            |
| GET    | `/companies/:id/migration-status`       | Verificar requisitos migracion  |
| POST   | `/companies/:id/migrate-to-production`  | Migrar de beta a produccion     |
| POST   | `/companies/:id/revert-to-beta`         | Revertir a modo beta            |
| POST   | `/companies/:id/certificate`            | Subir certificado .pfx (5MB max)|
| GET    | `/companies/:id/certificate`            | Info del certificado activo     |

### Comprobantes Electronicos (18 endpoints)

**Emision (9 tipos + batch):**

| Metodo | Ruta                                    | Descripcion                        |
|--------|-----------------------------------------|------------------------------------|
| POST   | `/invoices/factura`                     | Emitir Factura (01)                |
| POST   | `/invoices/boleta`                      | Emitir Boleta (03)                 |
| POST   | `/invoices/nota-credito`                | Emitir Nota de Credito (07)        |
| POST   | `/invoices/nota-debito`                 | Emitir Nota de Debito (08)         |
| POST   | `/invoices/guia-remision`               | Emitir Guia de Remision (09)       |
| POST   | `/invoices/retencion`                   | Emitir Comp. de Retencion (20)     |
| POST   | `/invoices/percepcion`                  | Emitir Comp. de Percepcion (40)    |
| POST   | `/invoices/resumen-diario`              | Enviar Resumen Diario (RC)         |
| POST   | `/invoices/comunicacion-baja`           | Enviar Comunicacion de Baja (RA)   |
| POST   | `/invoices/batch`                       | Emision masiva (max 50, con dedup) |

**Consultas y descargas:**

| Metodo | Ruta                                    | Descripcion                        |
|--------|-----------------------------------------|------------------------------------|
| GET    | `/invoices`                             | Listar con filtros y paginacion    |
| GET    | `/invoices/:id`                         | Detalle de comprobante             |
| GET    | `/invoices/:id/xml`                     | Descargar XML firmado              |
| GET    | `/invoices/:id/pdf`                     | Descargar PDF (?format=a4\|ticket) |
| GET    | `/invoices/:id/cdr`                     | Descargar CDR (ZIP)                |
| POST   | `/invoices/:id/resend`                  | Reenviar a SUNAT                   |
| GET    | `/invoices/:id/consult-cdr`             | Consultar CDR en SUNAT (solo prod) |
| POST   | `/invoices/:id/anular-guia`             | Anular Guia de Remision via GRE    |

### Consultas Gratuitas (4 endpoints)

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/consultas/ruc/:ruc`                   | Consultar RUC (SUNAT)           |
| GET    | `/consultas/dni/:dni`                   | Consultar DNI (RENIEC)          |
| GET    | `/consultas/tipo-cambio`                | Tipo de cambio del dia          |
| GET    | `/consultas/validar-cpe`                | Validar CPE en SUNAT            |

> Todos los endpoints de consultas son publicos (`@Public()`).

### Webhooks (3 endpoints)

| Metodo | Ruta                | Descripcion                     |
|--------|---------------------|---------------------------------|
| POST   | `/webhooks`         | Registrar webhook               |
| GET    | `/webhooks`         | Listar webhooks activos         |
| DELETE | `/webhooks/:id`     | Desactivar webhook              |

### Billing y Suscripciones (4 endpoints)

| Metodo | Ruta                              | Descripcion                     | Auth     |
|--------|-----------------------------------|---------------------------------|----------|
| GET    | `/billing/plans`                  | Listar planes disponibles       | Publica  |
| GET    | `/billing/subscriptions/current`  | Suscripcion activa              | JWT      |
| POST   | `/billing/subscriptions`          | Crear suscripcion               | JWT      |
| POST   | `/billing/webhook`                | IPN Mercado Pago                | Publica  |

### Dashboard (2 endpoints)

| Metodo | Ruta                         | Descripcion                                    |
|--------|------------------------------|------------------------------------------------|
| GET    | `/dashboard/summary`         | Resumen emision por estado y tipo (?from, ?to) |
| GET    | `/dashboard/monthly-report`  | Reporte mensual PDT 621 (?year, ?month)        |

### Health Check (1 endpoint)

| Metodo | Ruta       | Descripcion                                     | Auth    |
|--------|------------|-------------------------------------------------|---------|
| GET    | `/health`  | DB, Redis, memoria (256MB), disco (90%)          | Publica |

---

## Flujo de Facturacion

FacturaPE soporta 4 protocolos de emision segun el tipo de documento:

### Protocolo 1: SOAP sincrono — Endpoint Invoice (01, 03, 07, 08)

```
  POST /invoices/{tipo}
         │
         ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐
  │  Validar DTO │────>│ Calcular     │────>│ Asignar Serie/Correl.  │
  │  (class-v +  │     │ totales/     │     │  (atomico por empresa) │
  │  xml-validator)    │ impuestos    │     └───────────┬─────────────┘
  └─────────────┘     └──────────────┘                  │
                                                        ▼
  ┌──────────────────┐     ┌───────────────┐     ┌────────────┐
  │ Enviar SOAP      │<────│ Crear ZIP     │<────│ Firmar XML │
  │ sendBill(invoice)│     │ {RUC}-{T}-... │     │ SHA-256+RSA│
  └────────┬─────────┘     └───────────────┘     └────────────┘
           │
           ▼
  ┌──────────────────┐
  │ Procesar CDR     │────> ACCEPTED / OBSERVED / REJECTED
  └────────┬─────────┘
           │
     ┌─────┴──────────────────────┐
     ▼             ▼              ▼
  ┌───────┐   ┌─────────┐   ┌──────────┐
  │  PDF  │   │  Email  │   │ Webhooks │
  │  Gen  │   │ c/ XML  │   │ Dispatch │
  └───────┘   └─────────┘   └──────────┘
```

### Protocolo 2: SOAP sincrono — Endpoint Retention (20, 40)

```
  POST /invoices/retencion  o  /percepcion
         │
         ▼
  Validar DTO → Build XML → Firmar → ZIP → sendBill(retention) → CDR
         │
         ▼
  Post-send pipeline (PDF + Email + Webhooks)
```

### Protocolo 3: SOAP asincrono — sendSummary (RC, RA)

```
  POST /invoices/resumen-diario  o  /comunicacion-baja
         │
         ▼
  Validar DTO → Build XML → Firmar → ZIP → sendSummary (SOAP)
         │
         ▼
  Recibir ticket → Encolar ticket-poll (backoff 10s..5min, 20 reintentos)
         │
         ▼
  getStatus(ticket) → CDR → ACCEPTED / REJECTED
```

### Protocolo 4: REST API OAuth2 — GRE (09)

```
  POST /invoices/guia-remision
         │
         ▼
  Validar DTO → Build XML (DespatchAdvice UBL 2.1) → Firmar → ZIP
         │
         ▼
  OAuth2 Token (client credentials) → POST REST API SUNAT
         │
         ▼
  Recibir ticket → Encolar ticket-poll → getGuideStatus → CDR
```

### Respuesta de ejemplo

```json
{
  "success": true,
  "data": {
    "id": "cm7abc123def",
    "tipoDoc": "01",
    "serie": "F001",
    "correlativo": 1,
    "fechaEmision": "2026-02-22",
    "clienteNombre": "EMPRESA CLIENTE SAC",
    "clienteNumDoc": "20123456789",
    "moneda": "PEN",
    "totalVenta": 826.00,
    "status": "ACCEPTED",
    "sunatCode": "0",
    "sunatMessage": "La Factura numero F001-00000001, ha sido aceptada",
    "xmlHash": "a1b2c3d4e5f6...",
    "pdfUrl": "https://r2.example.com/pdfs/20123456789/F001-1.pdf",
    "createdAt": "2026-02-22T15:30:00.000Z"
  }
}
```

---

## Colas de Procesamiento

El sistema utiliza BullMQ con Redis para procesamiento asincrono. 7 colas con configuracion independiente de reintentos y concurrencia.

| Cola               | Funcion                         | Reintentos | Backoff          | Conc. | Rate Limit |
|--------------------|--------------------------------|------------|------------------|-------|------------|
| `invoice-send`     | Envio a SUNAT via SOAP          | 5          | 2s exponencial   | 5     | 10 jobs/s  |
| `summary-send`     | RC/RA via sendSummary           | 5          | 2s exponencial   | 5     | 10 jobs/s  |
| `ticket-poll`      | Polling getStatus para tickets  | 20         | 10s exp (max 5m) | 3     | -          |
| `pdf-generate`     | Generacion PDF (A4/ticket)      | 3          | 3s exponencial   | 5     | -          |
| `email-send`       | Envio emails con adjuntos       | 3          | 1s exponencial   | 5     | -          |
| `webhook-send`     | Notificaciones HMAC-signed      | 3          | 5s exponencial   | 3     | -          |
| `dead-letter-queue`| Jobs fallidos permanentemente   | -          | -                | -     | -          |

### Pipeline post-envio

Tras recibir respuesta de SUNAT, el procesador dispara automaticamente:

1. **Webhook** — Notifica a los endpoints registrados (`invoice.accepted`, `invoice.rejected`, `invoice.observed`)
2. **PDF** — Genera el PDF A4, lo sube a Cloudflare R2 y actualiza `pdfUrl`
3. **Email** — Si el cliente tiene email y el status es ACCEPTED/OBSERVED, envia el comprobante con XML adjunto

### Dead Letter Queue

El `DlqListener` monitorea las 5 colas principales (invoice-send, summary-send, ticket-poll, pdf-generate, email-send). Cuando un job agota todos sus reintentos, se mueve automaticamente al DLQ para revision manual.

### Ticket Polling

Para documentos asincronos (RC, RA, GRE), el sistema encola un job `ticket-poll` con el ticket SUNAT. El processor consulta `getStatus` con backoff exponencial (10s base, maximo 5 minutos entre intentos, hasta 20 reintentos). El campo `documentType` (`'summary'` | `'voided'` | `'guide'`) determina el endpoint y flujo post-respuesta.

---

## Impuestos Soportados

| Impuesto                     | Tasa      | Catalogo       | Notas                                       |
|------------------------------|-----------|----------------|----------------------------------------------|
| IGV                          | 18%       | Cat 05 (1000)  | Tasa general, etiqueta dinamica en PDFs      |
| IGV Restaurantes MYPEs       | 10%       | Cat 05 (1000)  | Ley 31556 (8% IGV + 2% IPM), vigente 2025-2026 |
| IVAP (Arroz Pilado)          | 4%        | Cat 05 (1016)  | Tipo afectacion 17                           |
| ISC                          | Variable  | Cat 05 (2000)  | Por tipo de producto                         |
| ICBPER (Bolsas Plasticas)    | S/ 0.50   | Cat 05 (7152)  | Por unidad                                   |
| Retenciones                  | 3% / 6%   | Cat 23         | Regimen 01 / 02                              |
| Percepciones                 | 0.5-2%    | Cat 22         | Regimen 03 (0.5%) / 02 (1%) / 01 (2%)       |
| Detracciones (SPOT)          | Variable  | Cat 54         | 42 codigos, umbral S/700 (general) y S/400 (transp.) |

### Detracciones (Catalogo 54 — 42 codigos)

El sistema implementa 42 codigos de detraccion organizados por Anexo:

- **Anexo I — Bienes gravados con IGV**: Azucar (001, 10%), Alcohol (003, 10%)
- **Anexo II — Bienes sujetos al SPOT**: Recursos hidrobiologicos (004, 4%), Maiz amarillo (005, 4%), Madera (008, 4%), Arena/piedra (009, 10%), Residuos (010, 15%), Carne (014, 4%), Aceite de pescado (016, 10%), Leche (023, 4%), Oro (031, 10%), Minerales (034, 10%), Plomo (041, 15%)
- **Anexo III — Servicios**: Intermediacion laboral (012, 12%), Arrendamiento (019, 10%), Mantenimiento (020, 12%), Movimiento de carga (021, 10%), Servicios empresariales (022, 12%), Comision mercantil (024, 10%), Transporte personas (026, 10%), Transporte carga (027, 4%), Construccion (030, 4%), Demas servicios (037, 12%)
- **Mineria 2025**: Oro y concentrados auríferos (044, 10%), Minerales no auríferos (045, 10%), Beneficio de minerales (046, 12%) — Res. 000086-2025/SUNAT

Constantes: `DETRACCION_DEFAULT_RATE = 0.12`, `DETRACCION_THRESHOLD = S/700`, `DETRACCION_THRESHOLD_TRANSPORT = S/400`, `DETRACCION_THRESHOLD_ANNEX1_UIT_FRACTION = 0.5`

### Generacion dinamica de PDFs

Los PDFs (A4 y ticket 80mm) muestran la tasa de IGV dinamicamente:
- IGV 18% (tasa general)
- IGV 10% (MYPEs restaurantes/hoteles — Ley 31556)
- IVAP 4% (Arroz Pilado, tipo afectacion 17)

Ademas muestran: operaciones gratuitas, exportacion, IVAP, igvIvap, detracciones con codigo/porcentaje/monto, QR code, monto en letras.

---

## Seguridad

### Autenticacion y autorizacion

- **JWT Access Token**: 15 minutos de vigencia, firmado con HS256
- **JWT Refresh Token**: 7 dias con rotacion automatica (jti unico)
- **API Keys**: Prefijo `fpe_`, hash HMAC-SHA256, 8 chars para identificacion rapida
- **Passwords**: scrypt (64-byte derived key) + timingSafeEqual con length check
- **Guard chain**: `TenantThrottlerGuard` → `JwtAuthGuard` → `ApiKeyGuard` → `TenantGuard` → `RolesGuard`
- **Roles**: `owner`, `admin`, `member`

### Cifrado de datos sensibles

| Dato            | Algoritmo     | Almacenamiento                    |
|-----------------|---------------|-----------------------------------|
| Certificados PFX | AES-256-GCM | pfxData (Bytes) + pfxIv + pfxAuthTag |
| Claves SOL      | AES-256-GCM   | solPass + solIv + solTag          |
| Passphrase cert | AES-256-GCM   | passphrase + passphraseIv + passphraseTag |
| API Keys        | HMAC-SHA256   | keyHash                          |
| Webhooks        | HMAC-SHA256   | Firma en header de cada envio    |

- Master key via `ENCRYPTION_KEY` (32 bytes hex = 64 chars)
- Validacion al startup — fail-fast si no cumple formato
- IV de 96 bits, authentication tag de 128 bits

### Rate Limiting

Tres tiers configurables via variables de entorno:

| Ventana   | Limite       | Variables env                      |
|-----------|-------------|-------------------------------------|
| 1 segundo | 3 requests  | `RATE_LIMIT_SHORT_TTL/LIMIT`       |
| 10 seg    | 20 requests | `RATE_LIMIT_MEDIUM_TTL/LIMIT`      |
| 1 minuto  | 100 requests| `RATE_LIMIT_LONG_TTL/LIMIT`        |

### Multi-tenancy

- Cada request resuelve un `companyId` desde JWT o API Key
- `nestjs-cls` almacena el tenant en AsyncLocalStorage
- Prisma Client Extension ejecuta `SET tenancy.tenant_id` antes de cada query
- Politicas RLS en PostgreSQL filtran datos automaticamente
- Tablas con RLS: `invoices`, `invoice_items`, `certificates`, `api_keys`, `webhooks`, `subscriptions`
- Decorator `@SkipTenant()` para rutas sin contexto de empresa

### Headers y proteccion

- **Helmet** con CSP environment-aware via `@fastify/helmet` (strict en prod, relajado para Swagger en dev)
- **CORS** configurable via `CORS_ORIGIN` (soporta multiples origenes separados por coma)
- **Correlation ID** (`X-Request-ID`) generado y propagado en todas las respuestas
- **Global Exception Filters**: PrismaExceptionFilter → HttpExceptionFilter → SentryExceptionFilter
- **Interceptors**: LoggingInterceptor (request/response + correlation ID) + TimeoutInterceptor

---

## Testing

```bash
pnpm test          # Unit tests (~709 tests, 33 spec files)
pnpm test:e2e      # E2E tests (4 archivos, 32 tests, requiere BD activa)
pnpm test:cov      # Coverage con thresholds (lines 60%, functions 60%, branches 50%)
```

### Desglose por area (~709 tests, 37 archivos)

| Area               | Tests | Archivos | Descripcion                                          |
|--------------------|-------|----------|------------------------------------------------------|
| Tax Calculator     | ~70   | 7        | IGV, ISC, ICBPER, IVAP, MYPE, detracciones, exportacion, gratuitas |
| Utilidades         | ~99   | 5        | encryption, zip, peru-date, amount-to-words, ruc-validator |
| XML Builders       | ~199  | 6        | Invoice, NC/ND, retention/perception, guide, beta integration |
| XML Validators     | ~144  | 5        | Core, completa, deep, new-docs, retention-perception |
| Auth               | ~26   | 1        | Register, login, refresh, logout, API keys, lockout  |
| Companies          | ~16   | 1        | CRUD, SOL credentials, cache                         |
| Billing            | ~23   | 1        | Plans, subscriptions, quotas, webhooks               |
| Tenant Isolation   | ~26   | 1        | RLS, cross-tenant queries, non-tenant models         |
| SUNAT Client       | ~25   | 1        | SOAP send, getStatus, error handling                 |
| Queue Processors   | ~22   | 1        | Pipeline completo invoice-send                       |
| Other Services     | ~27   | 4        | CDR processor, XML signer, PDF generator, invoices   |
| **E2E**            | **32**| **4**    | Auth flow, invoices, consultations, health           |

### Configuracion

- **Framework**: Vitest 3 con SWC transformer
- **Cobertura**: V8 provider con reportes text + lcov
- **Thresholds**: lines 60%, functions 60%, branches 50%, statements 60%
- **Globals**: Habilitados (sin import explicito de `describe`, `it`, `expect`)
- **E2E**: Usa `unplugin-swc` para decoradores, requiere PostgreSQL + Redis activos

---

## Docker

### Desarrollo

```bash
# Solo servicios de infraestructura
docker compose up -d postgres redis
```

| Contenedor        | Imagen             | Puerto | Datos            |
|-------------------|--------------------|--------|------------------|
| `facturape-db`    | postgres:16-alpine | 5432   | pgdata (volume)  |
| `facturape-redis` | redis:7-alpine     | 6379   | redisdata (vol)  |

### Produccion

```bash
# Build y ejecucion completa
docker compose up -d

# Solo build de imagen
docker build -t facturape-backend .
```

### Imagen de produccion

Build multi-stage optimizado:

| Stage         | Descripcion                                               |
|---------------|-----------------------------------------------------------|
| **deps**      | Instala dependencias con pnpm (frozen lockfile, corepack) |
| **build**     | Compila TypeScript, genera Prisma Client, prune dev deps  |
| **production**| Imagen minima Alpine con solo runtime                     |

Caracteristicas:
- Base: `node:22-alpine`
- Usuario no-root (`node`)
- Signal handling con `dumb-init`
- Graceful shutdown con timeout 30s para drain de colas BullMQ
- Puerto expuesto: `3000`

---

## CI/CD

Pipeline de GitHub Actions (`.github/workflows/ci.yml`) con 4 jobs secuenciales:

```
 lint-and-typecheck  ──>  test  ──>  build  ──>  docker (solo main/master)
```

| Job                  | Servicios          | Descripcion                                       |
|----------------------|--------------------|---------------------------------------------------|
| `lint-and-typecheck` | —                  | pnpm install → db:generate → ESLint → `tsc --noEmit` |
| `test`               | PostgreSQL + Redis | Migrations → unit tests → E2E tests → coverage report |
| `build`              | —                  | `pnpm build` → upload dist/ artifact (1d retention) |
| `docker`             | —                  | Build & push a GHCR (docker/build-push-action@v6)  |

**Triggers**: Push a `main`/`master`/`develop`, PRs a `main`/`master`.

**Docker tags**: SHA del commit + `latest`.

---

## Planes de Suscripcion

| Plan           | Precio/mes | Comprobantes | Empresas  | Caracteristicas principales          |
|----------------|------------|--------------|-----------|--------------------------------------|
| **Starter**    | S/ 49      | 100          | 1         | API REST, soporte email              |
| **Pro**        | S/ 149     | 500          | 3         | + Webhooks, PDF personalizado        |
| **Business**   | S/ 299     | 2,000        | 10        | + WhatsApp, soporte prioritario      |
| **Enterprise** | S/ 599     | Ilimitado    | Ilimitado | + SLA, soporte dedicado              |

Seed ejecutado con `pnpm db:seed` (4 planes preconfigurados).

Integracion con Mercado Pago via PreApproval (suscripciones recurrentes) con webhook IPN para actualizacion automatica de estado.

---

## Estructura del Proyecto

```
src/
├── main.ts                           # Bootstrap Fastify + Sentry + graceful shutdown
├── app.module.ts                     # Root module (5 guards, 3 filters, 2 interceptors)
├── generated/prisma/                 # Prisma Client generado (output local, NO node_modules)
│
├── common/
│   ├── constants/index.ts            # Catalogos SUNAT 01-62, namespaces UBL, endpoints,
│   │                                 # tasas, 42 codigos detraccion, constantes de negocio
│   ├── decorators/                   # @CurrentUser @Tenant @Public @SkipTenant @Roles @ApiKeyAuth
│   ├── guards/                       # JWT, API Key, Tenant, Roles, TenantThrottler (5)
│   ├── interceptors/                 # Logging + Timeout (2)
│   ├── filters/                      # HTTP, Prisma, Sentry exception filters (3)
│   ├── pipes/                        # ParseRucPipe, ParseDocTypePipe (2)
│   ├── middleware/                   # CorrelationIdMiddleware, TenantMiddleware (2)
│   ├── interfaces/                   # ApiResponse, PaginatedResponse, RequestUser, JwtPayload
│   └── utils/                        # tax-calculator, encryption, zip, peru-date,
│                                     # amount-to-words, ruc-validator
│
├── config/                           # 8 archivos de configuracion
│   ├── app.config.ts                 # port, apiPrefix, corsOrigin, rateLimit tiers
│   ├── database.config.ts            # DATABASE_URL
│   ├── redis.config.ts               # REDIS_HOST, REDIS_PORT
│   ├── sunat.config.ts               # SOAP + GRE OAuth2 config
│   ├── jwt.config.ts                 # JWT secrets y expiraciones
│   ├── mercadopago.config.ts         # MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET
│   ├── resend.config.ts              # RESEND_API_KEY, EMAIL_FROM
│   └── sentry.config.ts              # SENTRY_DSN, tracesSampleRate
│
└── modules/                          # 19 feature modules
    ├── auth/                         # JWT + API Keys + register/login/refresh/logout/password
    ├── users/                        # Perfil usuario (3 endpoints)
    ├── companies/                    # Empresas + SOL + migracion beta/prod (8 endpoints)
    ├── certificates/                 # Upload PFX + cifrado AES-256-GCM (2 endpoints)
    ├── xml-builder/                  # 8 builders XML UBL 2.1 + validador + interfaces
    │   ├── builders/                 # base, invoice, credit-note, debit-note, summary,
    │   │                             # voided, retention, perception, guide
    │   ├── validators/               # xml-validator (8 metodos validate*)
    │   └── interfaces/               # XmlInvoiceData, XmlRetentionData, XmlGuideData, etc.
    ├── xml-signer/                   # Firma digital XMLDSig SHA-256 + pfx-reader
    ├── sunat-client/                 # SOAP + GRE REST (OAuth2)
    │   └── wsdl/                     # main.wsdl, retention.wsdl, types.wsdl, types.xsd
    ├── cdr-processor/                # Parseo CDR (ApplicationResponse)
    ├── invoices/                     # Orquestador: 9 tipos + batch (18 endpoints, 11 DTOs)
    ├── pdf-generator/                # PDF A4 + ticket 80mm (pdfmake + QR, IGV dinamico)
    ├── queues/                       # 7 colas BullMQ + 6 processors + DLQ listener
    ├── webhooks/                     # CRUD + dispatch HMAC-signed (3 endpoints)
    ├── consultations/                # RUC, DNI, tipo cambio, validar CPE (4 endpoints)
    ├── billing/                      # Planes + suscripciones + Mercado Pago (4 endpoints)
    ├── notifications/                # Emails transaccionales via Resend (uso interno)
    ├── dashboard/                    # Resumen emision + reporte mensual PDT 621 (2 endpoints)
    ├── health/                       # Health checks Terminus: DB, Redis, memory, disk
    ├── prisma/                       # PrismaService global + tenant extension + RLS
    └── redis/                        # RedisModule global (ioredis, token REDIS_CLIENT)

prisma/
├── schema.prisma                     # 10 modelos + InvoiceStatus enum
├── prisma.config.ts                  # defineConfig + earlyAccess + PrismaPg adapter
├── seed.ts                           # 4 planes de suscripcion
└── migrations/                       # 4 migraciones
    ├── 20260222204548_init/                          # Schema base + RLS policies
    ├── 20260222224827_add_webhook_model/              # Tabla webhooks
    ├── 20260224180000_invoice_status_enum/            # InvoiceStatus PostgreSQL enum
    └── 20260225100000_add_ivap_detraccion_columns/   # IVAP + detracciones + series nuevas

test/
├── auth.e2e-spec.ts                  # Flujo completo autenticacion (5 tests)
├── invoices.e2e-spec.ts              # Emision de comprobantes (21 tests)
├── consultations.e2e-spec.ts         # Consultas RUC/DNI (5 tests)
├── health.e2e-spec.ts                # Health checks (1 test)
├── setup.ts                          # Test environment setup
└── env-setup.ts                      # Environment initialization
```

---

## Licencia AGPL-3.0-only 

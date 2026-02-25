<p align="center">
  <h1 align="center">FacturaPE</h1>
  <p align="center">
    Backend SaaS de facturaci&oacute;n electr&oacute;nica con conexi&oacute;n <strong>directa</strong> a SUNAT Per&uacute;
    <br />
    <em>SEE-Del Contribuyente &middot; Sin intermediarios PSE/OSE</em>
  </p>
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

| Codigo | Documento                    | Protocolo      | Endpoint SUNAT     | Estado |
|--------|------------------------------|----------------|---------------------|--------|
| `01`   | Factura Electronica          | SOAP sendBill  | Invoice             | OK     |
| `03`   | Boleta de Venta              | SOAP sendBill  | Invoice             | OK     |
| `07`   | Nota de Credito              | SOAP sendBill  | Invoice             | OK     |
| `08`   | Nota de Debito               | SOAP sendBill  | Invoice             | OK     |
| `09`   | Guia de Remision (GRE)       | REST API OAuth2| GRE API             | OK     |
| `20`   | Comprobante de Retencion     | SOAP sendBill  | Retention           | OK     |
| `40`   | Comprobante de Percepcion    | SOAP sendBill  | Retention           | OK     |
| `RC`   | Resumen Diario               | SOAP sendSummary | Invoice           | OK     |
| `RA`   | Comunicacion de Baja         | SOAP sendSummary | Invoice           | OK     |

### Estados del comprobante (InvoiceStatus)

El ciclo de vida de un comprobante se gestiona con un enum PostgreSQL:

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

- Generacion de XML UBL 2.1 con todos los namespaces requeridos por SUNAT
- Firma digital XMLDSig con SHA-256 + RSA (certificados .pfx)
- Envio SOAP sincrono (`sendBill`) y asincrono (`sendSummary` + polling `getStatus`)
- Envio REST API con OAuth2 para Guia de Remision Electronica (GRE)
- Procesamiento de CDR (Constancia de Recepcion) automatico
- Generacion de PDF en formatos A4 y ticket 80mm con tasa IGV dinamica
- Emision masiva (batch) de hasta 50 comprobantes por request
- Emails transaccionales con adjuntos XML/PDF (Resend)
- Webhooks salientes con HMAC-SHA256 para notificaciones en tiempo real
- Dead Letter Queue (DLQ) para jobs fallidos con review manual
- Sistema de 7 colas con reintentos y backoff exponencial (BullMQ)
- Polling automatico de tickets con backoff exponencial
- Multi-tenancy con Row-Level Security en PostgreSQL
- Soporte IVAP (Arroz Pilado 4%), detracciones (SPOT), exportaciones
- IGV reducido 10.5% para MYPEs restaurantes/hoteles (Ley 32357)
- Suscripciones y planes con Mercado Pago
- Dashboard con resumen de emision y reporte mensual PDT 621
- Migracion beta a produccion con validacion de requisitos
- Consultas gratuitas: RUC, DNI, tipo de cambio, validar CPE
- Validacion pre-envio contra reglas SUNAT por tipo de documento
- Correlation ID (`X-Request-ID`) en todas las respuestas
- Health checks: base de datos, Redis, memoria heap (256MB), disco (90%)
- Swagger/OpenAPI con respuestas globales 401/403/429

---

## Stack Tecnologico

| Capa            | Tecnologia                                      |
|-----------------|--------------------------------------------------|
| Runtime         | Node.js 22 LTS                                   |
| Framework       | NestJS 11.1 + Fastify 5.7                        |
| ORM             | Prisma 7.4 (driver adapter `@prisma/adapter-pg`) |
| Base de datos   | PostgreSQL 16 + Row-Level Security               |
| Colas           | BullMQ 5.66 + Redis 7 (ioredis 5.6)              |
| XML             | xmlbuilder2 4 (UBL 2.1) + fast-xml-parser 5 (CDR)|
| Firma digital   | xml-crypto 6 (XMLDSig) + node-forge 1.3 (PFX)   |
| SOAP            | node-soap 1.1 (WS-Security) + WSDLs locales     |
| REST (GRE)      | axios 1.13 (OAuth2 + REST API SUNAT)             |
| PDF             | pdfmake 0.3 (A4 + ticket 80mm) + qrcode 1.5     |
| Pagos           | mercadopago 2.12 (PreApproval)                   |
| Email           | Resend 6.9                                       |
| Auth            | JWT (access 15min + refresh 7d) + API Keys       |
| Validacion      | class-validator 0.14 + class-transformer 0.5     |
| Rate Limiting   | @nestjs/throttler 6.5 (3 tiers configurables)    |
| Multi-tenancy   | nestjs-cls 4.5 (AsyncLocalStorage) + PG RLS      |
| Compresion      | archiver 7 (ZIP SUNAT) + adm-zip 0.5 (CDR)      |
| Cifrado         | crypto nativo Node.js (AES-256-GCM)              |
| Uploads         | @fastify/multipart 9 (5MB limit)                 |
| Docs            | @nestjs/swagger 11 + @fastify/swagger 9          |
| Testing         | Vitest 3 + Supertest 7 (~570 tests, 29 spec + 4 e2e) |
| Monitoreo       | Sentry 10 + Health Checks (@nestjs/terminus 11)  |
| Package Manager | pnpm 9+                                          |

---

## Arquitectura

```
                                   FacturaPE Backend
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌────────────────┐  │
    │  │ REST API │──>│ Validacion│──>│ XML UBL  │──>│ Firma XMLDSig  │  │
    │  │ (Fastify)│   │ (class-v) │   │ 2.1      │   │ SHA-256 + RSA  │  │
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
    │       │  └──────┘  └───────┘  └─────┘  └────┘  └─────┘           │
    │       │                                                             │
    │  ┌────┴────────────────────────────────────────────────────────┐    │
    │  │                  PostgreSQL 16 (RLS)                        │    │
    │  │  users─companies─invoices─certificates─webhooks─billing    │    │
    │  └────────────────────────────────────────────────────────────┘    │
    └──────────────────────────────────────────────────────────────────────┘
```

### Modulos registrados (20 total)

**Fase 1 — Autenticacion y tenancy:** AuthModule, UsersModule, CompaniesModule, CertificatesModule

**Fase 2 — Core XML/Facturacion:** XmlBuilderModule, XmlSignerModule, SunatClientModule, CdrProcessorModule, InvoicesModule

**Fase 4 — Procesamiento asincrono:** QueuesModule, PdfGeneratorModule, ConsultationsModule, WebhooksModule, BillingModule, NotificationsModule

**Fase 5 — Observabilidad:** HealthModule, DashboardModule

**Infraestructura (global):** PrismaModule, RedisModule, ConfigModule + ThrottlerModule + BullModule + ClsModule

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

# 3. Levantar servicios de infraestructura
docker compose up -d postgres redis

# 4. Generar Prisma Client
pnpm db:generate

# 5. Ejecutar migraciones
pnpm db:migrate

# 6. Seed de datos iniciales (planes de suscripcion)
pnpm db:seed

# 7. (Opcional) Aplicar politicas RLS
psql -U facturape -d facturape -f database/rls-policies.sql

# 8. Iniciar en modo desarrollo
pnpm dev
```

### Verificar que funciona

```bash
# API Health Check
curl http://localhost:3000/api/v1/health

# Swagger UI (solo en desarrollo)
open http://localhost:3000/docs
```

---

## Variables de Entorno

| Variable                   | Descripcion                                    | Default                     |
|----------------------------|------------------------------------------------|-----------------------------|
| `NODE_ENV`                 | Entorno de ejecucion                           | `development`               |
| `PORT`                     | Puerto del servidor                            | `3000`                      |
| `API_PREFIX`               | Prefijo global de rutas                        | `api/v1`                    |
| `CORS_ORIGIN`              | Origenes CORS permitidos (separados por coma)  | `http://localhost:3001`     |
| `DATABASE_URL`             | Conexion PostgreSQL                            | (requerido)                 |
| `REDIS_HOST`               | Host de Redis                                  | `localhost`                 |
| `REDIS_PORT`               | Puerto de Redis                                | `6379`                      |
| `JWT_SECRET`               | Secret para access tokens (min 32 chars)       | (requerido)                 |
| `JWT_EXPIRATION`           | Expiracion del access token                    | `15m`                       |
| `JWT_REFRESH_SECRET`       | Secret para refresh tokens                     | (requerido)                 |
| `JWT_REFRESH_EXPIRATION`   | Expiracion del refresh token                   | `7d`                        |
| `ENCRYPTION_KEY`           | Clave AES-256-GCM (64 hex chars = 32 bytes)    | (requerido)                 |
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
pnpm test                  # Unit tests con Vitest (~570 tests, 29 spec files)
pnpm test:e2e              # Tests end-to-end (4 archivos, requiere BD activa)
pnpm test:cov              # Tests con reporte de cobertura (V8 provider)

# Calidad de codigo
pnpm lint                  # ESLint (src/)
pnpm format                # Prettier (src/)
```

---

## API Endpoints

Todos los endpoints estan bajo el prefijo `/api/v1/`. Autenticacion requerida salvo indicacion contraria. Swagger disponible en `/docs` (solo en desarrollo). Todas las operaciones incluyen respuestas globales **401** (Unauthorized), **403** (Forbidden) y **429** (Too Many Requests).

### Autenticacion

| Metodo | Ruta                          | Descripcion                     | Auth     |
|--------|-------------------------------|---------------------------------|----------|
| POST   | `/auth/register`              | Registro de usuario             | Publica  |
| POST   | `/auth/login`                 | Login (retorna JWT + refresh)   | Publica  |
| POST   | `/auth/refresh`               | Renovar access token            | Publica  |
| POST   | `/auth/logout`                | Cerrar sesion (revocar token)   | JWT      |
| PATCH  | `/auth/password`              | Cambiar contrasena              | JWT      |
| POST   | `/auth/api-keys`              | Crear API Key                   | Roles    |
| DELETE | `/auth/api-keys/:id`          | Revocar API Key                 | Roles    |

### Usuarios

| Metodo | Ruta                          | Descripcion                     |
|--------|-------------------------------|---------------------------------|
| GET    | `/users/me`                   | Perfil del usuario autenticado  |
| PUT    | `/users/me`                   | Actualizar perfil               |
| GET    | `/users/me/companies`         | Empresas del usuario            |

### Empresas (Tenants)

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/companies`                            | Listar empresas del usuario     |
| POST   | `/companies`                            | Registrar empresa               |
| GET    | `/companies/:id`                        | Detalle de empresa              |
| PUT    | `/companies/:id`                        | Actualizar empresa              |
| POST   | `/companies/:id/certificate`            | Subir certificado .pfx          |
| GET    | `/companies/:id/certificate`            | Info del certificado activo     |
| PUT    | `/companies/:id/sol-credentials`        | Configurar clave SOL            |
| GET    | `/companies/:id/migration-status`       | Verificar requisitos migracion  |
| POST   | `/companies/:id/migrate-to-production`  | Migrar de beta a produccion     |
| POST   | `/companies/:id/revert-to-beta`         | Revertir a modo beta            |

### Comprobantes Electronicos (9 tipos + batch)

| Metodo | Ruta                                    | Descripcion                       |
|--------|-----------------------------------------|-----------------------------------|
| POST   | `/invoices/factura`                     | Emitir Factura (01)               |
| POST   | `/invoices/boleta`                      | Emitir Boleta (03)                |
| POST   | `/invoices/nota-credito`                | Emitir Nota de Credito (07)       |
| POST   | `/invoices/nota-debito`                 | Emitir Nota de Debito (08)        |
| POST   | `/invoices/retencion`                   | Emitir Comprobante de Retencion (20) |
| POST   | `/invoices/percepcion`                  | Emitir Comprobante de Percepcion (40)|
| POST   | `/invoices/guia-remision`               | Emitir Guia de Remision (09)      |
| POST   | `/invoices/resumen-diario`              | Enviar Resumen Diario (RC)        |
| POST   | `/invoices/comunicacion-baja`           | Enviar Comunicacion de Baja (RA)  |
| POST   | `/invoices/batch`                       | Emision masiva (max 50 comprobantes) |

### Consultas y descargas

| Metodo | Ruta                                    | Descripcion                       |
|--------|-----------------------------------------|-----------------------------------|
| GET    | `/invoices`                             | Listar comprobantes (con filtros y paginacion) |
| GET    | `/invoices/:id`                         | Detalle de comprobante            |
| GET    | `/invoices/:id/xml`                     | Descargar XML firmado             |
| GET    | `/invoices/:id/pdf`                     | Descargar PDF (?format=a4\|ticket)|
| GET    | `/invoices/:id/cdr`                     | Descargar CDR (ZIP)               |
| POST   | `/invoices/:id/resend`                  | Reenviar a SUNAT                  |
| GET    | `/invoices/:id/consult-cdr`             | Consultar CDR en SUNAT (solo prod)|
| POST   | `/invoices/:id/anular-guia`             | Anular Guia de Remision via GRE   |

### Webhooks

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| POST   | `/webhooks`                             | Registrar webhook               |
| GET    | `/webhooks`                             | Listar webhooks activos         |
| DELETE | `/webhooks/:id`                         | Desactivar webhook              |

### Consultas gratuitas

| Metodo | Ruta                                    | Descripcion                     | Auth     |
|--------|-----------------------------------------|---------------------------------|----------|
| GET    | `/consultas/ruc/:ruc`                   | Consultar RUC                   | Publica  |
| GET    | `/consultas/dni/:dni`                   | Consultar DNI                   | Publica  |
| GET    | `/consultas/tipo-cambio`                | Tipo de cambio del dia          | Publica  |
| GET    | `/consultas/validar-cpe`                | Validar CPE en SUNAT            | Publica  |

### Billing y suscripciones

| Metodo | Ruta                                    | Descripcion                     | Auth     |
|--------|-----------------------------------------|---------------------------------|----------|
| GET    | `/billing/plans`                        | Listar planes disponibles       | Publica  |
| GET    | `/billing/subscriptions/current`        | Suscripcion activa              | JWT      |
| POST   | `/billing/subscriptions`                | Crear suscripcion               | JWT      |
| POST   | `/billing/webhook`                      | IPN Mercado Pago                | Publica  |

### Dashboard

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/dashboard/summary`                    | Resumen emision por estado y tipo (?from, ?to) |
| GET    | `/dashboard/monthly-report`             | Reporte mensual PDT 621 (?year, ?month)        |

### Health check

| Metodo | Ruta                                    | Descripcion                     | Auth     |
|--------|-----------------------------------------|---------------------------------|----------|
| GET    | `/health`                               | DB, Redis, memoria (256MB), disco (90%) | Publica  |

---

## Flujo de Facturacion

FacturaPE soporta 3 flujos de emision segun el tipo de documento:

### Flujo 1: Documentos sincronos via SOAP

**Facturas/Boletas/NC/ND (01, 03, 07, 08)** — Endpoint Invoice:

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

**Retenciones/Percepciones (20, 40)** — Endpoint Retention (diferente):

```
  POST /invoices/retencion  o  /percepcion
         │
         ▼
  Validar DTO → Build XML → Firmar → ZIP → sendBill(retention) → CDR
```

### Flujo 2: Resumen Diario / Comunicacion de Baja (RC, RA)

```
  POST /invoices/resumen-diario  o  /comunicacion-baja
         │
         ▼
  Validar DTO → Build XML → Firmar → ZIP → sendSummary (SOAP)
         │
         ▼
  Recibir ticket → Encolar ticket-poll (backoff 10s..5min, 15 reintentos)
         │
         ▼
  getStatus(ticket) → CDR → ACCEPTED / REJECTED
```

### Flujo 3: Guia de Remision Electronica (09 — REST API)

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
  Recibir ticket → Encolar ticket-poll → getStatus → CDR
```

### Respuesta de ejemplo (Factura aceptada)

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
    "createdAt": "2026-02-22T15:30:00.000Z"
  }
}
```

---

## Colas de Procesamiento

El sistema utiliza BullMQ con Redis para procesamiento asincrono. 7 colas con configuracion independiente de reintentos y concurrencia.

| Cola             | Funcion                        | Reintentos | Backoff      | Concurrencia | Rate Limit  |
|------------------|--------------------------------|------------|--------------|--------------|-------------|
| `invoice-send`   | Envio a SUNAT via SOAP         | 5          | 2s exp       | 5            | 10 jobs/s   |
| `summary-send`   | RC/RA a SUNAT (sendSummary)    | 5          | 2s exp       | 5            | 10 jobs/s   |
| `ticket-poll`    | Polling getStatus para tickets | 15         | 10s exp (max 5min) | 3      | -           |
| `pdf-generate`   | Generacion de PDF (A4/ticket)  | 3          | 3s exp       | 5            | -           |
| `email-send`     | Envio de emails con adjuntos   | 3          | 1s exp       | 5            | -           |
| `webhook-send`   | Notificaciones HMAC-signed     | 3          | 5s exp       | 3            | -           |
| `dead-letter-queue` | Jobs fallidos permanentemente | -          | -            | -            | -           |

### Pipeline post-envio

Tras recibir respuesta de SUNAT, el procesador dispara automaticamente:

1. **Webhook** - Notifica a los endpoints registrados del evento (`invoice.accepted`, `invoice.rejected`, `invoice.observed`)
2. **PDF** - Genera el PDF A4 y lo almacena
3. **Email** - Si el cliente tiene email, envia el comprobante con XML adjunto

### Dead Letter Queue

El `DlqListener` monitorea las 5 colas principales (invoice-send, summary-send, ticket-poll, pdf-generate, email-send). Cuando un job agota todos sus reintentos, se mueve automaticamente al DLQ para revision manual.

### Ticket Polling

Para documentos asincronos (RC, RA, GRE), el sistema encola un job `ticket-poll` con el ticket SUNAT. El processor consulta `getStatus` con backoff exponencial (10s base, maximo 5 minutos entre intentos, hasta 15 reintentos). El campo `documentType` ('summary' | 'voided' | 'guide') determina el flujo de procesamiento post-respuesta.

---

## Impuestos Soportados

| Impuesto | Tasa | Catalogo | Notas |
|----------|------|----------|-------|
| IGV | 18% | Cat 05 (1000) | Tasa general, etiqueta dinamica en PDFs |
| IGV Restaurantes MYPEs | 10.5% | Cat 05 (1000) | Ley 32357, vigente desde ene 2026 |
| IVAP (Arroz Pilado) | 4% | Cat 05 (1016) | Tipo afectacion 17 |
| ISC | Variable | Cat 05 (2000) | Por tipo de producto |
| ICBPER (Bolsas Plasticas) | S/ 0.50 | Cat 05 (7152) | Por unidad |
| Retenciones | 3% / 6% | Cat 23 | Regimen 01 / 02 |
| Percepciones | 0.5% / 1% / 2% | Cat 22 | Regimen 03 / 02 / 01 |
| Detracciones (SPOT) | Variable por codigo | Cat 54 | Umbral S/ 700, Anexo I/II/III, ~39 codigos |

### Detracciones (Catalogo 54)

El sistema implementa ~39 codigos de detraccion organizados por Anexo:

- **Anexo I — Bienes gravados**: Azucar (001), Alcohol (003), Recursos hidrobiologicos (004), Maiz amarillo (005), Arroz pilado (008), Madera (009), Arena/piedra (010), etc.
- **Anexo II — Bienes intermedios**: Intermediacion laboral (012), Aceite/Harina de pescado (015-017), Abonos (019), Algodón (021), Minerales (023-025, 034-036, 041), etc.
- **Anexo III — Servicios**: Arrendamiento (020), Movimiento de carga (021), Servicios empresariales (022), Comision mercantil (024), Transporte (026-027), Construccion (030), etc.

Constantes clave: `DETRACCION_DEFAULT_RATE = 0.12`, `DETRACCION_THRESHOLD = S/ 700`, `DETRACCION_THRESHOLD_TRANSPORT = S/ 400`.

### Generacion dinamica de PDFs

Los PDFs (A4 y ticket 80mm) muestran la tasa de IGV dinamicamente:
- IGV 18% (tasa general)
- IGV 10.5% (MYPEs restaurantes)
- IVAP 4% (Arroz Pilado, tipo afectacion 17)

Adicionalmente muestran: operaciones gratuitas, exportacion, IVAP, igvIvap, detracciones con porcentaje y monto.

---

## Seguridad

### Autenticacion y autorizacion

- **JWT Access Token**: 15 minutos de vigencia
- **JWT Refresh Token**: 7 dias con rotacion automatica
- **API Keys**: Hash SHA-256, prefijo de 8 chars para identificacion rapida
- **Guard chain**: `TenantThrottlerGuard` -> `JwtAuthGuard` -> `ApiKeyGuard` -> `TenantGuard` -> `RolesGuard`

### Cifrado de datos sensibles

- Certificados `.pfx` cifrados con **AES-256-GCM** antes de almacenar en BD
- Claves SOL cifradas con **AES-256-GCM** (con IV y authTag separados)
- Master key via variable de entorno `ENCRYPTION_KEY` (32 bytes hex)
- Validacion de ENCRYPTION_KEY al startup (fail-fast si no es 64 hex chars)
- Webhooks firmados con HMAC-SHA256

### Rate Limiting

Tres tiers configurables via variables de entorno:

| Ventana   | Limite      | Variables env                      |
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

### Headers y CORS

- Helmet con CSP environment-aware via `@fastify/helmet` (strict en prod, relajado para Swagger en dev)
- CORS configurable via `CORS_ORIGIN` (soporta multiples origenes separados por coma)
- Correlation ID (`X-Request-ID`) generado y propagado en todas las respuestas via CorrelationIdMiddleware

### Global Exception Filters

Tres filtros globales en orden de prioridad:

1. **PrismaExceptionFilter** — Captura errores Prisma (unique constraint, not found, etc.)
2. **HttpExceptionFilter** — Estandariza respuestas HTTP de error
3. **SentryExceptionFilter** — Reporta excepciones no manejadas a Sentry

---

## Testing

```bash
# Ejecutar todos los tests
pnpm test

# Con cobertura
pnpm test:cov

# Tests E2E (requiere BD activa)
pnpm test:e2e
```

### Suites de test (~570 tests, 29 spec files + 4 e2e files)

**Utilidades (common/utils/) — 12 archivos:**

| Suite | Descripcion |
|-------|-------------|
| `tax-calculator.spec.ts` | Calculo IGV/ISC/ICBPER/IVAP, totales |
| `tax-calculator-detraccion.spec.ts` | Detracciones SPOT (Cat 54) |
| `tax-calculator-export.spec.ts` | Operaciones de exportacion |
| `tax-calculator-gratuitas.spec.ts` | Operaciones gratuitas (retiros, bonificaciones) |
| `tax-calculator-isc.spec.ts` | Impuesto Selectivo al Consumo |
| `tax-calculator-ivap.spec.ts` | IVAP Arroz Pilado 4% |
| `tax-calculator-mype.spec.ts` | IGV 10.5% MYPEs restaurantes |
| `tax-calculator-rounding.spec.ts` | Redondeo y tolerancias SUNAT |
| `amount-to-words.spec.ts` | Montos en letras (espanol) |
| `encryption.spec.ts` | AES-256-GCM encrypt/decrypt |
| `ruc-validator.spec.ts` | Validacion modulo 11 RUC |
| `zip.spec.ts` | Utilidades ZIP |
| `peru-date.spec.ts` | Fechas zona horaria Peru (UTC-5) |

**Builders XML — 6 archivos:**

| Suite | Descripcion |
|-------|-------------|
| `xml-builders.spec.ts` | Invoice, NC, ND, Summary, Voided |
| `credit-debit-note.spec.ts` | Builders NC y ND especificos |
| `invoice-builder-features.spec.ts` | Features avanzados (IVAP, detracciones, anticipos) |
| `retention-perception.spec.ts` | Builders retencion y percepcion |
| `guide.spec.ts` | Builder guia de remision |
| `sunat-beta-integration.spec.ts` | Integracion contra SUNAT beta |

**Validadores XML — 5 archivos:**

| Suite | Descripcion |
|-------|-------------|
| `xml-validator.spec.ts` | Validacion pre-envio basica |
| `xml-validator-new-docs.spec.ts` | Validacion docs nuevos |
| `xml-validator-complete.spec.ts` | Validacion completa |
| `xml-validator-deep.spec.ts` | Validacion profunda |
| `xml-validator-retention-perception.spec.ts` | Validacion CRE/CPE |

**Servicios — 6 archivos:**

| Suite | Descripcion |
|-------|-------------|
| `invoices.service.spec.ts` | Orquestacion de emision |
| `sunat-client.spec.ts` | Clientes SOAP y GRE |
| `xml-signer.service.spec.ts` | Firma XMLDSig SHA-256 |
| `cdr-processor.service.spec.ts` | Parseo CDR SUNAT |
| `pdf-generator.service.spec.ts` | Generacion PDF A4/ticket |
| `invoice-send.spec.ts` | Processor de cola invoice-send |

**E2E (test/) — 4 archivos:**

| Suite | Descripcion |
|-------|-------------|
| `auth.e2e-spec.ts` | Flujo completo auth |
| `invoices.e2e-spec.ts` | Emision de comprobantes |
| `consultations.e2e-spec.ts` | Consultas RUC/DNI |
| `health.e2e-spec.ts` | Health checks |

### Configuracion

- **Framework**: Vitest 3
- **Cobertura**: V8 provider con reportes text + lcov
- **Globals**: Habilitados (sin import explicito de `describe`, `it`, `expect`)
- **E2E**: Usa `unplugin-swc` para decoradores, timeout 30s

---

## Docker

### Desarrollo

```bash
# Solo servicios de infraestructura
docker compose up -d postgres redis
```

Contenedores: `facturape-db` (PostgreSQL 16), `facturape-redis` (Redis 7).

### Produccion

```bash
# Build y ejecucion completa (3 servicios: postgres, redis, app)
docker compose up -d

# Solo build de imagen
docker build -t facturape-backend .
```

Contenedor de aplicacion: `facturape-app`.

### Imagen de produccion

La imagen Docker utiliza un build multi-stage optimizado:

1. **deps** - Instala dependencias con pnpm (frozen lockfile, corepack)
2. **build** - Compila TypeScript, genera Prisma Client, prune dev deps
3. **production** - Imagen minima Alpine con solo runtime
   - Base: `node:22-alpine`
   - Usuario no-root (`node`)
   - Signal handling con `dumb-init`
   - Graceful shutdown con timeout 30s para drain de colas BullMQ
   - Puerto expuesto: `3000`

---

## CI/CD

El pipeline de GitHub Actions (`.github/workflows/ci.yml`) ejecuta 4 jobs:

```
 lint-and-typecheck  ──>  test  ──>  build  ──>  docker (solo main/master)
```

| Job                 | Descripcion                                |
|---------------------|--------------------------------------------|
| `lint-and-typecheck`| ESLint + TypeScript compiler check (`tsc --noEmit`) |
| `test`              | Vitest con PostgreSQL 16 y Redis 7 (services) |
| `build`             | Compilacion NestJS + artifact upload       |
| `docker`            | Build y push a GitHub Container Registry   |

**Triggers**: Push a `main`/`master`/`develop`, PR a `main`/`master`.

---

## Planes de Suscripcion

| Plan         | Precio/mes | Comprobantes | Empresas | Caracteristicas principales          |
|--------------|------------|--------------|----------|--------------------------------------|
| **Starter**  | S/ 49      | 100          | 1        | API, soporte email                   |
| **Pro**      | S/ 149     | 500          | 3        | + Webhooks, PDF personalizado        |
| **Business** | S/ 299     | 2,000        | 10       | + WhatsApp, soporte prioritario      |
| **Enterprise**| S/ 599    | Ilimitado    | Ilimitado| + SLA, soporte dedicado              |

Seed ejecutado con `pnpm db:seed` (4 planes preconfigurados).

---

## Estructura del Proyecto

```
src/
├── main.ts                           # Bootstrap Fastify + Sentry + graceful shutdown
├── app.module.ts                     # Root module (5 guards, 3 filters, 2 interceptors, 1 middleware)
├── generated/prisma/                 # Prisma Client generado (output local, NO node_modules)
├── common/
│   ├── constants/index.ts            # Catalogos SUNAT 01-62, namespaces UBL,
│   │                                 # endpoints SOAP/GRE, tasas, ~39 detracciones, IVAP
│   ├── decorators/                   # @CurrentUser, @Tenant, @Public, @SkipTenant, @Roles, @ApiKeyAuth
│   ├── guards/                       # JWT, API Key, Tenant, Roles, TenantThrottler
│   ├── interceptors/                 # Logging, Timeout
│   ├── filters/                      # HTTP, Prisma, Sentry exception filters
│   ├── pipes/                        # ParseRucPipe, ParseDocTypePipe
│   ├── middleware/                    # TenantMiddleware (CLS), CorrelationIdMiddleware (X-Request-ID)
│   └── utils/                        # tax-calculator, amount-to-words, encryption,
│                                     # peru-date, zip, ruc-validator
├── config/                           # 8 archivos: app, database, redis, sunat, jwt,
│                                     # mercadopago, resend, sentry
├── modules/
│   ├── auth/                         # JWT + API Keys + register/login/refresh/logout/password
│   ├── users/                        # Perfil usuario (GET/PUT /me, GET /me/companies)
│   ├── companies/                    # Empresas (tenants) + SOL + migracion beta/prod
│   ├── certificates/                 # Upload PFX, cifrado AES-256-GCM
│   ├── xml-builder/                  # 9 builders XML UBL 2.1 + validador + interfaces
│   │   ├── builders/                 # base, invoice, credit-note, debit-note, summary,
│   │   │                             # voided, retention, perception, guide
│   │   ├── validators/               # 8 metodos validate* (pre-envio SUNAT)
│   │   └── interfaces/               # XmlInvoiceData, XmlRetentionData, XmlPerceptionData,
│   │                                 # XmlGuideData, XmlSummaryData, XmlVoidedData, etc.
│   ├── xml-signer/                   # Firma digital XMLDSig SHA-256 + pfx-reader
│   ├── sunat-client/                 # SOAP (sendBill, sendSummary, getStatus)
│   │   │                             # + GRE REST API (OAuth2 + envio)
│   │   └── wsdl/                     # WSDLs locales: main.wsdl, retention.wsdl, types.*
│   ├── cdr-processor/                # Parseo CDR (ApplicationResponse)
│   ├── invoices/                     # 9 tipos CPE + batch: controller + service + 11 DTOs
│   ├── pdf-generator/                # PDF A4 + ticket 80mm (pdfmake + QR, IGV dinamico)
│   ├── queues/                       # 7 colas BullMQ + DLQ listener
│   │   └── processors/               # invoice-send, summary-send, ticket-poll,
│   │                                 # pdf-generate, email-send, webhook-send, dlq.listener
│   ├── webhooks/                     # CRUD + dispatch HMAC-signed
│   ├── consultations/                # RUC, DNI, tipo de cambio, validar CPE
│   ├── billing/                      # Planes + suscripciones + Mercado Pago (/billing/*)
│   ├── notifications/                # Emails transaccionales (Resend)
│   ├── dashboard/                    # Resumen emision + reporte mensual PDT 621
│   ├── health/                       # Health checks (Terminus: DB, Redis, memory 256MB, disk 90%)
│   ├── prisma/                       # PrismaService global con tenant extension
│   └── redis/                        # RedisModule global (ioredis, token REDIS_CLIENT)
├── database/
│   └── rls-policies.sql              # Politicas Row-Level Security
└── prisma/
    ├── schema.prisma                 # 13 modelos + InvoiceStatus enum
    ├── prisma.config.ts              # defineConfig con earlyAccess + PrismaPg adapter
    ├── seed.ts                       # Seed planes de suscripcion (4 planes)
    └── migrations/                   # 4 migraciones
        ├── 20260222204548_init/                          # Schema base
        ├── 20260222224827_add_webhook_model/              # Tabla webhooks
        ├── 20260224180000_invoice_status_enum/            # InvoiceStatus enum PG
        └── 20260225100000_add_ivap_detraccion_columns/   # IVAP + detracciones + series
```

---

## Licencia

Proyecto propietario. Todos los derechos reservados.

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

| Codigo | Documento                  | Estado |
|--------|---------------------------|--------|
| `01`   | Factura Electronica        | OK     |
| `03`   | Boleta de Venta            | OK     |
| `07`   | Nota de Credito            | OK     |
| `08`   | Nota de Debito             | OK     |
| `RC`   | Resumen Diario             | OK     |
| `RA`   | Comunicacion de Baja       | OK     |

### Capacidades principales

- Generacion de XML UBL 2.1 con todos los namespaces requeridos por SUNAT
- Firma digital XMLDSig con SHA-256 + RSA (certificados .pfx)
- Envio SOAP sincrono (`sendBill`) y asincrono (`sendSummary`)
- Procesamiento de CDR (Constancia de Recepcion) automatico
- Generacion de PDF en formatos A4 y ticket 80mm (pdfmake)
- Emails transaccionales con adjuntos XML/PDF (Resend)
- Webhooks salientes con HMAC-SHA256 para notificaciones en tiempo real
- Sistema de colas con reintentos y backoff exponencial (BullMQ)
- Multi-tenancy con Row-Level Security en PostgreSQL
- Suscripciones y planes con Mercado Pago
- Consultas gratuitas: RUC, DNI, tipo de cambio

---

## Stack Tecnologico

| Capa            | Tecnologia                                      |
|-----------------|--------------------------------------------------|
| Runtime         | Node.js 22 LTS                                   |
| Framework       | NestJS 11 + Fastify 5                            |
| ORM             | Prisma 7 (driver adapter `@prisma/adapter-pg`)   |
| Base de datos   | PostgreSQL 16 + Row-Level Security               |
| Colas           | BullMQ 5 + Redis 7                               |
| XML             | xmlbuilder2 (UBL 2.1) + fast-xml-parser (CDR)   |
| Firma digital   | xml-crypto 6 (XMLDSig) + node-forge (PFX)        |
| SOAP            | node-soap (WS-Security)                          |
| PDF             | pdfmake (A4 + ticket 80mm)                       |
| Pagos           | mercadopago 2 (PreApproval)                      |
| Email           | Resend 6                                          |
| Auth            | JWT (access 15min + refresh 7d) + API Keys       |
| Validacion      | class-validator + class-transformer               |
| Rate Limiting   | @nestjs/throttler 6                              |
| Multi-tenancy   | nestjs-cls (AsyncLocalStorage) + PG RLS          |
| Docs            | @nestjs/swagger + @fastify/swagger                |
| Testing         | Vitest + Supertest                                |
| Monitoreo       | Sentry + Health Checks (@nestjs/terminus)        |
| Package Manager | pnpm                                              |

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
    │       │        ┌───────────┐    ┌──────────────┐                    │
    │       │        │ ZIP + SOAP│───>│ SUNAT        │                    │
    │       │        │ sendBill  │    │ Web Services │                    │
    │       │        └───────────┘    └──────┬───────┘                    │
    │       │                                │ CDR                        │
    │       │                                ▼                            │
    │       │     ┌─────────┐    ┌──────────────────┐                    │
    │       │     │ BullMQ  │<───│ CDR Processor    │                    │
    │       │     │ Queues  │    │ (fast-xml-parser)│                    │
    │       │     └────┬────┘    └──────────────────┘                    │
    │       │          │                                                  │
    │       │     ┌────┴──────────────────────┐                          │
    │       │     │          │                │                           │
    │       │     ▼          ▼                ▼                           │
    │       │  ┌──────┐  ┌───────┐   ┌──────────┐                       │
    │       │  │ PDF  │  │ Email │   │ Webhooks │                        │
    │       │  │ Gen  │  │ Send  │   │ Dispatch │                        │
    │       │  └──────┘  └───────┘   └──────────┘                        │
    │       │                                                             │
    │  ┌────┴────────────────────────────────────────────────────────┐    │
    │  │                  PostgreSQL 16 (RLS)                        │    │
    │  │   users ─ companies ─ invoices ─ certificates ─ webhooks   │    │
    │  └────────────────────────────────────────────────────────────┘    │
    └──────────────────────────────────────────────────────────────────────┘
```

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

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Levantar servicios de infraestructura
docker compose up -d postgres redis

# 4. Instalar dependencias
pnpm install

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
# API
curl http://localhost:3000/api/v1/health

# Swagger UI
open http://localhost:3000/docs
```

---

## Variables de Entorno

| Variable             | Descripcion                                    | Default                     |
|----------------------|------------------------------------------------|-----------------------------|
| `NODE_ENV`           | Entorno de ejecucion                           | `development`               |
| `PORT`               | Puerto del servidor                            | `3000`                      |
| `API_PREFIX`         | Prefijo global de rutas                        | `api/v1`                    |
| `DATABASE_URL`       | Conexion PostgreSQL                            | (requerido)                 |
| `REDIS_HOST`         | Host de Redis                                  | `localhost`                 |
| `REDIS_PORT`         | Puerto de Redis                                | `6379`                      |
| `JWT_SECRET`         | Secret para access tokens (min 32 chars)       | (requerido)                 |
| `JWT_EXPIRATION`     | Expiracion del access token                    | `15m`                       |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens                     | (requerido)                 |
| `JWT_REFRESH_EXPIRATION` | Expiracion del refresh token               | `7d`                        |
| `ENCRYPTION_KEY`     | Clave AES-256-GCM (64 hex chars)               | (requerido)                 |
| `SUNAT_ENV`          | Entorno SUNAT: `beta` o `production`           | `beta`                      |
| `MP_ACCESS_TOKEN`    | Token de Mercado Pago                          | (opcional)                  |
| `MP_WEBHOOK_SECRET`  | Secret para webhook IPN de Mercado Pago        | (opcional)                  |
| `RESEND_API_KEY`     | API Key de Resend para emails                  | (opcional)                  |
| `EMAIL_FROM`         | Direccion de remitente                         | `facturas@facturape.com`    |
| `SENTRY_DSN`         | DSN de Sentry para error tracking              | (opcional)                  |

**Generar `ENCRYPTION_KEY`:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Scripts Disponibles

```bash
# Desarrollo
pnpm dev                   # Servidor en watch mode (hot reload)
pnpm build                 # Compilar TypeScript a dist/
pnpm start                 # Ejecutar build compilado
pnpm start:prod            # Produccion con NODE_ENV=production

# Base de datos
pnpm db:generate           # Generar Prisma Client
pnpm db:migrate            # Crear y aplicar migraciones
pnpm db:migrate:prod       # Aplicar migraciones (produccion, sin generar)
pnpm db:seed               # Seed de planes de suscripcion
pnpm db:studio             # Prisma Studio (UI visual para BD)
pnpm db:reset              # Reset completo de BD + migraciones

# Testing
pnpm test                  # Unit tests con Vitest
pnpm test:e2e              # Tests end-to-end
pnpm test:cov              # Tests con reporte de cobertura

# Calidad de codigo
pnpm lint                  # ESLint
pnpm format                # Prettier
```

---

## API Endpoints

Todos los endpoints estan bajo el prefijo `/api/v1/`. Autenticacion requerida salvo indicacion contraria.

### Autenticacion

| Metodo | Ruta                          | Descripcion                     |
|--------|-------------------------------|---------------------------------|
| POST   | `/auth/register`              | Registro de usuario             |
| POST   | `/auth/login`                 | Login (retorna JWT + refresh)   |
| POST   | `/auth/refresh`               | Renovar access token            |
| POST   | `/auth/api-keys`              | Crear API Key                   |
| DELETE | `/auth/api-keys/:id`          | Revocar API Key                 |

### Empresas (Tenants)

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/companies`                            | Listar empresas del usuario     |
| POST   | `/companies`                            | Registrar empresa               |
| GET    | `/companies/:id`                        | Detalle de empresa              |
| PUT    | `/companies/:id`                        | Actualizar empresa              |
| POST   | `/companies/:id/certificate`            | Subir certificado .pfx          |
| PUT    | `/companies/:id/sol-credentials`        | Configurar clave SOL            |

### Comprobantes Electronicos

| Metodo | Ruta                                    | Descripcion                       |
|--------|-----------------------------------------|-----------------------------------|
| POST   | `/invoices/factura`                     | Emitir Factura (01)               |
| POST   | `/invoices/boleta`                      | Emitir Boleta (03)                |
| POST   | `/invoices/nota-credito`                | Emitir Nota de Credito (07)       |
| POST   | `/invoices/nota-debito`                 | Emitir Nota de Debito (08)        |
| POST   | `/invoices/resumen-diario`              | Enviar Resumen Diario (RC)        |
| POST   | `/invoices/comunicacion-baja`           | Enviar Comunicacion de Baja (RA)  |
| GET    | `/invoices`                             | Listar comprobantes (con filtros) |
| GET    | `/invoices/:id`                         | Detalle de comprobante            |
| GET    | `/invoices/:id/xml`                     | Descargar XML firmado             |
| GET    | `/invoices/:id/pdf`                     | Descargar PDF                     |
| GET    | `/invoices/:id/cdr`                     | Descargar CDR (ZIP)               |
| POST   | `/invoices/:id/resend`                  | Reenviar a SUNAT                  |

### Webhooks

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| POST   | `/webhooks`                             | Registrar webhook               |
| GET    | `/webhooks`                             | Listar webhooks activos         |
| DELETE | `/webhooks/:id`                         | Desactivar webhook              |

### Consultas

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/consultas/ruc/:ruc`                   | Consultar RUC                   |
| GET    | `/consultas/dni/:dni`                   | Consultar DNI                   |
| GET    | `/consultas/tipo-cambio`                | Tipo de cambio del dia          |
| GET    | `/consultas/validar-cpe`                | Validar CPE en SUNAT            |

### Suscripciones

| Metodo | Ruta                                    | Descripcion                     |
|--------|-----------------------------------------|---------------------------------|
| GET    | `/plans`                                | Listar planes disponibles       |
| GET    | `/subscriptions/current`                | Suscripcion activa              |
| POST   | `/subscriptions`                        | Crear suscripcion               |
| POST   | `/billing/webhook`                      | IPN Mercado Pago                |

---

## Flujo de Facturacion

```
                              Flujo Completo de Emision
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                                                                         │
 │  POST /invoices/factura                                                │
 │         │                                                               │
 │         ▼                                                               │
 │  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
 │  │  Validar DTO │────>│ Calcular IGV │────>│ Asignar Serie/Correl.  │  │
 │  │  (class-v)   │     │  ISC, ICBPER │     │  (atomico por empresa) │  │
 │  └─────────────┘     └──────────────┘     └───────────┬─────────────┘  │
 │                                                        │                │
 │                                                        ▼                │
 │  ┌──────────────────┐     ┌───────────────┐     ┌────────────┐        │
 │  │ Enviar SOAP      │<────│ Crear ZIP     │<────│ Firmar XML │        │
 │  │ sendBill a SUNAT │     │ {RUC}-{T}-... │     │ SHA-256+RSA│        │
 │  └────────┬─────────┘     └───────────────┘     └────────────┘        │
 │           │                                                            │
 │           ▼                                                            │
 │  ┌──────────────────┐                                                  │
 │  │ Procesar CDR     │────> ACCEPTED / OBSERVED / REJECTED              │
 │  │ (ApplicationResp)│                                                  │
 │  └────────┬─────────┘                                                  │
 │           │                                                            │
 │     ┌─────┴──────────────────────┐                                     │
 │     ▼             ▼              ▼                                     │
 │  ┌───────┐   ┌─────────┐   ┌──────────┐                               │
 │  │  PDF  │   │  Email  │   │ Webhooks │                                │
 │  │  Gen  │   │ c/ XML  │   │ Dispatch │                                │
 │  └───────┘   └─────────┘   └──────────┘                               │
 │                                                                         │
 └─────────────────────────────────────────────────────────────────────────┘
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

El sistema utiliza BullMQ con Redis para procesamiento asincrono. Cada cola tiene configuracion independiente de reintentos y concurrencia.

| Cola             | Funcion                      | Reintentos | Concurrencia | Rate Limit  |
|------------------|------------------------------|------------|--------------|-------------|
| `invoice-send`   | Envio a SUNAT via SOAP       | 5          | 5            | 10 jobs/s   |
| `pdf-generate`   | Generacion de PDF            | 3          | 5            | -           |
| `email-send`     | Envio de emails con adjuntos | 3          | 5            | -           |
| `summary-send`   | Resumenes y bajas a SUNAT    | 5          | 5            | 10 jobs/s   |

### Pipeline post-envio

Tras recibir respuesta de SUNAT, el procesador `invoice-send` dispara automaticamente:

1. **Webhook** - Notifica a los endpoints registrados del evento (`invoice.accepted`, `invoice.rejected`)
2. **PDF** - Genera el PDF A4 y lo almacena en `storage/pdfs/`
3. **Email** - Si el cliente tiene email, envia el comprobante con XML adjunto

---

## Seguridad

### Autenticacion y autorizacion

- **JWT Access Token**: 15 minutos de vigencia
- **JWT Refresh Token**: 7 dias con rotacion automatica
- **API Keys**: Hash SHA-256, prefijo de 8 chars para identificacion rapida
- **Guard chain**: `ThrottlerGuard` -> `JwtAuthGuard` -> `TenantGuard` -> `RolesGuard`

### Cifrado de datos sensibles

- Certificados `.pfx` cifrados con **AES-256-GCM** antes de almacenar en BD
- Claves SOL cifradas con **AES-256-GCM**
- Master key via variable de entorno `ENCRYPTION_KEY` (32 bytes hex)

### Rate Limiting

| Ventana   | Limite      |
|-----------|-------------|
| 1 segundo | 3 requests  |
| 10 seg    | 20 requests |
| 1 minuto  | 100 requests|

### Multi-tenancy

- Cada request resuelve un `companyId` desde JWT o API Key
- `nestjs-cls` almacena el tenant en AsyncLocalStorage
- Prisma Client Extension ejecuta `SET tenancy.tenant_id` antes de cada query
- Politicas RLS en PostgreSQL filtran datos automaticamente

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

### Suites de test

| Suite                         | Tests | Descripcion                                |
|-------------------------------|-------|--------------------------------------------|
| `tax-calculator.spec.ts`      | 22    | Calculo de IGV, ISC, ICBPER, totales       |
| `cdr-processor.service.spec`  | 7     | Parseo de CDR SUNAT (aceptado/rechazado)   |
| `xml-signer.service.spec`     | 5     | Firma XMLDSig, hash SHA-256                |
| `pdf-generator.service.spec`  | 3     | Generacion PDF A4 y ticket                 |

### Configuracion

- **Framework**: Vitest 3
- **Cobertura**: V8 provider con reportes text + lcov
- **Globals**: Habilitados (sin import explicito de `describe`, `it`, `expect`)

---

## Docker

### Desarrollo

```bash
# Solo servicios de infraestructura
docker compose up -d postgres redis
```

### Produccion

```bash
# Build y ejecucion completa
docker compose up -d

# Solo build de imagen
docker build -t facturape-backend .
```

### Imagen de produccion

La imagen Docker utiliza un build multi-stage optimizado:

1. **deps** - Instala dependencias con pnpm (frozen lockfile)
2. **build** - Compila TypeScript, genera Prisma Client, prune dev deps
3. **production** - Imagen minima Alpine con solo runtime
   - Base: `node:22-alpine`
   - Usuario no-root (`node`)
   - Signal handling con `dumb-init`
   - Puerto expuesto: `3000`

---

## CI/CD

El pipeline de GitHub Actions (`.github/workflows/ci.yml`) ejecuta 4 jobs:

```
 lint-and-typecheck  ──>  test  ──>  build  ──>  docker (solo main)
```

| Job                 | Descripcion                                |
|---------------------|--------------------------------------------|
| `lint-and-typecheck`| ESLint + TypeScript compiler check         |
| `test`              | Vitest con PostgreSQL 16 y Redis 7         |
| `build`             | Compilacion NestJS + artifact upload       |
| `docker`            | Build y push a GitHub Container Registry   |

**Triggers**: Push a `main`/`develop`, PR a `main`.

---

## Planes de Suscripcion

| Plan         | Precio/mes | Comprobantes | Empresas | Caracteristicas principales          |
|--------------|------------|--------------|----------|--------------------------------------|
| **Starter**  | S/ 49      | 100          | 1        | API, soporte email                   |
| **Pro**      | S/ 149     | 500          | 3        | + Webhooks, PDF personalizado        |
| **Business** | S/ 299     | 2,000        | 10       | + WhatsApp, soporte prioritario      |
| **Enterprise**| S/ 599    | Ilimitado    | Ilimitado| + SLA, soporte dedicado              |

---

## Estructura del Proyecto

```
src/
├── main.ts                           # Bootstrap Fastify + Swagger
├── app.module.ts                     # Root module (guards, filters, interceptors)
├── common/
│   ├── constants/                    # Catalogos SUNAT (01-52), tasas IGV/ICBPER
│   ├── decorators/                   # @CurrentUser, @Tenant, @Public, @SkipTenant
│   ├── guards/                       # JWT, API Key, Tenant, Roles
│   ├── interceptors/                 # Logging, Timeout
│   ├── filters/                      # HTTP, Prisma, Sentry exception filters
│   ├── pipes/                        # ParseRucPipe, ParseDocTypePipe
│   ├── middleware/                    # TenantMiddleware (CLS)
│   └── utils/                        # tax-calculator, amount-to-words, encryption, zip
├── config/                           # Configuracion centralizada (8 modulos)
├── modules/
│   ├── auth/                         # JWT + API Keys + register/login/refresh
│   ├── users/                        # Gestion de usuarios
│   ├── companies/                    # Empresas (tenants) + CRUD + SOL credentials
│   ├── certificates/                 # Upload PFX, cifrado AES-256-GCM
│   ├── xml-builder/                  # Generacion XML UBL 2.1 (todos los tipos)
│   ├── xml-signer/                   # Firma digital XMLDSig SHA-256
│   ├── sunat-client/                 # Cliente SOAP (sendBill, sendSummary, getStatus)
│   ├── cdr-processor/                # Parseo de CDR (ApplicationResponse)
│   ├── invoices/                     # API de comprobantes + orquestacion completa
│   ├── pdf-generator/                # PDF A4 + ticket 80mm (pdfmake)
│   ├── queues/                       # BullMQ processors (4 colas)
│   ├── webhooks/                     # CRUD + dispatch HMAC-signed
│   ├── consultations/                # RUC, DNI, tipo de cambio
│   ├── billing/                      # Mercado Pago suscripciones
│   ├── notifications/                # Emails transaccionales (Resend)
│   ├── health/                       # Health checks (Terminus)
│   └── prisma/                       # PrismaService (global)
├── generated/
│   └── prisma/                       # Prisma Client generado
└── database/
    └── rls-policies.sql              # Politicas Row-Level Security
```

---

## Licencia

Proyecto propietario. Todos los derechos reservados.

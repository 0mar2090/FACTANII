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
- **Testing:** vitest (~570 tests) + supertest (4 e2e)
- **Package Manager:** pnpm 9+

## Reglas Críticas del Agente

### TypeScript & Imports
- `strict: true`, ESM modules (`"type": "module"`)
- Imports SIEMPRE con extensión `.js` (requerido por Prisma 7 ESM)
- Path aliases: `@common/*`, `@modules/*`, `@config/*`, `@generated/*`
- `import forge from 'node-forge'` — default import, NO namespace

### Prisma 7
- Generated client en `src/generated/prisma/` (NO node_modules)
- Bytes: `Buffer.from(certificate.pfxData)` (Prisma 7 devuelve Uint8Array)
- `InvoiceStatus` es un PostgreSQL ENUM, NO String
- `prisma.config.ts` usa `defineConfig` con `earlyAccess: true` y PrismaPg adapter

### SUNAT / XML
- 9 tipos de documento con 3 protocolos distintos:
  - SOAP invoice endpoint: 01, 03, 07, 08
  - SOAP retention endpoint: 20, 40
  - Asíncronos (ticket): RC, RA
  - REST API (OAuth2): GRE 09
- Firma: SHA-256 + RSA (NUNCA SHA-1)
- ZIP: `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip`
- Usuario SOAP: `{RUC}{UsuarioSOL}` (concatenado sin separador)
- WSDLs locales en `src/modules/sunat-client/wsdl/`
- Tasas: IGV 18%, IVAP 4%, IGV MYPEs 10.5%, ICBPER S/0.50

### Multi-tenancy
- Todo request resuelve `companyId` (JWT o API Key)
- CLS → Prisma extension → `SET tenancy.tenant_id` → RLS
- `@SkipTenant()` para rutas sin contexto de empresa

### Seguridad
- Certificados y claves SOL cifrados con AES-256-GCM
- `ENCRYPTION_KEY`: 64 hex chars, validado al startup
- Guards: TenantThrottlerGuard → JwtAuthGuard → ApiKeyGuard → TenantGuard → RolesGuard
- Rate limiting: 3 req/s, 20 req/10s, 100 req/min

### Convenciones de Código
- snake_case en BD, camelCase en TS
- Endpoints bajo `/api/v1/`
- Respuestas: `{ success: boolean, data?: T, error?: { code, message } }`
- `XmlNode = ReturnType<typeof create>` — NO usar `any` en builders
- `formaPago: 'Contado' | 'Credito'` — type-safe

### Build
- Si build falla por tsbuildinfo stale: `rm -f tsconfig.tsbuildinfo && npx tsc --build`
- Graceful shutdown: 30s hard timeout para BullMQ drain

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
pnpm test                 # Vitest (~570 tests)
pnpm test:e2e             # E2E tests
pnpm test:cov             # Coverage

# Build & Deploy
pnpm build                # nest build
pnpm lint                 # ESLint
pnpm format               # Prettier
pnpm start:prod           # Producción
```

## Documentación Detallada

| Tema | Archivo | Contenido |
|------|---------|-----------|
| Arquitectura | [`docs/claude/architecture.md`](docs/claude/architecture.md) | Estructura de módulos, flujo de emisión, constantes SUNAT, colas BullMQ |
| API | [`docs/claude/api-spec.md`](docs/claude/api-spec.md) | Stack tecnológico completo, 52 endpoints con decoradores |
| Base de datos | [`docs/claude/database.md`](docs/claude/database.md) | Schema Prisma completo, migraciones, seed data |
| Deployment | [`docs/claude/deployment.md`](docs/claude/deployment.md) | Variables de entorno, Docker Compose, Dockerfile |
| Convenciones | [`docs/claude/conventions.md`](docs/claude/conventions.md) | Reglas de desarrollo, seguridad, notas técnicas, archivos de test |

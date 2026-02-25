# Convenciones y Reglas — FacturaPE Backend

## Reglas Generales

- TypeScript estricto (`strict: true`, `strictPropertyInitialization: false`)
- ESM modules (`"type": "module"` en package.json)
- Module/moduleResolution: `NodeNext`, target: `ES2022`
- Imports con extensión `.js` (requerido por Prisma 7 ESM)
- Path aliases: `@common/*`, `@modules/*`, `@config/*`, `@generated/*`
- Usar `pnpm` como package manager (>=9.0.0)
- Convención snake_case en BD, camelCase en código TS
- Todos los endpoints bajo `/api/v1/`
- Respuestas API: `{ success: boolean, data?: T, error?: { code, message } }`
- Logging: pino (pino-pretty en dev, JSON estructurado en prod)

## Autenticación

- JWT access token: 15 min, refresh token: 7 días (rotation)
- API Keys: hash SHA-256, prefijo de 8 chars para identificar
- Guards en orden: TenantThrottlerGuard → JwtAuthGuard → ApiKeyGuard → TenantGuard → RolesGuard

## Multi-tenancy

- Cada request DEBE resolver un companyId (del JWT o API Key)
- CLS (nestjs-cls) almacena tenantId en AsyncLocalStorage
- Prisma Client Extension ejecuta SET tenancy.tenant_id antes de cada query
- RLS policies en PostgreSQL filtran automáticamente
- `@SkipTenant()` decorator para rutas sin contexto de empresa

## XML/SUNAT

- **9 tipos de documento**: Factura (01), Boleta (03), NC (07), ND (08), GRE (09), CRE (20), CPE (40), RC, RA
- **5 documentos síncronos SOAP invoice** (sendBill → invoice endpoint): 01, 03, 07, 08
- **2 documentos síncronos SOAP retention** (sendBill → retention endpoint): 20, 40
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

## Seguridad

- Certificados .pfx cifrados con AES-256-GCM antes de almacenar en BD
- Claves SOL cifradas con AES-256-GCM (con IV y authTag separados)
- Master key en variable de entorno `ENCRYPTION_KEY` (32 bytes hex = 64 chars)
- ENCRYPTION_KEY validado al startup (fail-fast si no es 64 hex chars)
- Rate limiting: 3 req/s burst, 20 req/10s, 100 req/min (configurable via env RATE_LIMIT_*)
- CORS configurado para dominios específicos (env CORS_ORIGIN, default localhost:3001)
- Helmet headers via @fastify/helmet (CSP environment-aware: strict en prod, relajado para Swagger en dev)
- Webhooks firmados con HMAC-SHA256
- CorrelationIdMiddleware: genera `X-Request-ID` en todas las rutas, almacenado en CLS
- Swagger: respuestas globales 401/403/429 inyectadas en todas las operaciones OpenAPI

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

### InvoiceStatus enum
```typescript
// Invoice.status es un PostgreSQL ENUM (InvoiceStatus), NO un String
// Valores: DRAFT, PENDING, QUEUED, SENDING, ACCEPTED, REJECTED, OBSERVED
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

### PDF — tasa IGV dinámica
```typescript
// Los templates PDF usan igvRate para mostrar la tasa correcta:
// 0.18 → "IGV 18%", 0.105 → "IGV 10.5%", 0.04 → "IGV 4%"
// También muestran filas para: opGratuitas, opExportacion, opIvap, igvIvap, detracción
```

### Build stale fix
Si `npx tsc --noEmit` o `nest build` da errores espurios:
```bash
rm -f tsconfig.tsbuildinfo && npx tsc --build
```

## Tests

### Archivos de test (29 spec + 4 e2e = 33 archivos, ~570 tests)

**Utilidades comunes (12 archivos):**
- `src/common/utils/__tests__/tax-calculator-detraccion.spec.ts`
- `src/common/utils/__tests__/tax-calculator-export.spec.ts`
- `src/common/utils/__tests__/tax-calculator-gratuitas.spec.ts`
- `src/common/utils/__tests__/tax-calculator-isc.spec.ts`
- `src/common/utils/__tests__/tax-calculator-ivap.spec.ts`
- `src/common/utils/__tests__/tax-calculator-mype.spec.ts`
- `src/common/utils/__tests__/peru-date.spec.ts`
- `src/common/utils/tax-calculator.spec.ts`
- `src/common/utils/amount-to-words.spec.ts`
- `src/common/utils/encryption.spec.ts`
- `src/common/utils/ruc-validator.spec.ts`
- `src/common/utils/zip.spec.ts`

**XML Builders (6 archivos):**
- `src/modules/xml-builder/builders/__tests__/credit-debit-note.spec.ts`
- `src/modules/xml-builder/builders/__tests__/invoice-builder-features.spec.ts`
- `src/modules/xml-builder/builders/__tests__/sunat-beta-integration.spec.ts`
- `src/modules/xml-builder/builders/guide.spec.ts`
- `src/modules/xml-builder/builders/retention-perception.spec.ts`
- `src/modules/xml-builder/builders/xml-builders.spec.ts`

**XML Validators (5 archivos):**
- `src/modules/xml-builder/validators/__tests__/xml-validator-complete.spec.ts`
- `src/modules/xml-builder/validators/__tests__/xml-validator-deep.spec.ts`
- `src/modules/xml-builder/validators/__tests__/xml-validator-retention-perception.spec.ts`
- `src/modules/xml-builder/validators/xml-validator.spec.ts`
- `src/modules/xml-builder/validators/xml-validator-new-docs.spec.ts`

**Servicios de módulos (6 archivos):**
- `src/modules/invoices/invoices.service.spec.ts`
- `src/modules/pdf-generator/pdf-generator.service.spec.ts`
- `src/modules/sunat-client/sunat-client.spec.ts`
- `src/modules/xml-signer/xml-signer.service.spec.ts`
- `src/modules/cdr-processor/cdr-processor.service.spec.ts`
- `src/modules/queues/processors/invoice-send.spec.ts`

**E2E (4 archivos en test/):**
- `test/auth.e2e-spec.ts`
- `test/consultations.e2e-spec.ts`
- `test/health.e2e-spec.ts`
- `test/invoices.e2e-spec.ts`
- `test/env-setup.ts` + `test/setup.ts` (archivos soporte)

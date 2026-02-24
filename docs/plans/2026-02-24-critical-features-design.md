# FacturaPE Critical Features — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all 13 missing features that block FacturaPE from full SUNAT production readiness in 2026.

**Architecture:** Layered approach — build catalog/validation foundations first, then features on top. 4 sprints, each building on the previous.

**Tech Stack:** NestJS 11 + Fastify + Prisma 7 + PostgreSQL 16 + BullMQ + xmlbuilder2

**SUNAT Rules Updated:** February 2026 (IGV 10.5% restaurantes, OBS-3496, ERR-3291 tolerances)

---

## Sprint 1 — Foundations: Catálogos + Validación + DB Schema

### 1.1 Catálogos SUNAT completos

**File:** `src/common/constants/index.ts`

Add the following new catalogs:

#### Catálogo 12 — Documentos Relacionados Tributarios

| Code | Description |
|------|-------------|
| 01 | Factura - emitida para corregir error en el RUC |
| 02 | Factura - emitida por anticipos |
| 03 | Boleta de Venta - emitida por anticipos |
| 04 | Ticket de Salida - ENAPU |
| 05 | Código SCOP |
| 06 | Factura electrónica remitente |
| 07 | Guía de remisión remitente |
| 08 | Declaración de salida del depósito franco |
| 09 | Declaración simplificada de importación |
| 10 | Liquidación de compra - emitida por anticipos |
| 99 | Otros |

#### Catálogo 59 — Medios de Pago

| Code | Description |
|------|-------------|
| 001 | Depósito en cuenta |
| 002 | Giro |
| 003 | Transferencia de fondos |
| 004 | Orden de pago |
| 005 | Tarjeta de débito |
| 006 | Tarjeta de crédito (empresa del sistema financiero) |
| 007 | Cheques con cláusula "no negociable" |
| 008 | Efectivo (sin obligación de medio de pago) |
| 009 | Efectivo (demás casos) |
| 010 | Medios de pago comercio exterior |
| 011 | Documentos EDPYME y cooperativas |
| 012 | Tarjeta de crédito (empresa no del sistema financiero) |
| 013 | Tarjetas de crédito exterior (bancarias no domiciliadas) |
| 101 | Transferencias - Comercio exterior |
| 102 | Cheques bancarios - Comercio exterior |
| 103 | Orden de pago simple - Comercio exterior |
| 104 | Orden de pago documentario - Comercio exterior |
| 105 | Remesa simple - Comercio exterior |
| 106 | Remesa documentaria - Comercio exterior |
| 107 | Carta de crédito simple - Comercio exterior |
| 108 | Carta de crédito documentario - Comercio exterior |
| 999 | Otros medios de pago |

#### Catálogo 51 — Expansión Tipo Operación

Add export codes:
- 0200: Exportación de Bienes
- 0201: Exportación de Servicios - Prestación en país
- 0202: Exportación de Servicios - Hospedaje No Domiciliados
- 0203: Exportación de Servicios - Transporte navieras
- 0204: Exportación de Servicios - Paquete turístico
- 0205: Exportación de Servicios - Energía eléctrica
- 0206: Exportación de Servicios - Otros (Ap. 1, Ley 29646)
- 0207: Exportación de Servicios - Reparación bienes muebles
- 0208: Exportación de Servicios - Otros

#### Detracción Rates (SUNAT 2025-2026)

Map<código, { descripcion, tasa, anexo }>:

**Anexo I:**
- 001: Azúcar y melaza (10%)
- 003: Alcohol etílico (10%)

**Anexo II (Bienes):**
- 004: Recursos hidrobiológicos (4%)
- 005: Maíz amarillo duro (4%)
- 008: Madera (4%)
- 009: Arena y piedra (10%)
- 010: Residuos/subproductos/desechos (15%)
- 013: Caña de azúcar (10%)
- 014: Carne y despojos comestibles (4%)
- 016: Aceite de pescado (10%)
- 017: Harina/polvo/pellets de pescado (4%)
- 023: Leche (4%)
- 031: Oro gravado con IGV (10%)
- 032: Páprika y capsicum (10%)
- 034: Minerales metálicos no auríferos (10%)
- 035: Bienes exonerados del IGV (1.5%)
- 036: Oro y demás minerales exonerados (1.5%)
- 039: Minerales no metálicos (10%)
- 041: Plomo (15%)

**Anexo III (Servicios):**
- 012: Intermediación laboral y tercerización (12%)
- 019: Arrendamiento de bienes (10%)
- 020: Mantenimiento y reparación (12%)
- 021: Movimiento de carga (10%)
- 022: Otros servicios empresariales (12%)
- 024: Comisión mercantil (10%)
- 025: Fabricación por encargo (10%)
- 026: Transporte de personas (10%)
- 027: Transporte de carga (4%)
- 030: Contratos de construcción (4%)
- 037: Demás servicios gravados con IGV (12%)

#### Nuevas constantes

```typescript
IGV_RESTAURANT_RATE = 0.105;      // MYPE restaurantes/hoteles 2026
DETRACCION_THRESHOLD = 700;        // S/ mínimo Anexo 2/3
DETRACCION_THRESHOLD_TRANSPORT = 400; // Transporte terrestre
DETRACCION_THRESHOLD_ANNEX1_UIT_FRACTION = 0.5; // ½ UIT para Anexo 1
```

### 1.2 Validación XML profunda

**File:** `src/modules/xml-builder/validators/xml-validator.ts`

New validation rules:

1. **IGV tolerance (ERR-3291):** |calculated_igv - declared_igv| <= 1.00
2. **IGV rate validation:** Accept 0%, 10%, 10.5%, 18% (Feb 2026)
3. **Sum consistency:** sum(items.valorVenta por tipo) ≈ header totals (±1 sol)
4. **Product code (OBS-3496):** If codigoSunat provided, must be 8-digit numeric, not 00000000/99999999
5. **Detracción threshold:** If codigoDetraccion present, totalVenta >= S/700
6. **Detracción rate:** porcentajeDetraccion must equal DETRACCION_RATES[codigo]
7. **Anticipos sum:** sum(anticipos.monto) <= totalVenta
8. **Anticipos currency:** Each anticipo.moneda must match invoice moneda

### 1.3 DB Schema migration

**File:** `prisma/schema.prisma` + migration

New optional columns on Invoice model:

```prisma
codigoDetraccion      String?  @map("codigo_detraccion")
porcentajeDetraccion  Decimal? @map("porcentaje_detraccion") @db.Decimal(5,4)
montoDetraccion       Decimal? @map("monto_detraccion") @db.Decimal(12,2)
cuentaDetraccion      String?  @map("cuenta_detraccion")
anticiposData         Json?    @map("anticipos_data")
docsRelacionadosData  Json?    @map("docs_relacionados_data")
opExportacion         Decimal  @default(0) @map("op_exportacion") @db.Decimal(12,2)
```

---

## Sprint 2 — Critical Features: Detracciones + Anticipos

### 2.1 Detracciones complete flow

**Files modified:**
- `src/common/utils/tax-calculator.ts` — Add `getDetraccionRate()`, `calculateDetraccion()`
- `src/modules/invoices/dto/create-invoice.dto.ts` — Add medioPago field, validate codigo against Cat 54
- `src/modules/invoices/invoices.service.ts` — Auto-calculate monto, validate rate, persist to DB
- `src/modules/xml-builder/builders/invoice.builder.ts` — Use Cat 59 for PaymentMeansCode, auto-add leyenda 2006
- `src/modules/xml-builder/validators/xml-validator.ts` — Threshold + rate validation

**Logic:**
1. If `dto.codigoDetraccion` is provided:
   - Look up official rate from `DETRACCION_RATES[codigo]`
   - If user provided `porcentajeDetraccion`, validate it matches official rate
   - If user didn't provide `montoDetraccion`, auto-calculate: `totalVenta * rate`
   - Set `tipoOperacion = '1001'` automatically
   - Require `cuentaDetraccion` (Banco de la Nación account)
   - Add leyenda 2006: "Operación sujeta a detracción"
   - `medioPago` defaults to '001' (depósito en cuenta) if not specified

### 2.2 Anticipos complete flow

**Files modified:**
- `src/common/utils/tax-calculator.ts` — Add `calculatePayableWithAnticipos()`
- `src/modules/invoices/dto/create-invoice.dto.ts` — Validate anticipo.tipoDoc against Cat 12
- `src/modules/invoices/invoices.service.ts` — Validate sum <= totalVenta, persist JSON
- `src/modules/xml-builder/builders/invoice.builder.ts` — Verify PrepaidPayment XML structure
- `src/modules/xml-builder/validators/xml-validator.ts` — Sum + currency validation

**Logic:**
1. Validate each anticipo:
   - `tipoDoc` must be in Cat 12 (02 for factura anticipos, 03 for boleta anticipos)
   - `moneda` must match invoice `moneda` (or default to invoice currency)
   - `monto` must be > 0
2. Aggregate check: `sum(anticipos.monto) <= totalVenta`
3. PayableAmount in XML = `totalVenta - sum(anticipos.monto)`
4. Persist anticipos as JSON in `anticipos_data` column

---

## Sprint 3 — High Priority Features

### 3.1 Consulta CDR

**New endpoint:** `GET /api/v1/invoices/consulta-cdr`
**Query params:** `ruc`, `tipo`, `serie`, `correlativo`

**Files:**
- `src/modules/sunat-client/sunat-client.service.ts` — Add `consultCdr()` method
- `src/modules/invoices/invoices.controller.ts` — New endpoint
- `src/modules/invoices/invoices.service.ts` — Orchestration

Uses SOAP `getStatusCdr` operation on `PRODUCTION.CONSULT_CDR` endpoint.

### 3.2 Anulación GRE

**New endpoint:** `POST /api/v1/invoices/:id/anular-guia`
**Body:** `{ motivo: string }`

**Files:**
- `src/modules/invoices/invoices.controller.ts` — New endpoint
- `src/modules/invoices/invoices.service.ts` — Load invoice, validate it's a GRE, call anularGuia
- `src/modules/invoices/dto/` — New `anular-guia.dto.ts`

### 3.3 ISC complete (3 calculation systems)

**Files:**
- `src/modules/invoices/dto/invoice-item.dto.ts` — Add `sistemaIsc?: string` field ('01'|'02'|'03')
- `src/common/utils/tax-calculator.ts` — Update ISC calculation:
  - '01' (Sistema al valor): ISC = baseImponible * tasaISC
  - '02' (Específico): ISC = cantidad * montoFijoISC
  - '03' (Al precio de venta al público): ISC = PVP * factor / (1 + factor) - baseImponible
- `src/modules/xml-builder/builders/invoice.builder.ts` — Generate correct TierRange for ISC system

### 3.4 IVAP full workflow

**Files:**
- Verify `tax-calculator.ts` handles tipo 17 correctly (4% rate, tributo 1016)
- `src/modules/xml-builder/builders/invoice.builder.ts` — Verify TaxScheme ID=1016, name=IVAP
- Auto-add leyenda 2007 for IVAP invoices
- Special detracción rate for arroz pilado: 3.85%

---

## Sprint 4 — Medium Priority Features

### 4.1 Export invoice (0200-0208)

**Files:**
- `src/modules/invoices/dto/create-invoice.dto.ts` — Accept tipoOperacion 0200-0208
- `src/common/utils/tax-calculator.ts` — Handle tipoAfectacion '40' (exportación, 0% IGV)
- `src/modules/xml-builder/builders/invoice.builder.ts` — Add opExportacion total, TaxScheme 9995
- `src/modules/invoices/invoices.service.ts` — Handle export totals, persist opExportacion
- `src/modules/xml-builder/validators/xml-validator.ts` — Export-specific rules

**Key rules:**
- All items must have tipoAfectacion '40'
- IGV = 0 for all items
- Client can have tipoDoc '0' (sin documento) with numDoc '-'
- TaxScheme 9995 (Exportación)
- opExportacion = sum of item valorVenta

### 4.2 Batch operations

**New endpoint:** `POST /api/v1/invoices/batch`
**Body:** Array of invoice DTOs (max 50 per batch)

**Files:**
- `src/modules/invoices/invoices.controller.ts` — New endpoint
- `src/modules/invoices/invoices.service.ts` — `createBatch()` method
- `src/modules/queues/` — Process via existing invoice-send queue

**Logic:**
- Validate all DTOs upfront, reject entire batch if any invalid
- Create all invoices with DRAFT status
- Enqueue each to invoice-send queue
- Return array of {invoiceId, serie, correlativo, status: 'QUEUED'}

### 4.3 Gratuitous operations complete

**Files:**
- `src/common/utils/tax-calculator.ts` — Distinguish gravado-gratuito (11-16) vs inafecto-gratuito (31-37)
- `src/modules/xml-builder/builders/invoice.builder.ts` — Add valorReferencial for free items, auto-leyenda 1002/2001
- `src/modules/xml-builder/validators/xml-validator.ts` — Validate valorReferencial > 0 for free items

**Key rules:**
- Types 11-16: IGV calculated (charged to issuer, not buyer). precioUnitario = 0
- Types 31-37: No IGV. precioUnitario = 0
- Both: Must have valorReferencial > 0 (market value)
- Auto-add leyenda "TRANSFERENCIA GRATUITA" (Cat 52: 1002 for factura, 2001 for boleta)

### 4.4 Dashboard/reportes

**New endpoints:**
- `GET /api/v1/dashboard/summary` — Counts by status, period, document type
- `GET /api/v1/dashboard/monthly-report` — Aggregated data for PDT 621

**Files:**
- New `src/modules/dashboard/` module
- Prisma aggregation queries grouped by companyId + period

### 4.5 Test coverage expansion

**New test files:**
- `src/modules/xml-builder/builders/__tests__/invoice.builder.spec.ts`
- `src/modules/xml-builder/builders/__tests__/credit-note.builder.spec.ts`
- `src/modules/xml-builder/builders/__tests__/debit-note.builder.spec.ts`
- `src/modules/xml-builder/validators/__tests__/xml-validator.spec.ts`
- `src/common/utils/__tests__/tax-calculator.spec.ts`
- `test/e2e/invoice-flow.e2e-spec.ts`

**Coverage targets:**
- XML builders: 80%+ line coverage
- Tax calculator: 95%+ (critical math)
- Validators: 90%+ (SUNAT rules)
- E2E: Happy path for each of the 9 CPE types

---

## Data Sources (Feb 2026)

- UIT 2026: S/ 5,500 (D.S. 301-2025-EF)
- ICBPER: S/ 0.50/bolsa (unchanged since 2023)
- IGV standard: 18%
- IGV restaurantes MYPE: 10.5% (Ley 32357, desde 01/01/2026)
- IVAP: 4% (unchanged)
- Detracciones: Rates per R.S. 071-2018/SUNAT (last update)
- Validation rules: SUNAT update Feb 15, 2026 (ERR-3291, OBS-3496)

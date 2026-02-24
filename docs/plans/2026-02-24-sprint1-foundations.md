# Sprint 1 — Foundations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all SUNAT catalogs, add deep XML validation rules (Feb 2026), and add DB columns for detracción/anticipo persistence.

**Architecture:** Add missing catalogs to constants, enhance xml-validator with SUNAT Feb 2026 tolerance rules, and create Prisma migration for new Invoice columns.

**Tech Stack:** TypeScript, Prisma 7, PostgreSQL 16, Vitest

---

### Task 1: Add Catálogo 12 — Documentos Relacionados

**Files:**
- Modify: `src/common/constants/index.ts:168` (after CODIGO_DETRACCION)

**Step 1: Add the catalog constant**

Add after line 168 (after CODIGO_DETRACCION block):

```typescript
/** Catálogo 12 — Documentos relacionados tributarios */
export const TIPO_DOCUMENTO_RELACIONADO = {
  FACTURA_CORRECCION_RUC: '01',
  FACTURA_ANTICIPOS: '02',
  BOLETA_ANTICIPOS: '03',
  TICKET_ENAPU: '04',
  CODIGO_SCOP: '05',
  FACTURA_ELECTRONICA_REMITENTE: '06',
  GUIA_REMISION_REMITENTE: '07',
  DECLARACION_DEPOSITO_FRANCO: '08',
  DECLARACION_SIMPLIFICADA_IMPORTACION: '09',
  LIQUIDACION_COMPRA_ANTICIPOS: '10',
  OTROS: '99',
} as const;
```

**Step 2: Run TypeScript compilation to verify**

Run: `cd /c/Users/FRANCIS/Downloads/FACTANII && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/common/constants/index.ts
git commit -m "feat(constants): add Catálogo 12 — documentos relacionados"
```

---

### Task 2: Add Catálogo 59 — Medios de Pago

**Files:**
- Modify: `src/common/constants/index.ts` (after Catálogo 12)

**Step 1: Add the catalog constant**

```typescript
/** Catálogo 59 — Medios de pago */
export const MEDIO_PAGO = {
  DEPOSITO_EN_CUENTA: '001',
  GIRO: '002',
  TRANSFERENCIA_FONDOS: '003',
  ORDEN_PAGO: '004',
  TARJETA_DEBITO: '005',
  TARJETA_CREDITO_NACIONAL: '006',
  CHEQUE_NO_NEGOCIABLE: '007',
  EFECTIVO_SIN_OBLIGACION: '008',
  EFECTIVO_OTROS: '009',
  MEDIOS_COMERCIO_EXTERIOR: '010',
  DOCUMENTOS_EDPYME_COOPERATIVAS: '011',
  TARJETA_CREDITO_NO_FINANCIERA: '012',
  TARJETA_CREDITO_EXTERIOR: '013',
  TRANSFERENCIA_COMERCIO_EXTERIOR: '101',
  CHEQUE_BANCARIO_COMERCIO_EXTERIOR: '102',
  ORDEN_PAGO_SIMPLE_EXTERIOR: '103',
  ORDEN_PAGO_DOCUMENTARIO_EXTERIOR: '104',
  REMESA_SIMPLE_EXTERIOR: '105',
  REMESA_DOCUMENTARIA_EXTERIOR: '106',
  CARTA_CREDITO_SIMPLE_EXTERIOR: '107',
  CARTA_CREDITO_DOCUMENTARIO_EXTERIOR: '108',
  OTROS: '999',
} as const;
```

**Step 2: Run TypeScript compilation to verify**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/common/constants/index.ts
git commit -m "feat(constants): add Catálogo 59 — medios de pago"
```

---

### Task 3: Expand Catálogo 51 — Tipos de Operación (exportación)

**Files:**
- Modify: `src/common/constants/index.ts:115-130` (TIPO_OPERACION section)

**Step 1: Add export operation codes**

Add to the existing TIPO_OPERACION object (around line 115-130):

```typescript
// Exportación (0200-0208)
EXPORTACION_BIENES: '0200',
EXPORTACION_SERVICIOS_PAIS: '0201',
EXPORTACION_SERVICIOS_HOSPEDAJE: '0202',
EXPORTACION_SERVICIOS_TRANSPORTE: '0203',
EXPORTACION_SERVICIOS_TURISTICO: '0204',
EXPORTACION_SERVICIOS_ENERGIA: '0205',
EXPORTACION_SERVICIOS_LEY29646: '0206',
EXPORTACION_SERVICIOS_REPARACION: '0207',
EXPORTACION_SERVICIOS_OTROS: '0208',
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/common/constants/index.ts
git commit -m "feat(constants): expand Catálogo 51 with export operation codes 0200-0208"
```

---

### Task 4: Add Detracción Rate Lookup Map

**Files:**
- Modify: `src/common/constants/index.ts` (after CODIGO_DETRACCION)

**Step 1: Add the rate map and threshold constants**

```typescript
/** Tasas oficiales de detracción SUNAT por código (Cat 54) — vigentes 2025-2026 */
export const DETRACCION_RATES: Record<string, number> = {
  // Anexo I — Bienes (venta gravada con IGV)
  '001': 0.10,  // Azúcar y melaza de caña
  '003': 0.10,  // Alcohol etílico
  // Anexo II — Bienes sujetos al SPOT
  '004': 0.04,  // Recursos hidrobiológicos
  '005': 0.04,  // Maíz amarillo duro
  '008': 0.04,  // Madera
  '009': 0.10,  // Arena y piedra
  '010': 0.15,  // Residuos, subproductos, desechos, recortes
  '013': 0.10,  // Caña de azúcar
  '014': 0.04,  // Carne y despojos comestibles
  '016': 0.10,  // Aceite de pescado
  '017': 0.04,  // Harina, polvo y pellets de pescado
  '023': 0.04,  // Leche
  '031': 0.10,  // Oro gravado con IGV
  '032': 0.10,  // Páprika y capsicum
  '034': 0.10,  // Minerales metálicos no auríferos
  '035': 0.015, // Bienes exonerados del IGV
  '036': 0.015, // Oro y demás minerales metalicos exonerados del IGV
  '039': 0.10,  // Minerales no metálicos
  '041': 0.15,  // Plomo
  // Anexo III — Servicios
  '012': 0.12,  // Intermediación laboral y tercerización
  '019': 0.10,  // Arrendamiento de bienes
  '020': 0.12,  // Mantenimiento y reparación de bienes muebles
  '021': 0.10,  // Movimiento de carga
  '022': 0.12,  // Otros servicios empresariales
  '024': 0.10,  // Comisión mercantil
  '025': 0.10,  // Fabricación de bienes por encargo
  '026': 0.10,  // Servicio de transporte de personas
  '027': 0.04,  // Servicio de transporte de carga
  '030': 0.04,  // Contratos de construcción
  '037': 0.12,  // Demás servicios gravados con el IGV
};

/** Umbral mínimo para detracción — Anexo 2 y 3 (S/) */
export const DETRACCION_THRESHOLD = 700;

/** Umbral mínimo para detracción — transporte terrestre de bienes (S/) */
export const DETRACCION_THRESHOLD_TRANSPORT = 400;

/** Fracción UIT para umbral Anexo 1 (½ UIT) */
export const DETRACCION_THRESHOLD_ANNEX1_UIT_FRACTION = 0.5;

/** Tasa IGV reducida para MYPE restaurantes y hoteles (Ley 32357, desde 01/01/2026) */
export const IGV_RESTAURANT_RATE = 0.105;
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/common/constants/index.ts
git commit -m "feat(constants): add detracción rate lookup map and threshold constants (SUNAT 2025-2026)"
```

---

### Task 5: Add Tax Calculator Detracción Helpers

**Files:**
- Modify: `src/common/utils/tax-calculator.ts` (add after calculateInvoiceTotals)
- Test: `src/common/utils/__tests__/tax-calculator-detraccion.spec.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getDetraccionRate,
  calculateDetraccionAmount,
  isDetraccionRequired,
} from '../tax-calculator.js';

describe('Detracción helpers', () => {
  describe('getDetraccionRate', () => {
    it('returns official rate for Anexo III services (12%)', () => {
      expect(getDetraccionRate('037')).toBe(0.12);
      expect(getDetraccionRate('012')).toBe(0.12);
    });

    it('returns official rate for Anexo II goods (4%)', () => {
      expect(getDetraccionRate('004')).toBe(0.04);
      expect(getDetraccionRate('027')).toBe(0.04);
    });

    it('returns official rate for Anexo I (10%)', () => {
      expect(getDetraccionRate('001')).toBe(0.10);
    });

    it('returns undefined for unknown code', () => {
      expect(getDetraccionRate('999')).toBeUndefined();
    });
  });

  describe('calculateDetraccionAmount', () => {
    it('calculates detracción for S/1000 service at 12%', () => {
      expect(calculateDetraccionAmount('037', 1000)).toBe(120);
    });

    it('calculates detracción for S/5000 resource at 4%', () => {
      expect(calculateDetraccionAmount('004', 5000)).toBe(200);
    });

    it('rounds to 2 decimals', () => {
      expect(calculateDetraccionAmount('037', 333.33)).toBe(40);
    });

    it('returns 0 for unknown code', () => {
      expect(calculateDetraccionAmount('999', 1000)).toBe(0);
    });
  });

  describe('isDetraccionRequired', () => {
    it('returns true when totalVenta >= 700 for services', () => {
      expect(isDetraccionRequired(700, '037')).toBe(true);
      expect(isDetraccionRequired(1000, '012')).toBe(true);
    });

    it('returns false when totalVenta < 700 for services', () => {
      expect(isDetraccionRequired(699.99, '037')).toBe(false);
    });

    it('returns true when totalVenta >= 400 for transport', () => {
      expect(isDetraccionRequired(400, '027')).toBe(true);
    });

    it('returns false when totalVenta < 400 for transport', () => {
      expect(isDetraccionRequired(399, '027')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-detraccion.spec.ts`
Expected: FAIL — functions not exported

**Step 3: Implement the functions**

Add to `src/common/utils/tax-calculator.ts` (after calculateInvoiceTotals, around line 272):

```typescript
import {
  DETRACCION_RATES,
  DETRACCION_THRESHOLD,
  DETRACCION_THRESHOLD_TRANSPORT,
} from '../constants/index.js';

/**
 * Get the official SUNAT detracción rate for a given commodity/service code.
 * Returns undefined if the code is not in Catálogo 54.
 */
export function getDetraccionRate(codigo: string): number | undefined {
  return DETRACCION_RATES[codigo];
}

/**
 * Calculate the detracción amount based on the official SUNAT rate.
 * Returns 0 if the code is not recognized.
 */
export function calculateDetraccionAmount(codigo: string, totalVenta: number): number {
  const rate = DETRACCION_RATES[codigo];
  if (!rate) return 0;
  return round2(totalVenta * rate);
}

/**
 * Check if detracción is required based on the total amount and commodity code.
 * Uses SUNAT threshold rules:
 * - Transport (027): >= S/400
 * - All others: >= S/700
 */
export function isDetraccionRequired(totalVenta: number, codigo: string): boolean {
  const threshold = codigo === '027' ? DETRACCION_THRESHOLD_TRANSPORT : DETRACCION_THRESHOLD;
  return totalVenta >= threshold;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-detraccion.spec.ts`
Expected: All tests PASS

**Step 5: Run all existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All 322+ tests PASS

**Step 6: Commit**

```bash
git add src/common/utils/tax-calculator.ts src/common/utils/__tests__/tax-calculator-detraccion.spec.ts
git commit -m "feat(tax): add detracción rate lookup, calculation, and threshold helpers with tests"
```

---

### Task 6: Deep XML Validation — IGV Tolerance + Sum Consistency

**Files:**
- Modify: `src/modules/xml-builder/validators/xml-validator.ts:59-189` (validateInvoice method)
- Test: `src/modules/xml-builder/validators/__tests__/xml-validator-deep.spec.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { XmlValidator } from '../xml-validator.js';

describe('XmlValidator — deep validation (Feb 2026)', () => {
  const validator = new XmlValidator();

  const makeValidInvoice = (overrides = {}) => ({
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    tipoOperacion: '0101',
    fechaEmision: new Date().toISOString().split('T')[0],
    moneda: 'PEN',
    company: {
      ruc: '20000000001',
      razonSocial: 'Test SAC',
      direccion: 'Av Test 123',
      ubigeo: '150101',
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'Lima',
    },
    client: { tipoDoc: '6', numDoc: '20100000002', nombre: 'Cliente SAC' },
    items: [{
      cantidad: 10, valorUnitario: 100, tipoAfectacion: '10',
      descripcion: 'Servicio', unidadMedida: 'ZZ',
      precioUnitario: 118, valorVenta: 1000, igv: 180,
      isc: 0, icbper: 0, descuento: 0,
    }],
    opGravadas: 1000, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
    igv: 180, isc: 0, icbper: 0, otrosCargos: 0, descuentoGlobal: 0,
    totalVenta: 1180,
    formaPago: { tipo: 'Contado' },
    montoEnLetras: 'MIL CIENTO OCHENTA CON 00/100 SOLES',
    ...overrides,
  });

  describe('IGV tolerance (ERR-3291)', () => {
    it('accepts when sum of item IGV equals header IGV', () => {
      const errors = validator.validateInvoice(makeValidInvoice());
      expect(errors).toHaveLength(0);
    });

    it('accepts when IGV differs by exactly 1 sol (tolerance)', () => {
      const invoice = makeValidInvoice({ igv: 181 }); // off by 1
      const errors = validator.validateInvoice(invoice);
      const igvErrors = errors.filter(e => e.field === 'igv' && e.message.includes('tolerancia'));
      expect(igvErrors).toHaveLength(0);
    });

    it('rejects when IGV differs by more than 1 sol', () => {
      const invoice = makeValidInvoice({ igv: 185 }); // off by 5
      const errors = validator.validateInvoice(invoice);
      const igvErrors = errors.filter(e => e.field === 'igv');
      expect(igvErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Sum consistency', () => {
    it('rejects when opGravadas does not match sum of gravado items', () => {
      const invoice = makeValidInvoice({ opGravadas: 500 }); // should be 1000
      const errors = validator.validateInvoice(invoice);
      const sumErrors = errors.filter(e => e.field === 'opGravadas');
      expect(sumErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Product code validation (OBS-3496)', () => {
    it('accepts valid 8-digit product code', () => {
      const invoice = makeValidInvoice({
        items: [{
          cantidad: 1, valorUnitario: 100, tipoAfectacion: '10',
          descripcion: 'Test', unidadMedida: 'NIU', codigoSunat: '10101501',
          precioUnitario: 118, valorVenta: 100, igv: 18, isc: 0, icbper: 0, descuento: 0,
        }],
        opGravadas: 100, igv: 18, totalVenta: 118,
      });
      const errors = validator.validateInvoice(invoice);
      const codeErrors = errors.filter(e => e.message.includes('codigoSunat'));
      expect(codeErrors).toHaveLength(0);
    });

    it('rejects product code 00000000', () => {
      const invoice = makeValidInvoice({
        items: [{
          cantidad: 1, valorUnitario: 100, tipoAfectacion: '10',
          descripcion: 'Test', unidadMedida: 'NIU', codigoSunat: '00000000',
          precioUnitario: 118, valorVenta: 100, igv: 18, isc: 0, icbper: 0, descuento: 0,
        }],
        opGravadas: 100, igv: 18, totalVenta: 118,
      });
      const errors = validator.validateInvoice(invoice);
      const codeErrors = errors.filter(e => e.message.includes('codigoSunat'));
      expect(codeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Detracción threshold', () => {
    it('rejects detracción when totalVenta < S/700', () => {
      const invoice = makeValidInvoice({
        tipoOperacion: '1001',
        totalVenta: 500,
        codigoDetraccion: '037',
        porcentajeDetraccion: 0.12,
        montoDetraccion: 60,
        cuentaDetraccion: '00-000-000001',
      });
      const errors = validator.validateInvoice(invoice);
      const thresholdErrors = errors.filter(e => e.message.includes('umbral'));
      expect(thresholdErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Anticipos validation', () => {
    it('rejects when sum of anticipos exceeds totalVenta', () => {
      const invoice = makeValidInvoice({
        anticipos: [
          { tipoDoc: '02', serie: 'F001', correlativo: 1, moneda: 'PEN', monto: 2000, fechaPago: '2026-01-15' },
        ],
      });
      const errors = validator.validateInvoice(invoice);
      const antiErrors = errors.filter(e => e.field === 'anticipos');
      expect(antiErrors.length).toBeGreaterThan(0);
    });

    it('rejects when anticipo currency differs from invoice', () => {
      const invoice = makeValidInvoice({
        anticipos: [
          { tipoDoc: '02', serie: 'F001', correlativo: 1, moneda: 'USD', monto: 100, fechaPago: '2026-01-15' },
        ],
      });
      const errors = validator.validateInvoice(invoice);
      const currencyErrors = errors.filter(e => e.message.includes('moneda'));
      expect(currencyErrors.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/xml-builder/validators/__tests__/xml-validator-deep.spec.ts`
Expected: FAIL — new validations don't exist yet

**Step 3: Implement the deep validations**

In `src/modules/xml-builder/validators/xml-validator.ts`, add inside `validateInvoice()` method (before the return statement, around line 185):

```typescript
// --- Deep validations (SUNAT Feb 2026) ---

// IGV tolerance check (ERR-3291): |sum(item.igv) - header.igv| <= 1
const sumItemIgv = (data.items || []).reduce((acc, item) => acc + (item.igv || 0), 0);
if (Math.abs(sumItemIgv - (data.igv || 0)) > 1) {
  errors.push({
    field: 'igv',
    message: `IGV total (${data.igv}) difiere de la suma de items (${sumItemIgv.toFixed(2)}) por más de la tolerancia permitida (±1 sol)`,
  });
}

// Sum consistency: opGravadas must match sum of gravado items (±1 tolerance)
const sumGravadas = (data.items || [])
  .filter((_item: any, i: number) => {
    const tipo = data.items[i]?.tipoAfectacion ?? '10';
    const code = parseInt(tipo, 10);
    return code >= 10 && code <= 19;
  })
  .reduce((acc: number, item: any) => acc + (item.valorVenta || 0), 0);
if (Math.abs(sumGravadas - (data.opGravadas || 0)) > 1) {
  errors.push({
    field: 'opGravadas',
    message: `opGravadas (${data.opGravadas}) difiere de la suma de items gravados (${sumGravadas.toFixed(2)}) por más de ±1 sol`,
  });
}

// Product code validation (OBS-3496): if codigoSunat provided, 8-digit numeric, not 00000000/99999999
for (const [idx, item] of (data.items || []).entries()) {
  if (item.codigoSunat) {
    if (!/^\d{8}$/.test(item.codigoSunat)) {
      errors.push({
        field: `items[${idx}].codigoSunat`,
        message: `codigoSunat debe ser numérico de 8 dígitos, recibido: ${item.codigoSunat}`,
      });
    } else if (item.codigoSunat === '00000000' || item.codigoSunat === '99999999') {
      errors.push({
        field: `items[${idx}].codigoSunat`,
        message: `codigoSunat no puede ser 00000000 ni 99999999`,
      });
    }
  }
}

// Detracción threshold: totalVenta must meet minimum (S/700 general, S/400 transport)
if (data.codigoDetraccion) {
  const threshold = data.codigoDetraccion === '027' ? 400 : 700;
  if ((data.totalVenta || 0) < threshold) {
    errors.push({
      field: 'totalVenta',
      message: `Factura con detracción requiere monto mínimo de S/${threshold} (umbral SUNAT). Total actual: S/${data.totalVenta}`,
    });
  }
}

// Anticipos validation
if (data.anticipos && data.anticipos.length > 0) {
  const sumAnticipos = data.anticipos.reduce((acc: number, a: any) => acc + (a.monto || 0), 0);
  if (sumAnticipos > (data.totalVenta || 0)) {
    errors.push({
      field: 'anticipos',
      message: `Suma de anticipos (${sumAnticipos}) excede el total de venta (${data.totalVenta})`,
    });
  }
  for (const [idx, anticipo] of data.anticipos.entries()) {
    if (anticipo.moneda && anticipo.moneda !== data.moneda) {
      errors.push({
        field: `anticipos[${idx}].moneda`,
        message: `Anticipo moneda (${anticipo.moneda}) debe coincidir con moneda de factura (${data.moneda})`,
      });
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/xml-builder/validators/__tests__/xml-validator-deep.spec.ts`
Expected: All tests PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/modules/xml-builder/validators/xml-validator.ts src/modules/xml-builder/validators/__tests__/xml-validator-deep.spec.ts
git commit -m "feat(validator): add deep XML validation — IGV tolerance, sum consistency, OBS-3496, detracción threshold, anticipos"
```

---

### Task 7: Prisma Migration — New Invoice Columns

**Files:**
- Modify: `prisma/schema.prisma` (Invoice model, around line 200)

**Step 1: Add new columns to Invoice model**

Add before the `// PDF` comment block (around line 205):

```prisma
  // Detracción (SPOT)
  codigoDetraccion      String?  @map("codigo_detraccion")
  porcentajeDetraccion  Decimal? @map("porcentaje_detraccion") @db.Decimal(5, 4)
  montoDetraccion       Decimal? @map("monto_detraccion") @db.Decimal(12, 2)
  cuentaDetraccion      String?  @map("cuenta_detraccion")

  // Anticipos y documentos relacionados (JSON)
  anticiposData         Json?    @map("anticipos_data")
  docsRelacionadosData  Json?    @map("docs_relacionados_data")

  // Exportación
  opExportacion         Decimal  @default(0) @map("op_exportacion") @db.Decimal(12, 2)
```

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_detraccion_anticipo_columns`
Expected: Migration created successfully

**Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: Client generated

**Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add detracción, anticipo, and export columns to Invoice model"
```

---

## Sprint 1 Summary

After completing all 7 tasks:
- All SUNAT catalogs complete (12, 59, 51 expansion, detracción rates)
- Deep XML validation with Feb 2026 rules (ERR-3291, OBS-3496)
- Detracción helpers in tax calculator with tests
- DB schema ready for detracción/anticipo persistence
- All existing + new tests passing

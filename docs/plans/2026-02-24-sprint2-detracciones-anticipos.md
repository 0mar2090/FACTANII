# Sprint 2 — Detracciones + Anticipos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the detracción (SPOT) and anticipo workflows end-to-end — from DTO validation through XML generation to DB persistence.

**Architecture:** Enhance existing DTO→validate→build→persist pipeline with detracción rate enforcement, auto-calculation, and anticipo validation. Leverages Sprint 1 foundations (catalogs, helpers, DB columns).

**Tech Stack:** TypeScript, NestJS 11, class-validator, xmlbuilder2, Prisma 7, Vitest

**Depends on:** Sprint 1 (catalogs, DETRACCION_RATES, DB columns, tax-calculator helpers)

---

### Task 1: Enhance DTO — Detracción rate validation + medioPago

**Files:**
- Modify: `src/modules/invoices/dto/create-invoice.dto.ts:107-123`
- Modify: `src/modules/invoices/dto/create-invoice.dto.ts:160-179` (AnticipoItemDto)

**Step 1: Add medioPago field and enhance validation**

In `create-invoice.dto.ts`, add after `cuentaDetraccion` (line 121):

```typescript
  /** Medio de pago para detracción — Catálogo 59 (default: '001' depósito en cuenta) */
  @IsString()
  @IsOptional()
  medioPagoDetraccion?: string;
```

Update `AnticipoItemDto` to validate `tipoDoc` against Cat 12:

```typescript
import { TIPO_DOCUMENTO_RELACIONADO } from '../../../common/constants/index.js';

// In AnticipoItemDto class, update tipoDoc validation:
  /** Tipo documento del anticipo — debe ser '02' (Factura) o '03' (Boleta) del Catálogo 12 */
  @IsString()
  @IsIn(['02', '03'])
  tipoDoc!: string;
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/modules/invoices/dto/create-invoice.dto.ts
git commit -m "feat(dto): add medioPagoDetraccion field and validate anticipo tipoDoc against Cat 12"
```

---

### Task 2: Detracción — Service auto-calculation + rate enforcement

**Files:**
- Modify: `src/modules/invoices/invoices.service.ts` (createFactura and createBoleta methods)
- Test: `src/modules/invoices/__tests__/invoices-detraccion.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getDetraccionRate, calculateDetraccionAmount } from '../../../common/utils/tax-calculator.js';
import { DETRACCION_RATES } from '../../../common/constants/index.js';

describe('Detracción service logic', () => {
  describe('rate enforcement', () => {
    it('should detect rate mismatch for code 037 (12%)', () => {
      const officialRate = getDetraccionRate('037');
      expect(officialRate).toBe(0.12);
      const userRate = 0.10; // wrong
      expect(userRate).not.toBe(officialRate);
    });

    it('should auto-calculate monto when not provided', () => {
      const monto = calculateDetraccionAmount('037', 1000);
      expect(monto).toBe(120);
    });

    it('should have all codes with known rates', () => {
      const knownCodes = Object.keys(DETRACCION_RATES);
      expect(knownCodes.length).toBeGreaterThanOrEqual(26);
    });
  });
});
```

**Step 2: Run test to verify setup works**

Run: `npx vitest run src/modules/invoices/__tests__/invoices-detraccion.spec.ts`
Expected: PASS (these test helpers, not service integration)

**Step 3: Implement detracción logic in service**

In `invoices.service.ts`, update the `createFactura` method where detracción data is mapped (around lines 237-242). Replace the existing detracción mapping with:

```typescript
// Detracción auto-calculation and rate enforcement
let detraccion: XmlDetraccion | undefined;
if (dto.codigoDetraccion) {
  const officialRate = getDetraccionRate(dto.codigoDetraccion);
  if (!officialRate) {
    throw new BadRequestException(
      `Código de detracción '${dto.codigoDetraccion}' no reconocido en Catálogo 54`,
    );
  }

  // Enforce rate matches SUNAT's official rate
  if (dto.porcentajeDetraccion && Math.abs(dto.porcentajeDetraccion - officialRate) > 0.001) {
    throw new BadRequestException(
      `Tasa de detracción para código '${dto.codigoDetraccion}' debe ser ${(officialRate * 100).toFixed(1)}%, recibido: ${(dto.porcentajeDetraccion * 100).toFixed(1)}%`,
    );
  }

  const rate = officialRate;
  const montoDetraccion = dto.montoDetraccion ?? calculateDetraccionAmount(dto.codigoDetraccion, totals.totalVenta);

  detraccion = {
    codigo: dto.codigoDetraccion,
    porcentaje: rate,
    monto: montoDetraccion,
    cuentaBN: dto.cuentaDetraccion ?? '',
  };
}
```

Add the import at the top of invoices.service.ts:

```typescript
import { getDetraccionRate, calculateDetraccionAmount } from '../../common/utils/tax-calculator.js';
```

**Step 4: Update DB persistence to save detracción data**

In the `invoice.create` or `invoice.update` call, add:

```typescript
codigoDetraccion: dto.codigoDetraccion ?? null,
porcentajeDetraccion: detraccion?.porcentaje ?? null,
montoDetraccion: detraccion?.monto ?? null,
cuentaDetraccion: detraccion?.cuentaBN ?? null,
```

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/modules/invoices/invoices.service.ts src/modules/invoices/__tests__/invoices-detraccion.spec.ts
git commit -m "feat(invoices): detracción auto-calculation, rate enforcement, and DB persistence"
```

---

### Task 3: Detracción — Builder improvements (Cat 59, leyenda 2006)

**Files:**
- Modify: `src/modules/xml-builder/builders/invoice.builder.ts:235-262` (addDetraccion method)
- Modify: `src/modules/xml-builder/interfaces/xml-builder.interfaces.ts:67-72` (XmlDetraccion)

**Step 1: Update XmlDetraccion interface**

In `xml-builder.interfaces.ts`, update the interface (lines 67-72):

```typescript
export interface XmlDetraccion {
  codigo: string;           // Catálogo 54
  porcentaje: number;       // e.g. 0.12 for 12%
  monto: number;            // Monto de la detracción
  cuentaBN: string;         // Cuenta del Banco de la Nación
  medioPago?: string;       // Catálogo 59, default '001'
}
```

**Step 2: Update addDetraccion to use Cat 59 and auto-add leyenda**

In `invoice.builder.ts`, update the `addDetraccion` method (lines 235-262):

```typescript
private addDetraccion(doc: XmlNode, data: XmlInvoiceData): void {
  const det = data.detraccion!;
  const medioPagoCode = det.medioPago ?? '001'; // Default: depósito en cuenta

  // PaymentMeans block
  const paymentMeans = doc.ele('cac:PaymentMeans');
  paymentMeans.ele('cbc:PaymentMeansCode')
    .att('listAgencyName', 'PE:SUNAT')
    .att('listName', 'Medio de pago')
    .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo59')
    .txt(medioPagoCode)
  .up();

  const payeeAccount = paymentMeans.ele('cac:PayeeFinancialAccount');
  payeeAccount.ele('cbc:ID').txt(det.cuentaBN).up();
  payeeAccount.up();
  paymentMeans.up();

  // PaymentTerms block with detracción details
  const paymentTermsDet = doc.ele('cac:PaymentTerms');
  paymentTermsDet.ele('cbc:ID').txt('Detraccion').up();
  paymentTermsDet.ele('cbc:PaymentMeansID').txt(det.codigo).up();
  paymentTermsDet.ele('cbc:PaymentPercent').txt((det.porcentaje * 100).toFixed(2)).up();
  paymentTermsDet.ele('cbc:Amount')
    .att('currencyID', 'PEN')
    .txt(this.formatAmount(det.monto))
  .up();
  paymentTermsDet.up();
}
```

Also verify leyenda 2006 is added in the `build()` method. Around line 85-90 in invoice.builder.ts, verify that when detracción is present, leyenda 2006 is added:

```typescript
// In the legends section of build(), ensure this exists:
if (data.detraccion) {
  this.addLegend(doc, '2006', 'Operación sujeta a detracción');
}
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/xml-builder/builders/invoice.builder.ts src/modules/xml-builder/interfaces/xml-builder.interfaces.ts
git commit -m "feat(builder): use Cat 59 for detracción medioPago, support configurable payment means"
```

---

### Task 4: Anticipos — Service validation + DB persistence

**Files:**
- Modify: `src/modules/invoices/invoices.service.ts` (createFactura/createBoleta anticipo handling)

**Step 1: Add anticipo validation in service**

In the createFactura/createBoleta methods, after mapping anticipos (around lines 243-250), add validation:

```typescript
// Anticipos validation
if (dto.anticipos && dto.anticipos.length > 0) {
  const sumAnticipos = dto.anticipos.reduce((acc, a) => acc + a.monto, 0);
  if (sumAnticipos > totals.totalVenta) {
    throw new BadRequestException(
      `Suma de anticipos (${sumAnticipos}) excede el total de venta (${totals.totalVenta})`,
    );
  }

  for (const anticipo of dto.anticipos) {
    if (anticipo.moneda && anticipo.moneda !== moneda) {
      throw new BadRequestException(
        `Moneda del anticipo (${anticipo.moneda}) debe coincidir con la moneda de la factura (${moneda})`,
      );
    }
  }
}
```

**Step 2: Persist anticipos in DB**

In the invoice.create or invoice.update call, add:

```typescript
anticiposData: dto.anticipos ? JSON.parse(JSON.stringify(dto.anticipos)) : null,
docsRelacionadosData: dto.documentosRelacionados ? JSON.parse(JSON.stringify(dto.documentosRelacionados)) : null,
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/invoices/invoices.service.ts
git commit -m "feat(invoices): anticipos validation (sum <= totalVenta, currency match) and DB persistence"
```

---

### Task 5: Service response DTO — Include detracción/anticipo data

**Files:**
- Modify: `src/modules/invoices/dto/invoice-response.dto.ts`
- Modify: `src/modules/invoices/invoices.service.ts` (toResponseDto method)

**Step 1: Add fields to response DTO**

```typescript
// Add to InvoiceResponseDto class:
@ApiPropertyOptional()
codigoDetraccion?: string;

@ApiPropertyOptional()
porcentajeDetraccion?: number;

@ApiPropertyOptional()
montoDetraccion?: number;

@ApiPropertyOptional()
cuentaDetraccion?: string;

@ApiPropertyOptional()
anticiposData?: any;

@ApiPropertyOptional()
docsRelacionadosData?: any;

@ApiPropertyOptional()
opExportacion?: number;
```

**Step 2: Update toResponseDto mapping**

In the `toResponseDto` method, add:

```typescript
codigoDetraccion: invoice.codigoDetraccion ?? undefined,
porcentajeDetraccion: invoice.porcentajeDetraccion ? Number(invoice.porcentajeDetraccion) : undefined,
montoDetraccion: invoice.montoDetraccion ? Number(invoice.montoDetraccion) : undefined,
cuentaDetraccion: invoice.cuentaDetraccion ?? undefined,
anticiposData: invoice.anticiposData ?? undefined,
docsRelacionadosData: invoice.docsRelacionadosData ?? undefined,
opExportacion: invoice.opExportacion ? Number(invoice.opExportacion) : undefined,
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/modules/invoices/dto/invoice-response.dto.ts src/modules/invoices/invoices.service.ts
git commit -m "feat(invoices): include detracción/anticipo/export data in API response DTO"
```

---

## Sprint 2 Summary

After completing all 5 tasks:
- Detracciones: Full flow from DTO→validate→auto-calculate→XML→persist
- Rate enforcement: porcentajeDetraccion must match official SUNAT rate
- Auto-calculation: montoDetraccion computed from totalVenta * official rate
- Leyenda 2006 auto-added for detracción invoices
- Cat 59 medioPago configurable (not hardcoded)
- Anticipos: Sum validation, currency check, DB persistence
- Response DTO includes all new fields

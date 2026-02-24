# Sprint 3 — High Priority Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Consulta CDR, Anulación GRE endpoint, complete ISC 3-system calculation, and IVAP full workflow.

**Architecture:** Add new SOAP method for CDR consultation, expose existing GRE anulación in controller, enhance tax calculator for ISC systems, and verify IVAP end-to-end.

**Tech Stack:** TypeScript, NestJS 11, node-soap, axios, xmlbuilder2, Vitest

**Depends on:** Sprint 1 (catalogs, DB columns), Sprint 2 (detracción helpers)

---

### Task 1: Consulta CDR — SOAP client method

**Files:**
- Modify: `src/modules/sunat-client/sunat-client.service.ts`
- Modify: `src/common/constants/index.ts` (verify CONSULT_CDR endpoint exists)

**Step 1: Verify endpoint constant exists**

Check that `SUNAT_ENDPOINTS.PRODUCTION.CONSULT_CDR` is defined in constants. If not, add:

```typescript
// In SUNAT_ENDPOINTS:
PRODUCTION: {
  INVOICE: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl',
  RETENTION: 'https://e-factura.sunat.gob.pe/ol-ti-itemision-otroscpe-gem/billService?wsdl',
  CONSULT_CDR: 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl',
  CONSULT_VALID: 'https://e-factura.sunat.gob.pe/ol-it-wsconsvalidcpe/billValidService?wsdl',
},
```

**Step 2: Add consultCdr method to SunatClientService**

```typescript
/**
 * Consult CDR from SUNAT for a specific document.
 * Uses getStatusCdr SOAP operation on the CONSULT_CDR endpoint.
 *
 * @param ruc - Issuer RUC
 * @param tipoDoc - Document type code (01, 03, 07, 08)
 * @param serie - Document series
 * @param correlativo - Document number
 * @param solUser - SOL username
 * @param solPass - SOL password
 */
async consultCdr(
  ruc: string,
  tipoDoc: string,
  serie: string,
  correlativo: number,
  solUser: string,
  solPass: string,
): Promise<{ success: boolean; cdrZip?: Buffer; statusCode?: string; message?: string }> {
  const endpoint = SUNAT_ENDPOINTS.PRODUCTION.CONSULT_CDR;

  try {
    const client = await this.createSoapClient(
      endpoint, ruc, solUser, solPass, false,
    );

    const result = await client.getStatusCdrAsync({
      rucComprobante: ruc,
      tipoComprobante: tipoDoc,
      serieComprobante: serie,
      numeroComprobante: String(correlativo),
    });

    const response = result?.[0]?.statusCdr ?? result?.[0];
    const statusCode = response?.statusCode ?? response?.content?.statusCode;

    if (response?.content) {
      return {
        success: true,
        cdrZip: Buffer.from(response.content, 'base64'),
        statusCode: String(statusCode),
      };
    }

    return {
      success: false,
      statusCode: String(statusCode),
      message: response?.statusMessage ?? 'CDR no disponible',
    };
  } catch (error: any) {
    return this.handleSoapError(error);
  }
}
```

**Step 3: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/modules/sunat-client/sunat-client.service.ts src/common/constants/index.ts
git commit -m "feat(sunat-client): add consultCdr SOAP method for CDR retrieval"
```

---

### Task 2: Consulta CDR — Controller endpoint + Service orchestration

**Files:**
- Modify: `src/modules/invoices/invoices.controller.ts`
- Modify: `src/modules/invoices/invoices.service.ts`
- Create: `src/modules/invoices/dto/consult-cdr.dto.ts`

**Step 1: Create DTO**

```typescript
// src/modules/invoices/dto/consult-cdr.dto.ts
import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConsultCdrDto {
  @ApiProperty({ example: '01', description: 'Tipo de documento (01, 03, 07, 08)' })
  @IsString()
  tipoDoc!: string;

  @ApiProperty({ example: 'F001' })
  @IsString()
  serie!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  correlativo!: number;
}
```

**Step 2: Add service method**

In `invoices.service.ts`, add:

```typescript
async consultCdr(companyId: string, dto: ConsultCdrDto): Promise<{
  success: boolean;
  cdrZip?: Buffer;
  statusCode?: string;
  message?: string;
}> {
  const { company, solUser, solPass } = await this.prepareDocumentContext(companyId, { skipQuota: true });

  return this.sunatClient.consultCdr(
    company.ruc,
    dto.tipoDoc,
    dto.serie,
    dto.correlativo,
    solUser,
    solPass,
  );
}
```

**Step 3: Add controller endpoint**

In `invoices.controller.ts`, add:

```typescript
@Post('consulta-cdr')
@ApiOperation({ summary: 'Consultar CDR desde SUNAT' })
async consultCdr(
  @CurrentUser() user: RequestUser,
  @Body() dto: ConsultCdrDto,
) {
  const result = await this.invoicesService.consultCdr(user.companyId, dto);
  return { success: result.success, data: result };
}
```

**Step 4: Export DTO from index**

Add `ConsultCdrDto` to `src/modules/invoices/dto/index.ts` exports.

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/modules/invoices/invoices.controller.ts src/modules/invoices/invoices.service.ts src/modules/invoices/dto/
git commit -m "feat(invoices): add POST /consulta-cdr endpoint for CDR retrieval from SUNAT"
```

---

### Task 3: Anulación GRE — Expose endpoint

**Files:**
- Modify: `src/modules/invoices/invoices.controller.ts`
- Modify: `src/modules/invoices/invoices.service.ts`
- Create: `src/modules/invoices/dto/anular-guia.dto.ts`

**Step 1: Create DTO**

```typescript
// src/modules/invoices/dto/anular-guia.dto.ts
import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnularGuiaDto {
  @ApiProperty({ example: 'Error en datos del destinatario' })
  @IsString()
  @MaxLength(500)
  motivo!: string;
}
```

**Step 2: Add service method**

```typescript
async anularGuia(companyId: string, invoiceId: string, dto: AnularGuiaDto): Promise<any> {
  const invoice = await this.prisma.client.invoice.findFirst({
    where: { id: invoiceId, companyId },
  });

  if (!invoice) {
    throw new NotFoundException('Guía no encontrada');
  }

  if (invoice.tipoDoc !== '09') {
    throw new BadRequestException('Solo se pueden anular Guías de Remisión (tipo 09)');
  }

  if (invoice.status !== 'ACCEPTED' && invoice.status !== 'OBSERVED') {
    throw new BadRequestException(`No se puede anular una guía con estado ${invoice.status}`);
  }

  const { company, solUser, solPass } = await this.prepareDocumentContext(companyId, { skipQuota: true });

  const result = await this.sunatGreClient.anularGuia(
    company.ruc,
    invoice.serie,
    invoice.correlativo,
    dto.motivo,
    solUser,
    solPass,
    company.isBeta,
  );

  if (result.success) {
    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED',
        sunatCode: 'ANULADO',
        sunatMessage: `Guía anulada: ${dto.motivo}`,
      },
    });
  }

  return result;
}
```

**Step 3: Add controller endpoint**

```typescript
@Post(':id/anular-guia')
@ApiOperation({ summary: 'Anular Guía de Remisión en SUNAT' })
async anularGuia(
  @CurrentUser() user: RequestUser,
  @Param('id') id: string,
  @Body() dto: AnularGuiaDto,
) {
  const result = await this.invoicesService.anularGuia(user.companyId, id, dto);
  return { success: result.success, data: result };
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/invoices/invoices.controller.ts src/modules/invoices/invoices.service.ts src/modules/invoices/dto/
git commit -m "feat(invoices): add POST /:id/anular-guia endpoint for GRE cancellation"
```

---

### Task 4: ISC Complete — 3 calculation systems

**Files:**
- Modify: `src/modules/invoices/dto/invoice-item.dto.ts`
- Modify: `src/common/utils/tax-calculator.ts:114-165` (calculateItemTaxes)
- Test: `src/common/utils/__tests__/tax-calculator-isc.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateItemTaxes } from '../tax-calculator.js';

describe('ISC 3 calculation systems', () => {
  it('System 01 — al valor: ISC = baseImponible * tasaISC', () => {
    const result = calculateItemTaxes({
      cantidad: 10,
      valorUnitario: 100,
      tipoAfectacion: '10',
      tipoSistemaISC: '01',
      tasaISC: 0.30, // 30%
    });
    // valorVenta = 10 * 100 = 1000
    // ISC = 1000 * 0.30 = 300
    // IGV = (1000 + 300) * 0.18 = 234
    expect(result.isc).toBe(300);
    expect(result.igv).toBe(234);
  });

  it('System 02 — específico: ISC = cantidad * montoFijoISC', () => {
    const result = calculateItemTaxes({
      cantidad: 24,
      valorUnitario: 5,
      tipoAfectacion: '10',
      tipoSistemaISC: '02',
      montoFijoISC: 2.50, // S/2.50 per unit
    });
    // valorVenta = 24 * 5 = 120
    // ISC = 24 * 2.50 = 60
    // IGV = (120 + 60) * 0.18 = 32.40
    expect(result.isc).toBe(60);
    expect(result.igv).toBe(32.40);
  });

  it('System 03 — al precio de venta al público', () => {
    const result = calculateItemTaxes({
      cantidad: 10,
      valorUnitario: 80,
      tipoAfectacion: '10',
      tipoSistemaISC: '03',
      tasaISC: 0.50, // 50% factor
    });
    // valorVenta = 10 * 80 = 800
    // ISC system 03 = valorVenta * tasaISC / (1 + tasaISC)
    // ISC = 800 * 0.50 / 1.50 = 266.67
    expect(result.isc).toBeCloseTo(266.67, 1);
  });

  it('defaults to system 01 when tipoSistemaISC not specified but isc given', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
      isc: 50, // Pre-calculated ISC
    });
    expect(result.isc).toBe(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-isc.spec.ts`
Expected: FAIL — current code doesn't handle systems 02 and 03

**Step 3: Update calculateItemTaxes in tax-calculator.ts**

Replace the ISC section (around lines 130-140) with:

```typescript
// ISC calculation based on sistema
let isc = 0;
if (input.tipoSistemaISC === '02' && input.montoFijoISC) {
  // Sistema específico: ISC = cantidad * montoFijo
  isc = round2(input.cantidad * input.montoFijoISC);
} else if (input.tipoSistemaISC === '03' && input.tasaISC) {
  // Sistema al precio de venta al público: ISC = valorVenta * tasa / (1 + tasa)
  isc = round2(valorVenta * input.tasaISC / (1 + input.tasaISC));
} else if (input.tipoSistemaISC === '01' && input.tasaISC) {
  // Sistema al valor: ISC = valorVenta * tasa
  isc = round2(valorVenta * input.tasaISC);
} else if (input.isc !== undefined) {
  // Pre-calculated ISC provided directly
  isc = round2(input.isc);
}
```

**Step 4: Add new fields to InvoiceItemDto**

In `invoice-item.dto.ts`, add:

```typescript
  /** Sistema de cálculo ISC: '01' al valor, '02' específico, '03' al precio de venta al público */
  @IsString()
  @IsOptional()
  @IsIn(['01', '02', '03'])
  tipoSistemaISC?: string;

  /** Tasa ISC para sistemas 01 y 03 (e.g. 0.30 para 30%) */
  @IsNumber()
  @IsOptional()
  @Min(0)
  tasaISC?: number;

  /** Monto fijo ISC por unidad para sistema 02 */
  @IsNumber()
  @IsOptional()
  @Min(0)
  montoFijoISC?: number;
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-isc.spec.ts`
Expected: All tests PASS

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/common/utils/tax-calculator.ts src/modules/invoices/dto/invoice-item.dto.ts src/common/utils/__tests__/tax-calculator-isc.spec.ts
git commit -m "feat(tax): ISC 3 calculation systems — al valor, específico, al precio de venta al público"
```

---

### Task 5: IVAP full workflow verification + leyenda

**Files:**
- Modify: `src/modules/xml-builder/builders/invoice.builder.ts` (verify IVAP TaxSubtotal)
- Test: `src/common/utils/__tests__/tax-calculator-ivap.spec.ts`

**Step 1: Write IVAP test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, calculateInvoiceTotals, isIvap } from '../tax-calculator.js';

describe('IVAP (Impuesto Venta Arroz Pilado)', () => {
  it('isIvap returns true for tipo 17', () => {
    expect(isIvap('17')).toBe(true);
  });

  it('calculates 4% IVAP rate for tipo 17', () => {
    const result = calculateItemTaxes({
      cantidad: 100,
      valorUnitario: 10,
      tipoAfectacion: '17', // IVAP
    });
    // valorVenta = 100 * 10 = 1000
    // IVAP = 1000 * 0.04 = 40 (NOT 18% IGV)
    expect(result.igv).toBe(40);
    expect(result.valorVenta).toBe(1000);
  });

  it('aggregates IVAP separately in invoice totals', () => {
    const items = [{
      valorUnitario: 10, precioUnitario: 10.4, valorVenta: 1000,
      igv: 40, isc: 0, icbper: 0, descuento: 0, totalItem: 1040,
    }];
    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['17'],
      descuentoGlobal: 0,
      otrosCargos: 0,
    });
    expect(totals.opIvap).toBe(1000);
    expect(totals.igvIvap).toBe(40);
    expect(totals.opGravadas).toBe(0); // IVAP is separate from regular gravadas
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-ivap.spec.ts`
Expected: PASS if IVAP is already implemented correctly

**Step 3: Verify invoice.builder adds leyenda 2007 for IVAP**

In `invoice.builder.ts` build() method, in the legends section, ensure:

```typescript
// Add leyenda 2007 for IVAP operations
if (data.opIvap && data.opIvap > 0) {
  this.addLegend(doc, '2007', 'Operación sujeta al IVAP');
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/xml-builder/builders/invoice.builder.ts src/common/utils/__tests__/tax-calculator-ivap.spec.ts
git commit -m "feat(ivap): verify IVAP workflow, add leyenda 2007, and unit tests"
```

---

## Sprint 3 Summary

After completing all 5 tasks:
- Consulta CDR: SOAP method + POST /consulta-cdr endpoint
- Anulación GRE: POST /:id/anular-guia endpoint exposing existing method
- ISC: All 3 calculation systems (al valor, específico, PVP) with tests
- IVAP: Verified 4% rate, separate aggregation, leyenda 2007
- New tests for ISC and IVAP calculations

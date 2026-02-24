# Sprint 4 — Medium Priority Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement export invoices, batch operations, complete gratuitous operations, dashboard/reportes, and expand test coverage.

**Architecture:** Add new endpoint patterns for batch and dashboard, enhance existing builders for export and gratuitous operations, create comprehensive test suites for XML builders.

**Tech Stack:** TypeScript, NestJS 11, BullMQ, Prisma 7, xmlbuilder2, Vitest

**Depends on:** Sprint 1-3 (catalogs, DB columns, tax calculator enhancements)

---

### Task 1: Export Invoice — Tax Calculator + Constants

**Files:**
- Modify: `src/common/utils/tax-calculator.ts` (isExportacion already exists at line 61-63)
- Modify: `src/common/constants/index.ts` (TIPO_OPERACION already has some export codes from Sprint 1)
- Test: `src/common/utils/__tests__/tax-calculator-export.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, calculateInvoiceTotals, isExportacion } from '../tax-calculator.js';

describe('Export invoice calculations', () => {
  it('isExportacion returns true for tipo 40', () => {
    expect(isExportacion('40')).toBe(true);
  });

  it('calculates 0% IGV for export items', () => {
    const result = calculateItemTaxes({
      cantidad: 100,
      valorUnitario: 50,
      tipoAfectacion: '40', // Exportación
    });
    expect(result.igv).toBe(0);
    expect(result.valorVenta).toBe(5000);
  });

  it('aggregates export totals separately', () => {
    const items = [{
      valorUnitario: 50, precioUnitario: 50, valorVenta: 5000,
      igv: 0, isc: 0, icbper: 0, descuento: 0, totalItem: 5000,
    }];
    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['40'],
      descuentoGlobal: 0,
      otrosCargos: 0,
    });
    expect(totals.opGravadas).toBe(0);
    expect(totals.opExoneradas).toBe(0);
    expect(totals.opInafectas).toBe(0);
    // Export should be tracked — verify it doesn't get lumped with inafectas
    expect(totals.totalVenta).toBe(5000);
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-export.spec.ts`
Expected: Check if existing code already handles exportación correctly

**Step 3: If needed, update calculateInvoiceTotals**

Add export tracking to `calculateInvoiceTotals` if not already present. Add `opExportacion` to the return type and calculation:

```typescript
// In the totals aggregation loop, add:
let opExportacion = 0;
// ...in the loop:
if (isExportacion(tipo)) {
  opExportacion += item.valorVenta;
}

// Return:
return { ...existing, opExportacion };
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/common/utils/tax-calculator.ts src/common/utils/__tests__/tax-calculator-export.spec.ts
git commit -m "feat(tax): export invoice calculations with opExportacion tracking"
```

---

### Task 2: Export Invoice — Builder + Service + Validator

**Files:**
- Modify: `src/modules/xml-builder/builders/invoice.builder.ts` (add TaxScheme 9995 for exports)
- Modify: `src/modules/xml-builder/validators/xml-validator.ts` (export-specific rules)
- Modify: `src/modules/invoices/invoices.service.ts` (handle export tipoOperacion)

**Step 1: Update invoice builder**

In `invoice.builder.ts`, in the tax totals section (around line 182-194), add export tax scheme if opExportacion > 0:

```typescript
// After existing addTaxTotal calls:
if (data.opExportacion && data.opExportacion > 0) {
  // TaxScheme 9995 — Exportación (0% tax)
  this.addTaxTotal(doc, {
    amount: 0,
    taxableAmount: data.opExportacion,
    taxId: '9995',
    taxName: 'EXP',
    taxTypeCode: 'FRE',
    percent: 0,
    currencyId: data.moneda,
  });
}
```

Add `opExportacion` to XmlInvoiceData interface if not already present:

```typescript
// In xml-builder.interfaces.ts, XmlInvoiceData:
opExportacion?: number;
```

**Step 2: Add export validation rules**

In `xml-validator.ts`, add in validateInvoice:

```typescript
// Export validation: all items must have tipoAfectacion '40'
const exportOps = ['0200', '0201', '0202', '0203', '0204', '0205', '0206', '0207', '0208'];
if (exportOps.includes(data.tipoOperacion)) {
  for (const [idx, item] of (data.items || []).entries()) {
    if (item.tipoAfectacion !== '40') {
      errors.push({
        field: `items[${idx}].tipoAfectacion`,
        message: `Factura de exportación requiere tipoAfectacion '40' en todos los items, item ${idx} tiene '${item.tipoAfectacion}'`,
      });
    }
  }
  if ((data.igv || 0) !== 0) {
    errors.push({
      field: 'igv',
      message: 'Factura de exportación no debe tener IGV',
    });
  }
}
```

**Step 3: Update service to handle export**

In `invoices.service.ts` createFactura, add opExportacion to the XML data and DB persistence:

```typescript
// Pass to XML builder:
opExportacion: totals.opExportacion ?? 0,

// Persist in DB:
opExportacion: totals.opExportacion ?? 0,
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/xml-builder/builders/invoice.builder.ts src/modules/xml-builder/interfaces/xml-builder.interfaces.ts src/modules/xml-builder/validators/xml-validator.ts src/modules/invoices/invoices.service.ts
git commit -m "feat(export): export invoice support — TaxScheme 9995, validation, opExportacion"
```

---

### Task 3: Batch Operations — Endpoint + Queue Processing

**Files:**
- Modify: `src/modules/invoices/invoices.controller.ts`
- Modify: `src/modules/invoices/invoices.service.ts`
- Create: `src/modules/invoices/dto/batch-invoice.dto.ts`

**Step 1: Create batch DTO**

```typescript
// src/modules/invoices/dto/batch-invoice.dto.ts
import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto.js';

export class BatchInvoiceDto {
  @ApiProperty({ type: [CreateInvoiceDto], description: 'Array of invoices to process (max 50)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDto)
  invoices!: CreateInvoiceDto[];
}

export interface BatchInvoiceResult {
  index: number;
  success: boolean;
  invoiceId?: string;
  serie?: string;
  correlativo?: number;
  error?: string;
}
```

**Step 2: Add service method**

```typescript
async createBatch(
  companyId: string,
  dto: BatchInvoiceDto,
): Promise<BatchInvoiceResult[]> {
  const results: BatchInvoiceResult[] = [];

  for (const [index, invoiceDto] of dto.invoices.entries()) {
    try {
      const response = invoiceDto.tipoDoc === '03'
        ? await this.createBoleta(companyId, invoiceDto)
        : await this.createFactura(companyId, invoiceDto);

      results.push({
        index,
        success: true,
        invoiceId: response.id,
        serie: response.serie,
        correlativo: response.correlativo,
      });
    } catch (error: any) {
      results.push({
        index,
        success: false,
        error: error.message ?? 'Error desconocido',
      });
    }
  }

  return results;
}
```

**Step 3: Add controller endpoint**

```typescript
@Post('batch')
@ApiOperation({ summary: 'Envío masivo de facturas/boletas (máx 50)' })
async createBatch(
  @CurrentUser() user: RequestUser,
  @Body() dto: BatchInvoiceDto,
) {
  const results = await this.invoicesService.createBatch(user.companyId, dto);
  const allSuccess = results.every(r => r.success);
  return {
    success: allSuccess,
    data: results,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    },
  };
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/modules/invoices/invoices.controller.ts src/modules/invoices/invoices.service.ts src/modules/invoices/dto/
git commit -m "feat(invoices): add POST /batch endpoint for bulk invoice processing (max 50)"
```

---

### Task 4: Gratuitous Operations Complete

**Files:**
- Modify: `src/common/utils/tax-calculator.ts` (verify gratuita handling)
- Modify: `src/modules/xml-builder/builders/invoice.builder.ts` (auto-leyenda for free ops)
- Modify: `src/modules/xml-builder/validators/xml-validator.ts` (validate valorReferencial)
- Modify: `src/modules/invoices/dto/invoice-item.dto.ts` (add valorReferencial field)
- Test: `src/common/utils/__tests__/tax-calculator-gratuitas.spec.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, isGratuita } from '../tax-calculator.js';

describe('Gratuitous operations', () => {
  it('types 11-16 are gravado-gratuito (IGV calculated)', () => {
    for (const tipo of ['11', '12', '13', '14', '15', '16']) {
      expect(isGratuita(tipo)).toBe(true);
      const result = calculateItemTaxes({
        cantidad: 1,
        valorUnitario: 100,
        tipoAfectacion: tipo,
      });
      // Gravado gratuito: IGV IS calculated (but charged to issuer)
      expect(result.igv).toBe(18); // 100 * 0.18
      expect(result.precioUnitario).toBe(0); // Free to buyer
    }
  });

  it('types 31-36 are inafecto-gratuito (no IGV)', () => {
    for (const tipo of ['31', '32', '33', '34', '35', '36']) {
      expect(isGratuita(tipo)).toBe(true);
      const result = calculateItemTaxes({
        cantidad: 1,
        valorUnitario: 100,
        tipoAfectacion: tipo,
      });
      // Inafecto gratuito: NO IGV
      expect(result.igv).toBe(0);
      expect(result.precioUnitario).toBe(0);
    }
  });

  it('type 21 is exonerado-gratuito', () => {
    expect(isGratuita('21')).toBe(true);
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '21',
    });
    expect(result.igv).toBe(0);
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/common/utils/__tests__/tax-calculator-gratuitas.spec.ts`
Expected: Check if passes. If gravado-gratuito types (11-16) don't calculate IGV, fix.

**Step 3: Update tax calculator if needed**

Verify that types 11-16 calculate IGV at 18% and types 21, 31-36 calculate 0%. The current `isGratuita()` function (lines 76-83) should check this. Update `calculateItemTaxes` to distinguish:

```typescript
// In calculateItemTaxes, IGV section:
const isGravadoGratuito = code >= 11 && code <= 16;
const isInafectoGratuito = code >= 31 && code <= 36;
const isExoneradoGratuito = code === 21;

if (isGravadoGratuito) {
  // IGV calculated (charged to issuer, not buyer)
  igv = round2(baseImponible * IGV_RATE);
  precioUnitario = 0; // Free to buyer
} else if (isInafectoGratuito || isExoneradoGratuito) {
  igv = 0;
  precioUnitario = 0;
}
```

**Step 4: Add valorReferencial to item DTO**

In `invoice-item.dto.ts`:

```typescript
  /** Valor referencial unitario — obligatorio para operaciones gratuitas */
  @IsNumber()
  @IsOptional()
  @Min(0)
  valorReferencial?: number;
```

**Step 5: Add auto-leyenda for gratuitous operations**

In `invoice.builder.ts` build() method, in legends section:

```typescript
// Auto-add leyenda for free operations
if (data.opGratuitas && data.opGratuitas > 0) {
  const leyendaCode = data.tipoDoc === '03' ? '2001' : '1002';
  this.addLegend(doc, leyendaCode, 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE');
}
```

**Step 6: Add validator rule for valorReferencial**

In `xml-validator.ts` validateItems, add:

```typescript
// Gratuitous items must have valorReferencial > 0
if (isGratuita(item.tipoAfectacion) && (!item.valorReferencial || item.valorReferencial <= 0)) {
  errors.push({
    field: `items[${idx}].valorReferencial`,
    message: `Item gratuito (tipo ${item.tipoAfectacion}) requiere valorReferencial > 0`,
  });
}
```

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add src/common/utils/tax-calculator.ts src/modules/xml-builder/builders/invoice.builder.ts src/modules/xml-builder/validators/xml-validator.ts src/modules/invoices/dto/invoice-item.dto.ts src/common/utils/__tests__/tax-calculator-gratuitas.spec.ts
git commit -m "feat(gratuitas): complete gratuitous operations — gravado vs inafecto, valorReferencial, auto-leyenda"
```

---

### Task 5: Dashboard Module — Summary + Monthly Report

**Files:**
- Create: `src/modules/dashboard/dashboard.module.ts`
- Create: `src/modules/dashboard/dashboard.controller.ts`
- Create: `src/modules/dashboard/dashboard.service.ts`
- Modify: `src/app.module.ts` (import DashboardModule)

**Step 1: Create dashboard service**

```typescript
// src/modules/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(companyId: string, from?: string, to?: string) {
    const where: any = { companyId };
    if (from || to) {
      where.fechaEmision = {};
      if (from) where.fechaEmision.gte = new Date(from);
      if (to) where.fechaEmision.lte = new Date(to);
    }

    const [byStatus, byType, totals] = await Promise.all([
      this.prisma.client.invoice.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.client.invoice.groupBy({
        by: ['tipoDoc'],
        where,
        _count: true,
        _sum: { totalVenta: true },
      }),
      this.prisma.client.invoice.aggregate({
        where,
        _count: true,
        _sum: { totalVenta: true, igv: true },
      }),
    ]);

    return { byStatus, byType, totals };
  }

  async getMonthlyReport(companyId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const invoices = await this.prisma.client.invoice.findMany({
      where: {
        companyId,
        fechaEmision: { gte: from, lte: to },
        status: { in: ['ACCEPTED', 'OBSERVED'] },
      },
      select: {
        tipoDoc: true,
        serie: true,
        correlativo: true,
        clienteNumDoc: true,
        clienteNombre: true,
        opGravadas: true,
        opExoneradas: true,
        opInafectas: true,
        igv: true,
        isc: true,
        icbper: true,
        totalVenta: true,
        moneda: true,
        fechaEmision: true,
      },
      orderBy: [{ tipoDoc: 'asc' }, { serie: 'asc' }, { correlativo: 'asc' }],
    });

    const summary = {
      totalGravadas: invoices.reduce((acc, i) => acc + Number(i.opGravadas), 0),
      totalExoneradas: invoices.reduce((acc, i) => acc + Number(i.opExoneradas), 0),
      totalInafectas: invoices.reduce((acc, i) => acc + Number(i.opInafectas), 0),
      totalIgv: invoices.reduce((acc, i) => acc + Number(i.igv), 0),
      totalIsc: invoices.reduce((acc, i) => acc + Number(i.isc), 0),
      totalIcbper: invoices.reduce((acc, i) => acc + Number(i.icbper), 0),
      totalVenta: invoices.reduce((acc, i) => acc + Number(i.totalVenta), 0),
      documentCount: invoices.length,
    };

    return { period: `${year}-${String(month).padStart(2, '0')}`, summary, invoices };
  }
}
```

**Step 2: Create controller**

```typescript
// src/modules/dashboard/dashboard.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';
import { CurrentUser } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/interfaces/index.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen de emisión por estado y tipo' })
  async getSummary(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.dashboardService.getSummary(user.companyId, from, to);
    return { success: true, data };
  }

  @Get('monthly-report')
  @ApiOperation({ summary: 'Reporte mensual para PDT 621' })
  async getMonthlyReport(
    @CurrentUser() user: RequestUser,
    @Query('year') year: number,
    @Query('month') month: number,
  ) {
    const data = await this.dashboardService.getMonthlyReport(user.companyId, year, month);
    return { success: true, data };
  }
}
```

**Step 3: Create module**

```typescript
// src/modules/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

**Step 4: Import in AppModule**

Add `DashboardModule` to the imports array in `src/app.module.ts`.

**Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/modules/dashboard/ src/app.module.ts
git commit -m "feat(dashboard): add summary and monthly report endpoints for PDT 621"
```

---

### Task 6: XML Builder Tests — Invoice Builder

**Files:**
- Create: `src/modules/xml-builder/builders/__tests__/invoice.builder.spec.ts`

**Step 1: Write comprehensive tests**

```typescript
import { describe, it, expect } from 'vitest';
import { InvoiceBuilder } from '../invoice.builder.js';
import type { XmlInvoiceData } from '../../interfaces/xml-builder.interfaces.js';

describe('InvoiceBuilder', () => {
  const builder = new InvoiceBuilder();

  const makeInvoiceData = (overrides: Partial<XmlInvoiceData> = {}): XmlInvoiceData => ({
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    tipoOperacion: '0101',
    fechaEmision: '2026-02-24',
    horaEmision: '10:00:00',
    moneda: 'PEN',
    company: {
      ruc: '20000000001',
      razonSocial: 'Test SAC',
      nombreComercial: 'Test',
      direccion: 'Av Test 123',
      ubigeo: '150101',
      departamento: 'Lima',
      provincia: 'Lima',
      distrito: 'Lima',
      codigoPais: 'PE',
    },
    client: { tipoDoc: '6', numDoc: '20100000002', nombre: 'Cliente SAC' },
    items: [{
      cantidad: 10, unidadMedida: 'NIU', descripcion: 'Producto Test',
      valorUnitario: 100, precioUnitario: 118, valorVenta: 1000,
      tipoAfectacion: '10', igv: 180, isc: 0, icbper: 0, descuento: 0,
    }],
    opGravadas: 1000, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
    igv: 180, isc: 0, icbper: 0, otrosCargos: 0, descuentoGlobal: 0,
    totalVenta: 1180,
    formaPago: { tipo: 'Contado' },
    montoEnLetras: 'MIL CIENTO OCHENTA CON 00/100 SOLES',
    ...overrides,
  });

  it('generates valid XML for a basic Factura (01)', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('Invoice');
    expect(xml).toContain('F001');
    expect(xml).toContain('20000000001');
    expect(xml).toContain('1180');
  });

  it('generates valid XML for a Boleta (03)', () => {
    const xml = builder.build(makeInvoiceData({ tipoDoc: '03', serie: 'B001' }));
    expect(xml).toContain('B001');
    expect(xml).toContain('03');
  });

  it('includes detracción PaymentMeans when present', () => {
    const xml = builder.build(makeInvoiceData({
      tipoOperacion: '1001',
      detraccion: {
        codigo: '037', porcentaje: 0.12, monto: 141.60, cuentaBN: '00-000-000001',
      },
    }));
    expect(xml).toContain('PaymentMeans');
    expect(xml).toContain('Detraccion');
    expect(xml).toContain('037');
    expect(xml).toContain('00-000-000001');
  });

  it('includes PrepaidPayment for anticipos', () => {
    const xml = builder.build(makeInvoiceData({
      anticipos: [{
        tipoDoc: '02', serie: 'F001', correlativo: 1,
        moneda: 'PEN', monto: 500, fechaPago: '2026-01-15',
      }],
    }));
    expect(xml).toContain('PrepaidPayment');
    expect(xml).toContain('02-F001-1');
    expect(xml).toContain('500');
  });

  it('includes AdditionalDocumentReference for related docs', () => {
    const xml = builder.build(makeInvoiceData({
      documentosRelacionados: [{ tipoDoc: '01', numero: 'F001-1' }],
    }));
    expect(xml).toContain('AdditionalDocumentReference');
    expect(xml).toContain('F001-1');
  });

  it('includes Contado payment terms', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('Contado');
  });

  it('includes Credito payment terms with cuotas', () => {
    const xml = builder.build(makeInvoiceData({
      formaPago: {
        tipo: 'Credito',
        monto: 1180,
        cuotas: [
          { monto: 590, moneda: 'PEN', fechaPago: '2026-03-24' },
          { monto: 590, moneda: 'PEN', fechaPago: '2026-04-24' },
        ],
      },
    }));
    expect(xml).toContain('Credito');
    expect(xml).toContain('Cuota001');
    expect(xml).toContain('Cuota002');
  });

  it('includes leyenda 2006 for detracción', () => {
    const xml = builder.build(makeInvoiceData({
      tipoOperacion: '1001',
      detraccion: {
        codigo: '037', porcentaje: 0.12, monto: 141.60, cuentaBN: '00-000-000001',
      },
    }));
    expect(xml).toContain('2006');
    expect(xml).toContain('sujeta a detracción');
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/modules/xml-builder/builders/__tests__/invoice.builder.spec.ts`
Expected: All tests PASS (testing existing builder behavior)

**Step 3: Commit**

```bash
git add src/modules/xml-builder/builders/__tests__/invoice.builder.spec.ts
git commit -m "test(xml-builder): comprehensive unit tests for InvoiceBuilder"
```

---

### Task 7: XML Builder Tests — Credit Note + Debit Note

**Files:**
- Create: `src/modules/xml-builder/builders/__tests__/credit-note.builder.spec.ts`
- Create: `src/modules/xml-builder/builders/__tests__/debit-note.builder.spec.ts`

**Step 1: Write credit note tests**

```typescript
import { describe, it, expect } from 'vitest';
import { CreditNoteBuilder } from '../credit-note.builder.js';

describe('CreditNoteBuilder', () => {
  const builder = new CreditNoteBuilder();

  it('generates valid XML for a credit note (07)', () => {
    const xml = builder.build({
      tipoDoc: '07',
      serie: 'FC01',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      horaEmision: '10:00:00',
      moneda: 'PEN',
      motivoCodigo: '01',
      motivoDescripcion: 'Anulación de la operación',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      company: {
        ruc: '20000000001', razonSocial: 'Test SAC', nombreComercial: 'Test',
        direccion: 'Av Test', ubigeo: '150101', departamento: 'Lima',
        provincia: 'Lima', distrito: 'Lima', codigoPais: 'PE',
      },
      client: { tipoDoc: '6', numDoc: '20100000002', nombre: 'Cliente SAC' },
      items: [{
        cantidad: 10, unidadMedida: 'NIU', descripcion: 'Producto',
        valorUnitario: 100, precioUnitario: 118, valorVenta: 1000,
        tipoAfectacion: '10', igv: 180, isc: 0, icbper: 0, descuento: 0,
      }],
      opGravadas: 1000, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
      igv: 180, isc: 0, icbper: 0, otrosCargos: 0, descuentoGlobal: 0,
      totalVenta: 1180,
      montoEnLetras: 'MIL CIENTO OCHENTA CON 00/100 SOLES',
    });
    expect(xml).toContain('CreditNote');
    expect(xml).toContain('FC01');
    expect(xml).toContain('01'); // motivoCodigo
    expect(xml).toContain('F001'); // doc reference
  });
});
```

**Step 2: Write debit note tests**

```typescript
import { describe, it, expect } from 'vitest';
import { DebitNoteBuilder } from '../debit-note.builder.js';

describe('DebitNoteBuilder', () => {
  const builder = new DebitNoteBuilder();

  it('generates valid XML for a debit note (08)', () => {
    const xml = builder.build({
      tipoDoc: '08',
      serie: 'FD01',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      horaEmision: '10:00:00',
      moneda: 'PEN',
      motivoCodigo: '01',
      motivoDescripcion: 'Intereses por mora',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      company: {
        ruc: '20000000001', razonSocial: 'Test SAC', nombreComercial: 'Test',
        direccion: 'Av Test', ubigeo: '150101', departamento: 'Lima',
        provincia: 'Lima', distrito: 'Lima', codigoPais: 'PE',
      },
      client: { tipoDoc: '6', numDoc: '20100000002', nombre: 'Cliente SAC' },
      items: [{
        cantidad: 1, unidadMedida: 'ZZ', descripcion: 'Intereses',
        valorUnitario: 50, precioUnitario: 59, valorVenta: 50,
        tipoAfectacion: '10', igv: 9, isc: 0, icbper: 0, descuento: 0,
      }],
      opGravadas: 50, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
      igv: 9, isc: 0, icbper: 0, otrosCargos: 0, descuentoGlobal: 0,
      totalVenta: 59,
      montoEnLetras: 'CINCUENTA Y NUEVE CON 00/100 SOLES',
    });
    expect(xml).toContain('DebitNote');
    expect(xml).toContain('FD01');
    expect(xml).toContain('01'); // motivoCodigo
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/modules/xml-builder/builders/__tests__/`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/modules/xml-builder/builders/__tests__/
git commit -m "test(xml-builder): unit tests for CreditNoteBuilder and DebitNoteBuilder"
```

---

### Task 8: XML Validator Tests

**Files:**
- The test file created in Sprint 1 Task 6 covers deep validation
- Extend with: `src/modules/xml-builder/validators/__tests__/xml-validator-complete.spec.ts`

**Step 1: Write comprehensive validator tests**

```typescript
import { describe, it, expect } from 'vitest';
import { XmlValidator } from '../xml-validator.js';

describe('XmlValidator — all document types', () => {
  const validator = new XmlValidator();

  describe('validateCreditNote', () => {
    it('rejects invalid motivo code', () => {
      const errors = validator.validateCreditNote({
        tipoDoc: '07', serie: 'FC01', correlativo: 1,
        fechaEmision: new Date().toISOString().split('T')[0],
        moneda: 'PEN', motivoCodigo: '99', // invalid
        docRefTipo: '01', docRefSerie: 'F001', docRefCorrelativo: 1,
        items: [{ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10', descripcion: 'X', unidadMedida: 'NIU' }],
      } as any);
      expect(errors.some(e => e.field === 'motivoCodigo')).toBe(true);
    });
  });

  describe('validateDebitNote', () => {
    it('rejects invalid motivo code', () => {
      const errors = validator.validateDebitNote({
        tipoDoc: '08', serie: 'FD01', correlativo: 1,
        fechaEmision: new Date().toISOString().split('T')[0],
        moneda: 'PEN', motivoCodigo: '99',
        docRefTipo: '01', docRefSerie: 'F001', docRefCorrelativo: 1,
        items: [{ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10', descripcion: 'X', unidadMedida: 'NIU' }],
      } as any);
      expect(errors.some(e => e.field === 'motivoCodigo')).toBe(true);
    });
  });

  describe('validateVoided', () => {
    it('rejects voiding unsupported document types', () => {
      const errors = validator.validateVoided({
        fechaEmision: new Date().toISOString().split('T')[0],
        fechaReferencia: new Date().toISOString().split('T')[0],
        correlativo: 1,
        company: { ruc: '20000000001' },
        items: [{
          serie: 'T001', correlativo: 1, tipoDoc: '09', // GRE can't be voided via RA
          motivo: 'Error',
        }],
      } as any);
      expect(errors.some(e => e.message.includes('tipo de documento'))).toBe(true);
    });
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/modules/xml-builder/validators/__tests__/`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/modules/xml-builder/validators/__tests__/
git commit -m "test(validator): comprehensive tests for credit note, debit note, and voided validators"
```

---

## Sprint 4 Summary

After completing all 8 tasks:
- Export invoices (0200-0208): Full workflow with TaxScheme 9995
- Batch operations: POST /batch for up to 50 invoices
- Gratuitous operations: gravado-gratuito (11-16) vs inafecto-gratuito (31-37), valorReferencial, auto-leyenda
- Dashboard: Summary + monthly report endpoints for PDT 621
- Test coverage: InvoiceBuilder, CreditNoteBuilder, DebitNoteBuilder, XmlValidator comprehensive tests

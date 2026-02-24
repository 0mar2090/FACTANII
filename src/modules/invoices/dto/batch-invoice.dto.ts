import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto.js';

export class BatchInvoiceDto {
  @ApiProperty({
    description: 'Array of invoice DTOs to process in batch (max 50)',
    type: [CreateInvoiceDto],
    minItems: 1,
    maxItems: 50,
  })
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
  /** True when item was skipped as a duplicate of an earlier batch item */
  skipped?: boolean;
  /** Human-readable reason for skipping (e.g. "Duplicate of batch item 0") */
  skippedReason?: string;
}

/**
 * Generates a fingerprint for an invoice DTO to detect duplicates within a batch.
 * Two items are considered duplicates when they share the same tipoDoc, client document,
 * emission date, and identical first-item description + cantidad.
 */
export function batchItemFingerprint(dto: {
  tipoDoc?: string;
  clienteNumDoc: string;
  fechaEmision: string;
  items: { descripcion: string; cantidad: number; valorUnitario: number }[];
}): string {
  const tipoDoc = dto.tipoDoc ?? '01';
  const firstItem = dto.items[0];
  const itemCount = dto.items.length;
  return [
    tipoDoc,
    dto.clienteNumDoc,
    dto.fechaEmision,
    itemCount.toString(),
    firstItem?.descripcion ?? '',
    firstItem?.cantidad?.toString() ?? '',
    firstItem?.valorUnitario?.toString() ?? '',
  ].join('|');
}
